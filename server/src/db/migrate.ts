import { runner } from 'node-pg-migrate';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

function resolveMigrationsDir(): string {
  const fromMeta = fileURLToPath(new URL('../../migrations', import.meta.url));
  if (fs.existsSync(fromMeta)) {
    return fromMeta;
  }
  const fromCwdServer = path.resolve(process.cwd(), 'server/migrations');
  if (fs.existsSync(fromCwdServer)) {
    return fromCwdServer;
  }
  const fromCwd = path.resolve(process.cwd(), 'migrations');
  if (fs.existsSync(fromCwd)) {
    return fromCwd;
  }
  return fromMeta;
}

export async function runMigrations(databaseUrl: string): Promise<void> {
  const migrationsDir = resolveMigrationsDir();
  await runner({
    databaseUrl,
    dir: migrationsDir,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    verbose: true,
  });
}
