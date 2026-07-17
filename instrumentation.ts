export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const globalForBackfill = globalThis as typeof globalThis & {
    __teamAccessWindowStartupBackfillPromise?: Promise<void>;
  };

  if (globalForBackfill.__teamAccessWindowStartupBackfillPromise) return;

  globalForBackfill.__teamAccessWindowStartupBackfillPromise = (async () => {
    const { runTeamAccessWindowStartupBackfill } =
      await import('./lib/server/team-access-startup-backfill');
    const result = await runTeamAccessWindowStartupBackfill();
    console.log(
      `team access window startup backfill ${result.status}: ${result.updateCount} updated`,
    );
  })().catch((error) => {
    console.error('team access window startup backfill failed:', error);
  });

  await globalForBackfill.__teamAccessWindowStartupBackfillPromise;
}
