/**
 * Startup and script safety guard to prevent accidental destructive operations
 * or test suite executions against production databases.
 */
export function assertSafeDatabaseUrl(databaseUrl?: string) {
  const url = databaseUrl || process.env.DATABASE_URL || '';
  if (!url) return;

  const isProdName = /aks_dental_prod/i.test(url) || /\b(prod|production)\b/i.test(url);
  const isDirectProdIp = /13\.201\.121\.18/i.test(url) && !url.includes(':5433');

  if (isProdName || isDirectProdIp) {
    const errorMsg = `\n========================================================================\n` +
      `[FATAL SECURITY VIOLATION] DESTRUCTIVE/TEST EXECUTION BLOCKED\n` +
      `Detected production database in DATABASE_URL: ${url.replace(/:[^:@]+@/, ':****@')}\n` +
      `Tests, migrations, and destructive scripts must NEVER run against production!\n` +
      `========================================================================\n`;
    console.error(errorMsg);
    throw new Error('DatabaseSafetyGuard: Execution rejected on production database.');
  }
}
