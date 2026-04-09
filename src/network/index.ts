import type { NetworkListener } from '../types.js';

interface NodeNetworkListenerOptions {
  readonly endpoint: string;
  readonly probeIntervalMs?: number;
  readonly timeoutMs?: number;
}

export class BrowserNetworkListener implements NetworkListener {
  isOnline(): boolean {
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return navigator.onLine;
    }
    return true;
  }

  onOnline(listener: () => void): () => void {
    if (typeof window === 'undefined') {
      return () => {};
    }

    const handler = (): void => {
      listener();
    };

    window.addEventListener('online', handler);
    return () => {
      window.removeEventListener('online', handler);
    };
  }
}

export class NodeNetworkListener implements NetworkListener {
  private readonly _probeIntervalMs: number;
  private readonly _timeoutMs: number;
  private readonly _hostname: string;
  private readonly _port: number;
  private _isOnline = true;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private readonly _listeners = new Set<() => void>();

  constructor(options: NodeNetworkListenerOptions) {
    this._probeIntervalMs = options.probeIntervalMs ?? 5000;
    this._timeoutMs = options.timeoutMs ?? 1500;

    const endpointUrl = new URL(options.endpoint);
    this._hostname = endpointUrl.hostname;
    this._port =
      endpointUrl.port.length > 0
        ? Number(endpointUrl.port)
        : endpointUrl.protocol === 'https:'
          ? 443
          : 80;

    // Kick off an immediate probe so isOnline() reflects real state before first poll interval.
    void this._probeConnectivity();
  }

  isOnline(): boolean {
    return this._isOnline;
  }

  onOnline(listener: () => void): () => void {
    this._listeners.add(listener);
    this._ensurePolling();

    return () => {
      this._listeners.delete(listener);
      if (this._listeners.size === 0) {
        this._stopPolling();
      }
    };
  }

  destroy(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._listeners.clear();
  }

  private async _probeConnectivity(): Promise<void> {
    const wasOnline = this._isOnline;
    const currentlyOnline = await this._checkTcpReachability();
    this._isOnline = currentlyOnline;

    if (!wasOnline && currentlyOnline) {
      for (const listener of this._listeners) {
        listener();
      }
    }
  }

  private _ensurePolling(): void {
    if (this._timer) return;

    this._timer = setInterval(() => {
      void this._probeConnectivity();
    }, this._probeIntervalMs);
    this._timer.unref?.();
  }

  private _stopPolling(): void {
    if (!this._timer) return;
    clearInterval(this._timer);
    this._timer = null;
  }

  private async _checkTcpReachability(): Promise<boolean> {
    try {
      const net = await import('node:net');

      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection({
          host: this._hostname,
          port: this._port,
        });

        const onError = (): void => {
          socket.destroy();
          reject(new Error('connect failed'));
        };

        socket.setTimeout(this._timeoutMs, onError);
        socket.once('error', onError);
        socket.once('connect', () => {
          socket.end();
          resolve();
        });
      });

      return true;
    } catch {
      return false;
    }
  }
}

export function createDefaultNetworkListener(endpoint: string): NetworkListener {
  if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
    return new BrowserNetworkListener();
  }

  return new NodeNetworkListener({ endpoint });
}
