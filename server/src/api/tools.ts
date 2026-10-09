import type { FastifyPluginAsync } from 'fastify';
import type { Pool } from 'pg';
import { parseRangeQuery, buildEventFilters } from './query.js';

export interface ToolsRoutesOptions {
  pool: Pool;
}

export const toolsRoutes: FastifyPluginAsync<ToolsRoutesOptions> = async (
  app,
  options,
) => {
  const { pool } = options;

  app.get('/api/tools', async (request, reply) => {
    const parsed = parseRangeQuery(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error });
    }

    const { from, to, model, limit = 10 } = parsed.data;

    const toolsFilters = buildEventFilters({ from, to, model }, 1, [
      "event_name = 'tool_result'",
      'tool_name IS NOT NULL',
    ]);

    const toolsQuery = `
      SELECT
        tool_name,
        COUNT(*)::integer AS calls,
        (COUNT(*) FILTER (WHERE success = true)::double precision / COUNT(*))::double precision AS success_rate,
        COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms), 0)::double precision AS p50_ms,
        COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0)::double precision AS p95_ms
      FROM events
      ${toolsFilters.whereClause}
      GROUP BY tool_name
      ORDER BY calls DESC, tool_name ASC;
    `;

    const slowestFilters = buildEventFilters({ from, to, model }, 2, [
      "event_name = 'tool_result'",
      'duration_ms IS NOT NULL',
    ]);

    const slowestQuery = `
      SELECT
        tool_name,
        COALESCE(duration_ms, 0)::double precision AS duration_ms,
        ts,
        session_id
      FROM events
      ${slowestFilters.whereClause}
      ORDER BY duration_ms DESC, ts DESC
      LIMIT $1;
    `;

    try {
      const [toolsRes, slowestRes] = await Promise.all([
        pool.query(toolsQuery, toolsFilters.params),
        pool.query(slowestQuery, [limit, ...slowestFilters.params]),
      ]);

      const tools = toolsRes.rows.map((r) => ({
        toolName: String(r.tool_name),
        calls: Number(r.calls || 0),
        successRate: Number(r.success_rate || 0),
        p50Ms: Number(r.p50_ms || 0),
        p95Ms: Number(r.p95_ms || 0),
      }));

      const slowest = slowestRes.rows.map((r) => ({
        toolName: String(r.tool_name),
        durationMs: Number(r.duration_ms || 0),
        ts: r.ts instanceof Date ? r.ts.toISOString() : String(r.ts),
        sessionId: r.session_id != null ? String(r.session_id) : null,
      }));

      return reply.status(200).send({ tools, slowest });
    } catch (err) {
      request.log.error(err, 'Failed to fetch tools data');
      return reply.status(500).send({ error: 'Failed to fetch tools data' });
    }
  });
};
