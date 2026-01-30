/**
 * Returns the database connection string, appending sslmode when PGSSLMODE
 * is set (e.g. PGSSLMODE=require for Crunchy Postgres on OpenShift).
 * When sslmode is set, also adds uselibpqcompat=true so the pg driver uses
 * libpq semantics (sslmode=require = encrypt only, no cert verify), allowing
 * self-signed certs used by Crunchy Postgres in-cluster.
 */
export function getDatabaseConnectionString(url: string | undefined): string {
  if (!url) return url ?? '';
  const sslMode = process.env.PGSSLMODE;
  if (!sslMode) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('sslmode', sslMode);
    parsed.searchParams.set('uselibpqcompat', 'true');
    return parsed.toString();
  } catch {
    return url;
  }
}

export interface PrismaPgOptions {
  connectionString: string;
  ssl?: { rejectUnauthorized: boolean };
}

/**
 * Returns options for PrismaPg adapter: connection string (with sslmode if
 * PGSSLMODE set) and optional ssl config. When PGSSLREJECTUNAUTHORIZED=false
 * (e.g. OpenShift Crunchy Postgres self-signed cert), disables TLS cert verification.
 */
export function getPrismaPgOptions(url: string | undefined): PrismaPgOptions {
  const connectionString = getDatabaseConnectionString(url);
  const rejectUnauthorized = process.env.PGSSLREJECTUNAUTHORIZED;
  const ssl =
    rejectUnauthorized === 'false'
      ? { rejectUnauthorized: false as const }
      : undefined;
  return { connectionString, ...(ssl && { ssl }) };
}
