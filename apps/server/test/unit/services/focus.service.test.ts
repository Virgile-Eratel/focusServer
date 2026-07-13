import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('applyMode', () => {
  let focusService: typeof import('../../../src/services/focus.service');
  let mockApply: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();

    mockApply = vi.fn().mockResolvedValue(undefined);

    vi.doMock('../../../src/services/focusApplier.service', () => ({ apply: mockApply }));
    vi.doMock('../../../src/services/scheduleService', () => ({ isScheduledPause: () => false }));
    vi.doMock('../../../src/utils/logger', () => ({
      createChildLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    }));

    focusService = await import('../../../src/services/focus.service');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports success once the mode is applied', async () => {
    await expect(focusService.applyMode('blocked')).resolves.toBe(true);
    expect(mockApply).toHaveBeenCalledWith('blocked');
    expect(focusService.getCurrentMode()).toBe('blocked');
  });

  it('reports failure when focus-apply fails, and leaves the mode untouched', async () => {
    mockApply.mockRejectedValue(new Error('sudo failed'));

    await expect(focusService.applyMode('blocked')).resolves.toBe(false);
    expect(focusService.getCurrentMode()).toBe('unknown');
  });

  it('reports success without reapplying when already in the target mode', async () => {
    await focusService.applyMode('blocked');
    mockApply.mockClear();

    await expect(focusService.applyMode('blocked')).resolves.toBe(true);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('reapplies when forced — the generated files may have changed', async () => {
    await focusService.applyMode('blocked');
    mockApply.mockClear();

    await expect(focusService.applyMode('blocked', { force: true })).resolves.toBe(true);
    expect(mockApply).toHaveBeenCalledWith('blocked');
  });

  it('reports failure when an apply is already running — /etc is not in sync', async () => {
    let releaseApply: () => void;
    mockApply.mockImplementation(() => new Promise<void>((resolve) => (releaseApply = resolve)));

    const first = focusService.applyMode('blocked', { force: true });
    const skipped = await focusService.applyMode('blocked', { force: true });

    expect(skipped).toBe(false);

    releaseApply!();
    await expect(first).resolves.toBe(true);
  });
});
