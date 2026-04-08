import { describe, it, expect, vi } from 'vitest';
import { DebugLogger } from '../debug/index.js';

describe('DebugLogger', () => {
  it('does nothing when disabled', () => {
    const consoleSpy = vi.spyOn(console, 'group');
    const logger = new DebugLogger(false);

    logger.log('outgoing', '/test', 'TestSchema', { a: 1 }, 5);

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('logs metrics when enabled', () => {
    const groupSpy = vi.spyOn(console, 'group').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const groupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

    const logger = new DebugLogger(true);
    logger.log('outgoing', '/test', 'TestSchema', { name: 'Alice' }, 5);

    expect(groupSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(2); // payload + size
    expect(groupEndSpy).toHaveBeenCalledTimes(1);

    // Verify the label contains direction and path
    const label = groupSpy.mock.calls[0]![0] as string;
    expect(label).toContain('REQUEST');
    expect(label).toContain('/test');

    groupSpy.mockRestore();
    logSpy.mockRestore();
    groupEndSpy.mockRestore();
  });

  it('reports enabled state correctly', () => {
    expect(new DebugLogger(true).enabled).toBe(true);
    expect(new DebugLogger(false).enabled).toBe(false);
  });
});
