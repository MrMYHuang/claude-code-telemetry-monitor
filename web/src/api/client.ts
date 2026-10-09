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

export interface SessionItem {
  sessionId: string;
  startedAt: string;
  lastSeen: string;
  totalCost: number;
  totalTokens: number;
  toolCalls: number;
  errors: number;
}

export interface SessionsResponse {
  items: SessionItem[];
  total: number;
}

export async function fetchSessions(params: {
  range?: RangeOption;
  model?: string;
  limit?: number;
  offset?: number;
}): Promise<SessionsResponse> {
  const rangeParams = params.range ? rangeToParams(params.range) : undefined;
  return api.get<SessionsResponse>('/api/sessions', {
    from: rangeParams?.from,
    to: rangeParams?.to,
    model: params.model,
    limit: params.limit,
    offset: params.offset,
  });
}

export interface EventItem {
  id?: number;
  ts: string;
  eventName: string;
  sessionId: string | null;
  promptId: string | null;
  model: string | null;
  toolName: string | null;
  durationMs: number | null;
  success: boolean | null;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
  attributes: Record<string, unknown>;
}

export interface SessionDetailResponse {
  session: SessionItem;
  events: EventItem[];
}

export async function fetchSessionDetail(id: string): Promise<SessionDetailResponse> {
  return api.get<SessionDetailResponse>(`/api/sessions/${encodeURIComponent(id)}`);
}

export interface ToolStat {
  toolName: string;
  calls: number;
  successRate: number;
  p50Ms: number;
  p95Ms: number;
}

export interface SlowestToolCall {
  toolName: string;
  durationMs: number;
  ts: string;
  sessionId: string | null;
}

export interface ToolsResponse {
  tools: ToolStat[];
  slowest: SlowestToolCall[];
}

export async function fetchTools(params: {
  range?: RangeOption;
  model?: string;
  limit?: number;
}): Promise<ToolsResponse> {
  const rangeParams = params.range ? rangeToParams(params.range) : undefined;
  return api.get<ToolsResponse>('/api/tools', {
    from: rangeParams?.from,
    to: rangeParams?.to,
    model: params.model,
    limit: params.limit,
  });
}

export interface ErrorItem {
  ts: string;
  kind: 'api_error' | 'tool_error';
  message: string;
  model: string | null;
  sessionId: string | null;
}

export interface ErrorsResponse {
  items: ErrorItem[];
  total: number;
}

export async function fetchErrors(params: {
  range?: RangeOption;
  model?: string;
  limit?: number;
  offset?: number;
}): Promise<ErrorsResponse> {
  const rangeParams = params.range ? rangeToParams(params.range) : undefined;
  return api.get<ErrorsResponse>('/api/errors', {
    from: rangeParams?.from,
    to: rangeParams?.to,
    model: params.model,
    limit: params.limit,
    offset: params.offset,
  });
}

