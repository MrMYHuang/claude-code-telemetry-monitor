import { QueryClient } from '@tanstack/react-query';
import { rangeToParams, type RangeOption } from '../lib/format';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 10_000,
      staleTime: 5_000,
      retry: 1,
    },
  },
});

export interface OverviewTotals {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  sessions: number;
  toolCalls: number;
  errorRate: number;
}

export interface OverviewSeriesPoint {
  ts: string;
  costUsd: number;
  tokens: number;
}

export interface OverviewByModel {
  model: string;
  costUsd: number;
}

export interface OverviewResponse {
  totals: OverviewTotals;
  series: OverviewSeriesPoint[];
  byModel: OverviewByModel[];
}

export const api = {
  async get<T>(path: string, params?: Record<string, string | number | undefined | null>): Promise<T> {
    const url = new URL(path, window.location.origin);
    if (params) {
      for (const [key, val] of Object.entries(params)) {
        if (val !== undefined && val !== null) {
          url.searchParams.set(key, String(val));
        }
      }
    }

    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}: ${res.statusText}`;
      try {
        const body = await res.json();
        if (body.error) {
          errorMsg = body.error;
        }
      } catch {
        // use default errorMsg
      }
      throw new Error(errorMsg);
    }

    return res.json() as Promise<T>;
  },
};

export async function fetchOverview(range: RangeOption): Promise<OverviewResponse> {
  const { from, to, bucket } = rangeToParams(range);
  return api.get<OverviewResponse>('/api/overview', {
    from,
    to,
    bucket,
  });
}
