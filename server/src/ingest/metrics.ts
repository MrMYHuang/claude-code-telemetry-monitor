import {
  attrsToObject,
  parseNumber,
  parseTimestamp,
  type OtlpKeyValue,
} from './otlp.js';

export type MetricRow = {
  ts: Date;
  name: string;
  value: number;
  sessionId: string | null;
  model: string | null;
  tokenType: string | null;
  attributes: Record<string, unknown>;
};

function parseDataPointValue(point: Record<string, unknown>): number | null {
  const rawDouble = point.asDouble !== undefined ? point.asDouble : point.as_double;
  if (rawDouble !== undefined && rawDouble !== null) {
    const val = parseNumber(rawDouble);
    if (val !== null) return val;
  }

  const rawInt = point.asInt !== undefined ? point.asInt : point.as_int;
  if (rawInt !== undefined && rawInt !== null) {
    const val = parseNumber(rawInt);
    if (val !== null) return val;
  }

  if (point.value !== undefined && point.value !== null) {
    const val = parseNumber(point.value);
    if (val !== null) return val;
  }

  return null;
}


export function parseMetrics(payload: unknown): MetricRow[] {
  const rows: MetricRow[] = [];
  if (!payload || typeof payload !== 'object') {
    return rows;
  }

  const p = payload as {
    resourceMetrics?: unknown[];
    resource_metrics?: unknown[];
  };
  const resourceMetrics = p.resourceMetrics ?? p.resource_metrics;
  if (!Array.isArray(resourceMetrics)) {
    return rows;
  }

  for (const resourceMetric of resourceMetrics) {
    if (!resourceMetric || typeof resourceMetric !== 'object') continue;
    const res = resourceMetric as {
      resource?: { attributes?: OtlpKeyValue[] };
      scopeMetrics?: unknown[];
      scope_metrics?: unknown[];
    };
    const resourceAttrs = attrsToObject(res.resource?.attributes);

    const scopeMetrics = res.scopeMetrics ?? res.scope_metrics;
    if (!Array.isArray(scopeMetrics)) continue;

    for (const scopeMetric of scopeMetrics) {
      if (!scopeMetric || typeof scopeMetric !== 'object') continue;
      const scope = scopeMetric as {
        scope?: { attributes?: OtlpKeyValue[] };
        metrics?: unknown[];
      };
      const scopeAttrs = attrsToObject(scope.scope?.attributes);

      if (!Array.isArray(scope.metrics)) continue;

      for (const metricItem of scope.metrics) {
        if (!metricItem || typeof metricItem !== 'object') continue;
        const metric = metricItem as {
          name?: string;
          sum?: { dataPoints?: unknown[]; data_points?: unknown[] };
          gauge?: { dataPoints?: unknown[]; data_points?: unknown[] };
        };

        const metricName =
          typeof metric.name === 'string' && metric.name.trim() !== ''
            ? metric.name.trim()
            : 'unknown';

        const dataPoints: unknown[] = [];
        const sumPoints = metric.sum?.dataPoints ?? metric.sum?.data_points;
        if (Array.isArray(sumPoints)) {
          dataPoints.push(...sumPoints);
        }
        const gaugePoints = metric.gauge?.dataPoints ?? metric.gauge?.data_points;
        if (Array.isArray(gaugePoints)) {
          dataPoints.push(...gaugePoints);
        }

        for (const dataPoint of dataPoints) {
          if (!dataPoint || typeof dataPoint !== 'object') continue;
          const point = dataPoint as {
            attributes?: OtlpKeyValue[];
            timeUnixNano?: string | number;
            time_unix_nano?: string | number;
            startTimeUnixNano?: string | number;
            start_time_unix_nano?: string | number;
            asInt?: unknown;
            as_int?: unknown;
            asDouble?: unknown;
            as_double?: unknown;
            value?: unknown;
          };

          const pointAttrs = attrsToObject(point.attributes);
          const mergedAttrs: Record<string, unknown> = {
            ...resourceAttrs,
            ...scopeAttrs,
            ...pointAttrs,
          };

          const value = parseDataPointValue(point as Record<string, unknown>);
          if (value === null) {
            continue;
          }

          const rawSession =
            mergedAttrs['session.id'] ?? mergedAttrs['session_id'];
          const sessionId =
            rawSession !== undefined &&
            rawSession !== null &&
            String(rawSession).trim() !== ''
              ? String(rawSession)
              : null;

          const rawModel = mergedAttrs['model'];
          const model =
            rawModel !== undefined &&
            rawModel !== null &&
            String(rawModel).trim() !== ''
              ? String(rawModel)
              : null;

          const isTokenMetric =
            metricName === 'claude_code.token.usage' ||
            metricName.endsWith('.token.usage') ||
            metricName === 'token.usage' ||
            metricName.includes('token');

          const rawTokenType =
            mergedAttrs['token_type'] ??
            mergedAttrs['tokenType'] ??
            (isTokenMetric ? mergedAttrs['type'] : undefined);

          const tokenType =
            rawTokenType !== undefined &&
            rawTokenType !== null &&
            String(rawTokenType).trim() !== ''
              ? String(rawTokenType)
              : null;

          const rawTimestamp =
            mergedAttrs['event.timestamp'] ?? mergedAttrs['event_timestamp'];
          const timeNano =
            point.timeUnixNano ??
            point.time_unix_nano ??
            point.startTimeUnixNano ??
            point.start_time_unix_nano;
          const ts = parseTimestamp(rawTimestamp, timeNano);

          const attributes: Record<string, unknown> = { ...mergedAttrs };

          // Privacy requirement: drop any free-text that could be prompt text
          delete attributes['prompt'];
          delete attributes['prompt_text'];
          delete attributes['prompt.text'];
          delete attributes['user_prompt'];
          delete attributes['prompt_content'];
          delete attributes['promptContent'];
          delete attributes['body'];

          rows.push({
            ts,
            name: metricName,
            value,
            sessionId,
            model,
            tokenType,
            attributes,
          });
        }
      }
    }
  }

  return rows;
}
