import type { Pool } from 'pg';
import type { EventRow } from './logs.js';
import type { MetricRow } from './metrics.js';

const CHUNK_SIZE = 500;

export async function insertEvents(pool: Pool, rows: EventRow[]): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }

  // Deduplicate by dedupKey within batch to avoid duplicate keys in the same INSERT statement
  const seen = new Set<string>();
  const uniqueRows: EventRow[] = [];
  for (const row of rows) {
    if (!seen.has(row.dedupKey)) {
      seen.add(row.dedupKey);
      uniqueRows.push(row);
    }
  }

  if (uniqueRows.length === 0) {
    return 0;
  }

  let totalInserted = 0;

  for (let i = 0; i < uniqueRows.length; i += CHUNK_SIZE) {
    const chunk = uniqueRows.slice(i, i + CHUNK_SIZE);
    const valuePlaceholders: string[] = [];
    const values: unknown[] = [];

    chunk.forEach((row, rowIndex) => {
      const offset = rowIndex * 14;
      valuePlaceholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}::jsonb, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14})`,
      );
      values.push(
        row.ts,
        row.eventName,
        row.sessionId,
        row.promptId,
        JSON.stringify(row.attributes ?? {}),
        row.model,
        row.toolName,
        row.durationMs,
        row.success,
        row.costUsd,
        row.inputTokens,
        row.outputTokens,
        row.error,
        row.dedupKey,
      );
    });

    const query = `
      INSERT INTO events (
        ts, event_name, session_id, prompt_id, attributes,
        model, tool_name, duration_ms, success, cost_usd,
        input_tokens, output_tokens, error, dedup_key
      )
      VALUES ${valuePlaceholders.join(', ')}
      ON CONFLICT (dedup_key) DO NOTHING;
    `;

    const res = await pool.query(query, values);
    totalInserted += res.rowCount ?? 0;
  }

  return totalInserted;
}

export async function insertMetricPoints(pool: Pool, rows: MetricRow[]): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }

  let totalInserted = 0;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const valuePlaceholders: string[] = [];
    const values: unknown[] = [];

    chunk.forEach((row, rowIndex) => {
      const offset = rowIndex * 7;
      valuePlaceholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}::jsonb)`,
      );
      values.push(
        row.ts,
        row.name,
        row.value,
        row.sessionId,
        row.model,
        row.tokenType,
        JSON.stringify(row.attributes ?? {}),
      );
    });

    const query = `
      INSERT INTO metric_points (
        ts, name, value, session_id, model, token_type, attributes
      )
      VALUES ${valuePlaceholders.join(', ')};
    `;

    const res = await pool.query(query, values);
    totalInserted += res.rowCount ?? 0;
  }

  return totalInserted;
}
