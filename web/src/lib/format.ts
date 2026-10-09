export type RangeOption = '1h' | '24h' | '7d' | '30d';

export interface RangeParams {
  from: string;
  to: string;
  bucket: 'hour' | 'day';
}

export function formatCost(n: number): string {
  if (n === 0) {
    return '$0.00';
  }
  if (Math.abs(n) < 0.01) {
    return `$${n.toFixed(4)}`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatTokens(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const totalSeconds = Math.round(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}m ${secs}s`;
}

export function rangeToParams(range: RangeOption, now?: Date): RangeParams {
  const toDate = now ? new Date(now) : new Date();
  const to = toDate.toISOString();

  let durationMs: number;
  let bucket: 'hour' | 'day';

  switch (range) {
    case '1h':
      durationMs = 60 * 60 * 1000;
      bucket = 'hour';
      break;
    case '24h':
      durationMs = 24 * 60 * 60 * 1000;
      bucket = 'hour';
      break;
    case '7d':
      durationMs = 7 * 24 * 60 * 60 * 1000;
      bucket = 'day';
      break;
    case '30d':
      durationMs = 30 * 24 * 60 * 60 * 1000;
      bucket = 'day';
      break;
  }

  const from = new Date(toDate.getTime() - durationMs).toISOString();

  return {
    from,
    to,
    bucket,
  };
}
