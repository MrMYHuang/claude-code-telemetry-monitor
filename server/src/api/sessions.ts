import type { FastifyPluginAsync } from 'fastify';
import type { Pool } from 'pg';
import { parseRangeQuery } from './query.js';

export interface SessionsRoutesOptions {
  pool: Pool;
}

export interface SessionRow {
  sessionId: string;
  session_id: string;
  startedAt: string;
  started_at: string;
  lastSeen: string;
  last_seen: string;
  totalCost: number;
  total_cost: number;
  totalTokens: number;
  total_tokens: number;
  toolCalls: number;
  tool_calls: number;
  errors: number;
}

function formatSession(row: any): SessionRow {
  const startedAt =
    row.started_at instanceof Date
      ? row.started_at.toISOString()
      : String(row.started_at);
  const lastSeen =
    row.last_seen instanceof Date
      ? row.last_seen.toISOString()
      : String(row.last_seen);
  const totalCost = Number(row.total_cost || 0);
  const totalTokens = Number(row.total_tokens || 0);
  const toolCalls = Number(row.tool_calls || 0);
  const errors = Number(row.errors || 0);

  return {
    sessionId: String(row.session_id),
    session_id: String(row.session_id),
    startedAt,
    started_at: startedAt,
    lastSeen,
    last_seen: lastSeen,
    totalCost,
    total_cost: totalCost,
    totalTokens,
    total_tokens: totalTokens,
    toolCalls,
    tool_calls: toolCalls,
    errors,
  };
}

function formatEvent(row: any) {
  const ts = row.ts instanceof Date ? row.ts.toISOString() : String(row.ts);
  return {
    id: row.id != null ? Number(row.id) : undefined,
    ts,
    eventName: row.event_name,
    event_name: row.event_name,
    sessionId: row.session_id != null ? String(row.session_id) : null,
    session_id: row.session_id != null ? String(row.session_id) : null,
    promptId: row.prompt_id != null ? String(row.prompt_id) : null,
    prompt_id: row.prompt_id != null ? String(row.prompt_id) : null,
    model: row.model != null ? String(row.model) : null,
    toolName: row.tool_name != null ? String(row.tool_name) : null,
    tool_name: row.tool_name != null ? String(row.tool_name) : null,
    durationMs: row.duration_ms != null ? Number(row.duration_ms) : null,
    duration_ms: row.duration_ms != null ? Number(row.duration_ms) : null,
    success: row.success != null ? Boolean(row.success) : null,
    costUsd: row.cost_usd != null ? Number(row.cost_usd) : null,
    cost_usd: row.cost_usd != null ? Number(row.cost_usd) : null,
    inputTokens: row.input_tokens != null ? Number(row.input_tokens) : null,
    input_tokens: row.input_tokens != null ? Number(row.input_tokens) : null,
    outputTokens: row.output_tokens != null ? Number(row.output_tokens) : null,
    output_tokens: row.output_tokens != null ? Number(row.output_tokens) : null,
    error: row.error != null ? String(row.error) : null,
    attributes: row.attributes ?? {},
  };
}

function buildSessionFilters(filters: {
  from?: string;
  to?: string;
  model?: string;
}) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.from !== undefined) {
    conditions.push(`last_seen >= $${idx++}::timestamptz`);
    params.push(filters.from);
  }
  if (filters.to !== undefined) {
    conditions.push(`started_at <= $${idx++}::timestamptz`);
    params.push(filters.to);
  }
  if (filters.model !== undefined) {
    conditions.push(
      `session_id IN (SELECT session_id FROM events WHERE model = $${idx++}::text AND session_id IS NOT NULL)`,
    );
    params.push(filters.model);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params, nextIndex: idx };
}

export const sessionsRoutes: FastifyPluginAsync<SessionsRoutesOptions> = async (
  app,
  options,
) => {
  const { pool } = options;

  app.get('/api/sessions', async (request, reply) => {
    const parsed = parseRangeQuery(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error });
    }

    const { from, to, model, limit = 50, offset = 0 } = parsed.data;
    const filter = buildSessionFilters({ from, to, model });

    const countQuery = `
      SELECT COUNT(*)::integer AS total
      FROM sessions
      ${filter.whereClause};
    `;

    const itemsQuery = `
      SELECT
        session_id,
        started_at,
        last_seen,
        total_cost,
        total_tokens,
        tool_calls,
        errors
      FROM sessions
      ${filter.whereClause}
      ORDER BY last_seen DESC, started_at DESC
      LIMIT $${filter.nextIndex} OFFSET $${filter.nextIndex + 1};
    `;

    try {
      const [countRes, itemsRes] = await Promise.all([
        pool.query(countQuery, filter.params),
        pool.query(itemsQuery, [...filter.params, limit, offset]),
      ]);

      const total = Number(countRes.rows[0]?.total || 0);
      const items = itemsRes.rows.map(formatSession);

      return reply.status(200).send({ items, total });
    } catch (err) {
      request.log.error(err, 'Failed to fetch sessions');
      return reply.status(500).send({ error: 'Failed to fetch sessions' });
    }
  });

  app.get<{ Params: { id: string } }>(
    '/api/sessions/:id',
    async (request, reply) => {
      const sessionId = request.params.id;

      const sessionQuery = `
        SELECT
          session_id,
          started_at,
          last_seen,
          total_cost,
          total_tokens,
          tool_calls,
          errors
        FROM sessions
        WHERE session_id = $1;
      `;

      const eventsQuery = `
        SELECT
          id,
          ts,
          event_name,
          session_id,
          prompt_id,
          attributes,
          model,
          tool_name,
          duration_ms,
          success,
          cost_usd,
          input_tokens,
          output_tokens,
          error
        FROM events
        WHERE session_id = $1
        ORDER BY ts ASC, id ASC;
      `;

      try {
        const [sessionRes, eventsRes] = await Promise.all([
          pool.query(sessionQuery, [sessionId]),
          pool.query(eventsQuery, [sessionId]),
        ]);

        if (sessionRes.rows.length === 0) {
          return reply.status(404).send({ error: 'Session not found' });
        }

        const session = formatSession(sessionRes.rows[0]);
        const events = eventsRes.rows.map(formatEvent);

        return reply.status(200).send({ session, events });
      } catch (err) {
        request.log.error(err, 'Failed to fetch session detail');
        return reply.status(500).send({ error: 'Failed to fetch session detail' });
      }
    },
  );
};
