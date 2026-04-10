/**
 * Debug Logger
 *
 * When enabled, intercepts and logs human-readable representations of
 * binary payloads, including "bytes saved" metrics vs. equivalent JSON.
 */

export interface DebugMetrics {
  readonly direction: 'outgoing' | 'incoming';
  readonly path: string;
  readonly schemaName: string;
  readonly jsonBytes: number;
  readonly avroBytes: number;
  readonly savedBytes: number;
  readonly savedPercent: string;
  readonly payload: Record<string, unknown>;
}

export class DebugLogger {
  private readonly _enabled: boolean;
  private readonly _onMetrics: ((metrics: DebugMetrics) => void) | undefined;

  constructor(enabled: boolean, onMetrics?: (metrics: DebugMetrics) => void) {
    this._enabled = enabled;
    this._onMetrics = onMetrics;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  /**
   * Log a request/response payload with byte-savings metrics.
   */
  log(
    direction: 'outgoing' | 'incoming',
    path: string,
    schemaName: string,
    payload: Record<string, unknown>,
    avroBinaryLength: number,
  ): void {
    if (!this._enabled && !this._onMetrics) return;

    const jsonStr = JSON.stringify(payload);
    const jsonBytes = typeof Buffer !== 'undefined'
      ? Buffer.byteLength(jsonStr, 'utf8')
      : new TextEncoder().encode(jsonStr).length;
    const savedBytes = jsonBytes - avroBinaryLength;
    const savedPercent =
      jsonBytes > 0 ? ((savedBytes / jsonBytes) * 100).toFixed(1) : '0.0';

    const metrics: DebugMetrics = {
      direction,
      path,
      schemaName,
      jsonBytes,
      avroBytes: avroBinaryLength,
      savedBytes,
      savedPercent: `${savedPercent}%`,
      payload,
    };

    if (this._enabled) {
      const arrow = direction === 'outgoing' ? '>>>' : '<<<';
      const label = direction === 'outgoing' ? 'REQUEST' : 'RESPONSE';

      console.group(
        `[AvroStream] ${arrow} ${label} ${path} (${schemaName})`,
      );
      console.log('Payload:', payload);
      console.log(
        `Size: ${avroBinaryLength} bytes (Avro) vs ${jsonBytes} bytes (JSON) — saved ${savedBytes} bytes (${savedPercent}%)`,
      );
      console.groupEnd();
    }

    this._onMetrics?.(metrics);
  }
}
