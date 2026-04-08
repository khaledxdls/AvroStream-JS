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

// ── Interface Extraction (Regex-based, no TS compiler dependency) ────

/**
 * Simple regex-based extractor for exported interfaces.
 * This is intentionally kept lightweight — it handles the common case of
 * flat interfaces with primitive fields.  For complex generics or utility
 * types, users should provide schemas manually.
 */
function extractInterfaces(
  source: string,
  filePath: string,
  basePath: string,
): SchemaManifest {
  const manifest: SchemaManifest = {};

  // Match: export interface Foo { ... }
  const interfaceRegex = /export\s+interface\s+(\w+)\s*\{([^}]+)\}/g;

  let match: RegExpExecArray | null;
  while ((match = interfaceRegex.exec(source)) !== null) {
    const name = match[1]!;
    const body = match[2]!;
    const fields = parseFields(body);

    const key = `${relative(resolve(basePath), filePath).replace(/\.ts$/, '')}:${name}`;

    manifest[key] = {
      type: 'record',
      name,
      fields,
    };
  }

  return manifest;
}

function parseFields(body: string): AvroField[] {
  const fields: AvroField[] = [];
  // Match: fieldName: Type; or fieldName?: Type;
  const fieldRegex = /(\w+)(\?)?\s*:\s*([^;]+)/g;

  let match: RegExpExecArray | null;
  while ((match = fieldRegex.exec(body)) !== null) {
    const name = match[1]!;
    const optional = match[2] === '?';
    const tsType = match[3]!.trim();
    const avroType = mapTsTypeToAvro(tsType);

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
