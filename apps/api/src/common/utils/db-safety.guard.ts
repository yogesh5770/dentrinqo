/**
 * Startup and script safety guard to prevent accidental destructive operations
 * or test suite executions against production databases.
 */
export function assertSafeDatabaseUrl(databaseUrl?: string) {
  const url = databaseUrl || process.env.DATABASE_URL || '';
  if (!url) return;

  // 1. Strictly forbid AWS EC2 production host IP under any circumstance
  const isDirectProdIp = /13\.201\.121\.18/i.test(url);

  // 2. Detect production database names
  const isProdName =
    /aks_dental_prod/i.test(url) ||
    /\b(prod|production)\b/i.test(url) ||
    (url.includes('/aks_dental') && !url.includes('aks_dental_dev') && !url.includes('aks_dental_test'));

  if (isDirectProdIp || isProdName) {
    const errorMsg = `\n========================================================================\n` +
      `[FATAL SECURITY VIOLATION] DESTRUCTIVE/TEST EXECUTION BLOCKED\n` +
      `Detected production database or forbidden AWS EC2 host in DATABASE_URL:\n` +
      `${url.replace(/:[^:@]+@/, ':****@')}\n` +
      `Dev and test databases MUST run on the Oracle staging server (aks_dental_dev or aks_dental_test).\n` +
      `Tests, migrations, and destructive scripts must NEVER run against production or AWS EC2!\n` +
      `========================================================================\n`;
    console.error(errorMsg);
    throw new Error('DatabaseSafetyGuard: Execution rejected on production database or production host.');
  }
}

