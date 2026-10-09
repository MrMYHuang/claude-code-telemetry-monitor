import { createHash } from 'node:crypto';
import { attrsToObject, extractAnyValue, type OtlpKeyValue } from './otlp.js';

export interface EventRow {
  ts: Date;
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
  dedupKey: string;
}

function parseNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return Number.isNaN(val) ? null : val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '') return null;
    const num = Number(trimmed);
    return Number.isNaN(num) ? null : num;
  }
  return null;
}

function parseInteger(val: unknown): number | null {
  const num = parseNumber(val);
  return num === null ? null : Math.round(num);
}

function parseBoolean(val: unknown): boolean | null {
  if (val === true || val === 'true') return true;
  if (val === false || val === 'false') return false;
  return null;
}

function parseTimestamp(eventTimestamp: unknown, timeUnixNano: unknown): Date {
  if (eventTimestamp !== undefined && eventTimestamp !== null) {
    if (typeof eventTimestamp === 'string' || typeof eventTimestamp === 'number') {
      const d = new Date(eventTimestamp);
      if (!Number.isNaN(d.getTime())) {
        return d;
      }
    }
  }
  if (timeUnixNano !== undefined && timeUnixNano !== null) {
    try {
      const nanoStr = String(timeUnixNano).trim();
      if (nanoStr !== '') {
        const nanoBigInt = BigInt(nanoStr);
        const ms = Number(nanoBigInt / 1_000_000n);
        const d = new Date(ms);
        if (!Number.isNaN(d.getTime())) {
          return d;
        }
      }
    } catch {
      // fallback
    }
  }
  return new Date();
}

function sortObjectKeys(val: unknown): unknown {
  if (val === null || typeof val !== 'object') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(sortObjectKeys);
  }
  const obj = val as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortObjectKeys(obj[key]);
  }
  return sorted;
}

function computeDedupKey(
  ts: Date,
  eventName: string,
  sessionId: string | null,
  attributes: Record<string, unknown>,
): string {
  const tsIso = ts.toISOString();
  const sessionStr = sessionId ?? '';
  const sortedAttrs = sortObjectKeys(attributes);
  const attrsJson = JSON.stringify(sortedAttrs);
  const raw = `${tsIso}|${eventName}|${sessionStr}|${attrsJson}`;
  return createHash('sha256').update(raw).digest('hex');
}

export function parseLogs(payload: unknown): EventRow[] {
  const rows: EventRow[] = [];
  if (!payload || typeof payload !== 'object') {
    return rows;
  }

  const p = payload as { resourceLogs?: unknown[] };
  if (!Array.isArray(p.resourceLogs)) {
    return rows;
  }

  for (const resourceLog of p.resourceLogs) {
    if (!resourceLog || typeof resourceLog !== 'object') continue;
    const res = resourceLog as {
      resource?: { attributes?: OtlpKeyValue[] };
      scopeLogs?: unknown[];
    };
    const resourceAttrs = attrsToObject(res.resource?.attributes);

    if (!Array.isArray(res.scopeLogs)) continue;

    for (const scopeLog of res.scopeLogs) {
      if (!scopeLog || typeof scopeLog !== 'object') continue;
      const scope = scopeLog as {
        scope?: { attributes?: OtlpKeyValue[] };
        logRecords?: unknown[];
      };
      const scopeAttrs = attrsToObject(scope.scope?.attributes);

      if (!Array.isArray(scope.logRecords)) continue;

      for (const logRecord of scope.logRecords) {
        if (!logRecord || typeof logRecord !== 'object') continue;
        const rec = logRecord as {
          timeUnixNano?: string | number;
          time_unix_nano?: string | number;
          body?: unknown;
          attributes?: OtlpKeyValue[];
        };

        const recordAttrs = attrsToObject(rec.attributes);
        const mergedAttrs: Record<string, unknown> = {
          ...resourceAttrs,
          ...scopeAttrs,
          ...recordAttrs,
        };

        if (rec.body !== undefined && rec.body !== null) {
          const bodyVal = extractAnyValue(rec.body);
          if (bodyVal !== undefined && mergedAttrs.body === undefined) {
            mergedAttrs.body = bodyVal;
          }
        }

        const rawEventName =
          mergedAttrs['event.name'] ??
          mergedAttrs['event_name'] ??
          (typeof rec.body === 'string'
            ? rec.body
            : (rec.body as { stringValue?: string } | undefined)?.stringValue) ??
          'unknown';

        const strName = String(rawEventName);
        const eventName = strName.startsWith('claude_code.')
          ? strName.slice('claude_code.'.length)
          : strName;

        const rawSession =
          mergedAttrs['session.id'] ?? mergedAttrs['session_id'];
        const sessionId =
          rawSession !== undefined &&
          rawSession !== null &&
          String(rawSession).trim() !== ''
            ? String(rawSession)
            : null;

        const rawPromptId =
          mergedAttrs['prompt.id'] ?? mergedAttrs['prompt_id'];
        const promptId =
          rawPromptId !== undefined &&
          rawPromptId !== null &&
          String(rawPromptId).trim() !== ''
            ? String(rawPromptId)
            : null;

        const rawModel = mergedAttrs['model'];
        const model =
          rawModel !== undefined &&
          rawModel !== null &&
          String(rawModel).trim() !== ''
            ? String(rawModel)
            : null;

        const rawTool =
          mergedAttrs['tool_name'] ??
          mergedAttrs['tool.name'] ??
          mergedAttrs['toolName'];
        const toolName =
          rawTool !== undefined &&
          rawTool !== null &&
          String(rawTool).trim() !== ''
            ? String(rawTool)
            : null;

        const durationMs = parseNumber(
          mergedAttrs['duration_ms'] ?? mergedAttrs['durationMs'],
        );
        const success = parseBoolean(mergedAttrs['success']);
        const costUsd = parseNumber(
          mergedAttrs['cost_usd'] ?? mergedAttrs['costUsd'],
        );
        const inputTokens = parseInteger(
          mergedAttrs['input_tokens'] ?? mergedAttrs['inputTokens'],
        );
        const outputTokens = parseInteger(
          mergedAttrs['output_tokens'] ?? mergedAttrs['outputTokens'],
        );

        const rawError = mergedAttrs['error'];
        const error =
          rawError !== undefined &&
          rawError !== null &&
          String(rawError).trim() !== ''
            ? String(rawError)
            : null;

        const rawTimestamp =
          mergedAttrs['event.timestamp'] ?? mergedAttrs['event_timestamp'];
        const ts = parseTimestamp(
          rawTimestamp,
          rec.timeUnixNano ?? rec.time_unix_nano,
        );

        const attributes: Record<string, unknown> = { ...mergedAttrs };
        if (eventName === 'user_prompt') {
          delete attributes['prompt'];
        }

        const dedupKey = computeDedupKey(ts, eventName, sessionId, attributes);

        rows.push({
          ts,
          eventName,
          sessionId,
          promptId,
          model,
          toolName,
          durationMs,
          success,
          costUsd,
          inputTokens,
          outputTokens,
          error,
          attributes,
          dedupKey,
        });
      }
    }
  }

  return rows;
}
