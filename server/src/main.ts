import { getConfig } from './config.js';
import { createPool } from './db/pool.js';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  const config = getConfig();
  const pool = createPool(config.databaseUrl);
  const app = buildApp(pool);

  const shutdown = async () => {
    try {
      await app.close();
      await pool.end();
    } catch {
      // ignore errors during shutdown
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`Server listening on 0.0.0.0:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
