import { describe, it, expect } from 'vitest';
import { rangeSchema } from '../../src/api/query.js';

describe('rangeSchema validation', () => {
  it('accepts valid range query parameters', () => {
    const input = {
      from: '2026-10-09T00:00:00.000Z',
      to: '2026-10-09T23:59:59.000Z',
      model: 'claude-3-5-sonnet',
      bucket: 'hour',
      limit: '50',
      offset: '0',
    };

    const parsed = rangeSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.from).toBe('2026-10-09T00:00:00.000Z');
      expect(parsed.data.to).toBe('2026-10-09T23:59:59.000Z');
      expect(parsed.data.model).toBe('claude-3-5-sonnet');
      expect(parsed.data.bucket).toBe('hour');
      expect(parsed.data.limit).toBe(50);
      expect(parsed.data.offset).toBe(0);
    }
  });

  it('accepts empty parameters when optional', () => {
    const parsed = rangeSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it('rejects invalid from ISO string', () => {
    const parsed = rangeSchema.safeParse({ from: 'not-a-valid-date' });
    expect(parsed.success).toBe(false);
  });

  it('rejects invalid to ISO string', () => {
    const parsed = rangeSchema.safeParse({ to: '2026-99-99' });
    expect(parsed.success).toBe(false);
  });

  it('rejects invalid bucket value', () => {
    const parsed = rangeSchema.safeParse({ bucket: 'minute' });
    expect(parsed.success).toBe(false);
  });

  it('rejects negative limit and offset', () => {
    expect(rangeSchema.safeParse({ limit: '-1' }).success).toBe(false);
    expect(rangeSchema.safeParse({ offset: '-5' }).success).toBe(false);
  });
});
