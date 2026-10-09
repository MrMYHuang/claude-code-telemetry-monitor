import type { FastifyPluginAsync } from 'fastify';
import type { Pool } from 'pg';
import { parseLogs } from './logs.js';
import { parseMetrics } from './metrics.js';
import { insertEvents, insertMetricPoints } from './store.js';

export interface IngestRoutesOptions {
  pool: Pool;
}

export const ingestRoutes: FastifyPluginAsync<IngestRoutesOptions> = async (app, options) => {
  const { pool } = options;

  app.post('/v1/logs', async (request, reply) => {
    let rows;
    try {
      rows = parseLogs(request.body);
    } catch (err) {
      request.log.error(err, 'Failed to parse logs payload');
      return reply.status(400).send({ error: 'Malformed logs payload' });
    }

    try {
      await insertEvents(pool, rows);
      return reply.status(200).send({});
    } catch (err) {
      request.log.error(err, 'Database failure while inserting events');
      return reply.status(503).send({ error: 'Database unavailable' });
    }
  });

  app.post('/v1/metrics', async (request, reply) => {
    let rows;
    try {
      rows = parseMetrics(request.body);
    } catch (err) {
      request.log.error(err, 'Failed to parse metrics payload');
      return reply.status(400).send({ error: 'Malformed metrics payload' });
    }

    try {
      await insertMetricPoints(pool, rows);
      return reply.status(200).send({});
    } catch (err) {
      request.log.error(err, 'Database failure while inserting metric points');
      return reply.status(503).send({ error: 'Database unavailable' });
    }
  });
};
