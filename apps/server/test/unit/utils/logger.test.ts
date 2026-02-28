import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('logger', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('sets level to silent when NODE_ENV=test', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { logger } = await import('../../../src/utils/logger');
    expect(logger.level).toBe('silent');
    vi.unstubAllEnvs();
  });

  it('respects LOG_LEVEL env override', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOG_LEVEL', 'debug');
    const { logger } = await import('../../../src/utils/logger');
    expect(logger.level).toBe('debug');
    vi.unstubAllEnvs();
  });

  it('defaults to info level in production without LOG_LEVEL', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.LOG_LEVEL;
    const { logger } = await import('../../../src/utils/logger');
    expect(logger.level).toBe('info');
    vi.unstubAllEnvs();
  });

  it('createChildLogger returns a child with service binding', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { createChildLogger } = await import('../../../src/utils/logger');
    const child = createChildLogger('testService');
    expect(child).toBeDefined();
    expect((child as any).bindings().service).toBe('testService');
    vi.unstubAllEnvs();
  });
});
