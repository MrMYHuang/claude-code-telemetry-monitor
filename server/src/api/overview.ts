import type { FastifyPluginAsync } from 'fastify';
import type { Pool } from 'pg';
import { parseRangeQuery, buildEventFilters } from './query.js';

export interface OverviewRoutesOptions {
  pool: Pool;
}

export const overviewRoutes: FastifyPluginAsync<OverviewRoutesOptions> = async (app, options) => {
  const { pool } = options;

  app.get('/api/overview', async (request, reply) => {
    const parsed = parseRangeQuery(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error });
    }

    const { from, to, model, bucket = 'hour' } = parsed.data;

    // 1. Totals query
    const totalsFilters = buildEventFilters({ from, to, model });
    const totalsQuery = `
      SELECT
        COALESCE(SUM(cost_usd) FILTER (WHERE event_name = 'api_request'), 0)::double precision AS cost_usd,
        COALESCE(SUM(input_tokens) FILTER (WHERE event_name = 'api_request'), 0)::bigint AS input_tokens,
        COALESCE(SUM(output_tokens) FILTER (WHERE event_name = 'api_request'), 0)::bigint AS output_tokens,
        COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL)::integer AS sessions,
        COUNT(*) FILTER (WHERE event_name = 'tool_result')::integer AS tool_calls,
        COUNT(*) FILTER (WHERE event_name = 'api_error' OR (event_name = 'tool_result' AND success = false))::integer AS errors,
        COUNT(*)::integer AS total_events
      FROM events
      ${totalsFilters.whereClause};
    `;

    // 2. Series query (bucketed by date_trunc)
    const seriesFilters = buildEventFilters({ from, to, model }, 2, ["event_name = 'api_request'"]);
    const seriesQuery = `
      SELECT
        date_trunc($1, ts) AS ts,
        COALESCE(SUM(cost_usd), 0)::double precision AS cost_usd,
        COALESCE(SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)), 0)::bigint AS tokens
      FROM events
      ${seriesFilters.whereClause}
      GROUP BY 1
      ORDER BY 1 ASC;
    `;

    // 3. byModel query
    const modelFilters = buildEventFilters({ from, to, model }, 1, [
      "event_name = 'api_request'",
      "model IS NOT NULL",
    ]);
    const byModelQuery = `
      SELECT
        model,
        COALESCE(SUM(cost_usd), 0)::double precision AS cost_usd
      FROM events
      ${modelFilters.whereClause}
      GROUP BY model
      ORDER BY cost_usd DESC, model ASC;
    `;

    try {
      const [totalsRes, seriesRes, byModelRes] = await Promise.all([
        pool.query(totalsQuery, totalsFilters.params),
        pool.query(seriesQuery, [bucket, ...seriesFilters.params]),
        pool.query(byModelQuery, modelFilters.params),
      ]);

      const totalsRow = totalsRes.rows[0];
      const totalEvents = Number(totalsRow?.total_events || 0);
      const errors = Number(totalsRow?.errors || 0);
      const errorRate = totalEvents > 0 ? errors / totalEvents : 0;

      const totals = {
        costUsd: Number(totalsRow?.cost_usd || 0),
        inputTokens: Number(totalsRow?.input_tokens || 0),
        outputTokens: Number(totalsRow?.output_tokens || 0),
        sessions: Number(totalsRow?.sessions || 0),
        toolCalls: Number(totalsRow?.tool_calls || 0),
        errorRate,
      };

      const series = seriesRes.rows.map((row) => ({
        ts: row.ts instanceof Date ? row.ts.toISOString() : String(row.ts),
        costUsd: Number(row.cost_usd || 0),
        tokens: Number(row.tokens || 0),
      }));

      const byModel = byModelRes.rows.map((row) => ({
        model: String(row.model),
        costUsd: Number(row.cost_usd || 0),
      }));

      return reply.status(200).send({ totals, series, byModel });
    } catch (err) {
      request.log.error(err, 'Failed to fetch overview data');
      return reply.status(500).send({ error: 'Failed to fetch overview data' });
    }
  });
};
