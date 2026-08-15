export interface ServerConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  host: string;
  corsOrigin: string | string[];
  publicUrl: string;
  sessionTtlMs: number;
  clientDistPath: string | null;
}

function parseCorsOrigin(raw: string | undefined): string | string[] {
  if (!raw || raw === '*') return '*';
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length === 1 ? parts[0]! : parts;
}

export function loadConfig(): ServerConfig {
  const nodeEnv = (process.env.NODE_ENV ?? 'development') as ServerConfig['nodeEnv'];
  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? '0.0.0.0';
  const publicUrl = (process.env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, '');
  const sessionTtlMs = Number(process.env.SESSION_TTL_MS ?? 86_400_000);

  return {
    nodeEnv,
    port,
    host,
    corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
    publicUrl,
    sessionTtlMs,
    clientDistPath: process.env.CLIENT_DIST_PATH ?? null,
  };
}
