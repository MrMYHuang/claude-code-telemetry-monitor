import type { FastifyPluginAsync } from 'fastify';
import type { Pool } from 'pg';
import { parseRangeQuery, buildEventFilters } from './query.js';

export interface ErrorsRoutesOptions {
  pool: Pool;
}

export const errorsRoutes: FastifyPluginAsync<ErrorsRoutesOptions> = async (
  app,
  options,
) => {
  const { pool } = options;

  app.get('/api/errors', async (request, reply) => {
    const parsed = parseRangeQuery(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error });
    }

    const { from, to, model, limit = 50, offset = 0 } = parsed.data;

    const errorsFilters = buildEventFilters({ from, to, model }, 1, [
      "(event_name = 'api_error' OR (event_name = 'tool_result' AND success = false))",
    ]);

    const countQuery = `
      SELECT COUNT(*)::integer AS total
      FROM events
      ${errorsFilters.whereClause};
    `;

    const itemsQuery = `
      SELECT
        ts,
        event_name,
        error,
        tool_name,
        model,
        session_id
      FROM events
      ${errorsFilters.whereClause}
      ORDER BY ts DESC, id DESC
      LIMIT $${errorsFilters.nextIndex} OFFSET $${errorsFilters.nextIndex + 1};
    `;

    try {
      const [countRes, itemsRes] = await Promise.all([
        pool.query(countQuery, errorsFilters.params),
        pool.query(itemsQuery, [...errorsFilters.params, limit, offset]),
      ]);

      const total = Number(countRes.rows[0]?.total || 0);
      const items = itemsRes.rows.map((r) => {
        const kind: 'api_error' | 'tool_error' =
          r.event_name === 'api_error' ? 'api_error' : 'tool_error';
        const message =
          r.error ??
          (kind === 'api_error'
            ? 'API error'
            : `Tool ${r.tool_name ?? 'unknown'} failed`);

        return {
          ts: r.ts instanceof Date ? r.ts.toISOString() : String(r.ts),
          kind,
          message,
          model: r.model != null ? String(r.model) : null,
          sessionId: r.session_id != null ? String(r.session_id) : null,
        };
      });

      return reply.status(200).send({ items, total });
    } catch (err) {
      request.log.error(err, 'Failed to fetch errors');
      return reply.status(500).send({ error: 'Failed to fetch errors' });
    }
  });
};
