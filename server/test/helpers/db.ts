import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { createPool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';

export async function startTestDb(): Promise<{ pool: Pool; stop(): Promise<void> }> {
  const container = await new PostgreSqlContainer('postgres:16').start();
  const uri = container.getConnectionUri();
  await runMigrations(uri);
  const pool = createPool(uri);
  return {
    pool,
    stop: async () => {
      await pool.end();
      await container.stop();
    },
  };
}
