export interface AppConfig {
  databaseUrl: string;
  port: number;
}

export function getConfig(): AppConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const portStr = process.env.PORT;
  const port = portStr ? parseInt(portStr, 10) : 4318;
  if (isNaN(port)) {
    throw new Error(`Invalid PORT value: ${portStr}`);
  }

  return {
    databaseUrl,
    port,
  };
}
