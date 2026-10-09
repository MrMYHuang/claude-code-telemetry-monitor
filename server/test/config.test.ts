import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getConfig } from '../src/config.js';

describe('getConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws an error if DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    expect(() => getConfig()).toThrow('DATABASE_URL environment variable is required');
  });

  it('returns default port 4318 when PORT is not provided', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
    delete process.env.PORT;

    const config = getConfig();
    expect(config).toEqual({
      databaseUrl: 'postgres://user:pass@localhost:5432/db',
      port: 4318,
    });
  });

  it('parses custom PORT', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
    process.env.PORT = '8080';

    const config = getConfig();
    expect(config).toEqual({
      databaseUrl: 'postgres://user:pass@localhost:5432/db',
      port: 8080,
    });
  });

  it('throws an error if PORT is not a valid number', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
    process.env.PORT = 'invalid';

    expect(() => getConfig()).toThrow('Invalid PORT value: invalid');
  });
});
