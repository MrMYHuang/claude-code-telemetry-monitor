import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

export function buildApp(pool: Pool): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  app.get('/healthz', async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      return reply.status(200).send({ status: 'ok' });
    } catch (err) {
      app.log.error(err, 'Health check failed');
      return reply.status(503).send({ status: 'error' });
    }
  });

  return app;
}
