/**
 * avro-gen CLI
 *
 * Scans TypeScript source files for exported interfaces/types and generates
 * a pre-compiled Avro schema manifest (JSON).  This eliminates runtime CPU
 * overhead for schema inference.
 *
 * Usage:
 *   avro-gen --input src/types --output schemas.json
 *   avro-gen -i src/api/interfaces.ts -o avro-manifest.json
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, extname, relative } from 'node:path';

// ── Types for the generator ──────────────────────────────────────────

interface AvroField {
  name: string;
  type: string | AvroRecord | AvroArray | string[];
  default?: unknown;
}

interface AvroRecord {
  type: 'record';
  name: string;
  fields: AvroField[];
}

interface AvroArray {
  type: 'array';
  items: string | AvroRecord;
}

type SchemaManifest = Record<string, AvroRecord>;

// ── CLI Entry ────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  const config = parseArgs(args);

  if (config.help) {
    printUsage();
    process.exit(0);
  }

  if (!config.input) {
    console.error('Error: --input (-i) is required.');
    printUsage();
    process.exit(1);
  }

  const files = collectTsFiles(config.input);
  if (files.length === 0) {
    console.error(`No .ts files found in "${config.input}".`);
    process.exit(1);
  }

  console.log(`Scanning ${files.length} TypeScript file(s)...`);

  const manifest: SchemaManifest = {};

  for (const file of files) {
    const source = readFileSync(file, 'utf-8');
    const schemas = extractInterfaces(source, file, config.input);

    for (const [key, schema] of Object.entries(schemas)) {
      manifest[key] = schema;
    }
  }

  const count = Object.keys(manifest).length;
  if (count === 0) {
    console.warn('Warning: No exported interfaces found.');
    process.exit(0);
  }

  const output = config.output ?? 'avro-manifest.json';
  writeFileSync(output, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`Generated ${count} schema(s) → ${output}`);
}

// ── Argument Parsing ─────────────────────────────────────────────────

interface CliConfig {
  input?: string;
  output?: string;
  help: boolean;
}

function parseArgs(args: string[]): CliConfig {
  const config: CliConfig = { help: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '-i':
      case '--input':
        config.input = args[++i];
        break;
      case '-o':
      case '--output':
        config.output = args[++i];
        break;
      case '-h':
      case '--help':
        config.help = true;
        break;
    }
  }

  return config;
}

function printUsage(): void {
  console.log(`
avro-gen — AvroStream Schema Manifest Generator

Usage:
  avro-gen --input <path> [--output <file>]

Options:
  -i, --input   Path to a .ts file or directory of .ts files (required)
  -o, --output  Output JSON manifest path (default: avro-manifest.json)
  -h, --help    Show this help message
`);
}

// ── File Collection ──────────────────────────────────────────────────

function collectTsFiles(input: string): string[] {
  const resolved = resolve(input);
  const stat = statSync(resolved, { throwIfNoEntry: false });

  if (!stat) {
    console.error(`Path does not exist: ${resolved}`);
    process.exit(1);
  }

  if (stat.isFile()) {
    return extname(resolved) === '.ts' ? [resolved] : [];
  }

  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      const s = statSync(full);
      if (s.isDirectory()) {
        walk(full);
      } else if (extname(full) === '.ts' && !full.endsWith('.d.ts') && !full.endsWith('.test.ts')) {
        files.push(full);
      }
    }
  };
  walk(resolved);
  return files;
}

// ── Interface Extraction (balanced-brace, no TS compiler dependency) ─

/**
 * Extract an interface body using a balanced-brace scan.
 * Returns the body text (between the outer braces) and the position after the closing brace.
 */
function extractInterfaceBody(
  source: string,
  searchFrom: number,
): { body: string; end: number } | null {
  let i = searchFrom;
  while (i < source.length && source[i] !== '{') i++;
  if (i >= source.length) return null;

  let depth = 0;
  let start = -1;
  for (; i < source.length; i++) {
    if (source[i] === '{') {
      depth++;
      if (depth === 1) start = i + 1;
    } else if (source[i] === '}') {
      depth--;
      if (depth === 0) return { body: source.slice(start, i), end: i + 1 };
    }
  }
  return null;
}

/**
 * Extractor for exported interfaces.
 * Uses balanced-brace scanning so nested-object field types don't truncate the body.
 * For complex generics or utility types, users should provide schemas manually.
 */
function extractInterfaces(
  source: string,
  filePath: string,
  basePath: string,
): SchemaManifest {
  const manifest: SchemaManifest = {};

  // Find each `export interface Name` occurrence, then extract the body.
  const headerRegex = /export\s+interface\s+(\w+)\s*/g;

  let match: RegExpExecArray | null;
  while ((match = headerRegex.exec(source)) !== null) {
    const name = match[1]!;
    const extracted = extractInterfaceBody(source, match.index + match[0].length);
    if (!extracted) continue;

    const fields = parseFields(extracted.body);
    const key = `${relative(resolve(basePath), filePath).replace(/\.ts$/, '')}:${name}`;

    manifest[key] = {
      type: 'record',
      name,
      fields,
    };

    // Advance past the interface body to avoid re-scanning inside it.
    headerRegex.lastIndex = extracted.end;
  }

  return manifest;
}

function parseFields(body: string): AvroField[] {
  const fields: AvroField[] = [];
  // Match: fieldName: Type; or fieldName?: Type;
  // Skip lines that contain a '{' in the type — inline object types are mapped to 'string'.
  const fieldRegex = /(\w+)(\?)?\s*:\s*([^;]+)/g;

  let match: RegExpExecArray | null;
  while ((match = fieldRegex.exec(body)) !== null) {
    const name = match[1]!;
    const optional = match[2] === '?';
    const tsType = match[3]!.trim();

    // Inline object types (contain '{') are out of scope — map to 'string'.
    const avroType = tsType.includes('{') ? 'string' : mapTsTypeToAvro(tsType);

    if (optional) {
      fields.push({
        name,
        type: ['null', typeof avroType === 'string' ? avroType : 'string'],
        default: null,
      });
    } else {
      fields.push({ name, type: avroType });
    }
  }

  return fields;
}

function mapTsTypeToAvro(tsType: string): string | AvroArray {
  switch (tsType) {
    case 'string':
      return 'string';
    case 'number':
      return 'double';
    case 'boolean':
      return 'boolean';
    case 'bigint':
      return 'long';
    default: {
      // Handle string[] or Array<string>
      const arrayMatch = /^(?:Array<(\w+)>|(\w+)\[\])$/.exec(tsType);
      if (arrayMatch) {
        const itemType = arrayMatch[1] ?? arrayMatch[2] ?? 'string';
        return { type: 'array', items: mapTsTypeToAvro(itemType) as string };
      }
      // Default to string for unrecognized types.
      return 'string';
    }
  }
}

main();
