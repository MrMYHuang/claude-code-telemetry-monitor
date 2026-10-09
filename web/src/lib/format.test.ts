import { describe, it, expect } from 'vitest';
import { formatCost, formatTokens, formatDuration, rangeToParams } from './format';

describe('format helpers', () => {
  describe('formatCost', () => {
    it('formats 0 as $0.00', () => {
      expect(formatCost(0)).toBe('$0.00');
    });

    it('formats small costs under 0.01 with 4 decimal places', () => {
      expect(formatCost(0.0042)).toBe('$0.0042');
      expect(formatCost(0.0001)).toBe('$0.0001');
    });

    it('formats standard dollar amounts with 2 decimal places and commas', () => {
      expect(formatCost(1.5)).toBe('$1.50');
      expect(formatCost(1234.56)).toBe('$1,234.56');
    });
  });

  describe('formatTokens', () => {
    it('formats 0 as 0', () => {
      expect(formatTokens(0)).toBe('0');
    });

    it('formats numbers with comma separators', () => {
      expect(formatTokens(500)).toBe('500');
      expect(formatTokens(1250)).toBe('1,250');
      expect(formatTokens(1500000)).toBe('1,500,000');
    });
  });

  describe('formatDuration', () => {
    it('formats durations under 1 second in milliseconds', () => {
      expect(formatDuration(0)).toBe('0ms');
      expect(formatDuration(250)).toBe('250ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('formats durations between 1 second and 1 minute in seconds', () => {
      expect(formatDuration(1000)).toBe('1.0s');
      expect(formatDuration(1500)).toBe('1.5s');
      expect(formatDuration(12300)).toBe('12.3s');
    });

    it('formats durations over 1 minute in minutes and seconds', () => {
      expect(formatDuration(65000)).toBe('1m 5s');
      expect(formatDuration(125000)).toBe('2m 5s');
    });
  });

  describe('rangeToParams', () => {
    const fixedNow = new Date('2026-10-09T12:00:00.000Z');

    it('maps 1h to hour bucket and exactly 1 hour range', () => {
      const res = rangeToParams('1h', fixedNow);
      expect(res.bucket).toBe('hour');
      expect(res.to).toBe('2026-10-09T12:00:00.000Z');
      expect(res.from).toBe('2026-10-09T11:00:00.000Z');
      expect(new Date(res.to).getTime() - new Date(res.from).getTime()).toBe(3600 * 1000);
    });

    it('maps 24h to hour bucket and exactly 24 hours range', () => {
      const res = rangeToParams('24h', fixedNow);
      expect(res.bucket).toBe('hour');
      expect(res.to).toBe('2026-10-09T12:00:00.000Z');
      expect(res.from).toBe('2026-10-08T12:00:00.000Z');
      expect(new Date(res.to).getTime() - new Date(res.from).getTime()).toBe(24 * 3600 * 1000);
    });

    it('maps 7d to day bucket and exactly 7 days range', () => {
      const res = rangeToParams('7d', fixedNow);
      expect(res.bucket).toBe('day');
      expect(res.to).toBe('2026-10-09T12:00:00.000Z');
      expect(res.from).toBe('2026-10-02T12:00:00.000Z');
      expect(new Date(res.to).getTime() - new Date(res.from).getTime()).toBe(7 * 24 * 3600 * 1000);
    });

    it('maps 30d to day bucket and exactly 30 days range', () => {
      const res = rangeToParams('30d', fixedNow);
      expect(res.bucket).toBe('day');
      expect(res.to).toBe('2026-10-09T12:00:00.000Z');
      expect(res.from).toBe('2026-09-09T12:00:00.000Z');
      expect(new Date(res.to).getTime() - new Date(res.from).getTime()).toBe(30 * 24 * 3600 * 1000);
    });

    it('uses current time if now parameter is omitted', () => {
      const before = Date.now();
      const res = rangeToParams('1h');
      const after = Date.now();

      const toTime = new Date(res.to).getTime();
      const fromTime = new Date(res.from).getTime();

      expect(toTime).toBeGreaterThanOrEqual(before);
      expect(toTime).toBeLessThanOrEqual(after);
      expect(toTime - fromTime).toBe(3600 * 1000);
    });
  });
});
