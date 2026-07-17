import { adminDb } from '@/lib/firebase-admin';
import { backfillMissingTeamAccessWindows } from '@/lib/server/team-access-backfill';

const MIGRATION_COLLECTION = 'systemMigrations';
const MIGRATION_ID = 'teamAccessWindowV1';
const RUNNING_LOCK_TIMEOUT_MS = 10 * 60 * 1000;

type MigrationState = {
  status?: unknown;
  startedAt?: unknown;
};

function toMillis(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in value &&
    typeof (value as { toMillis?: () => number }).toMillis === 'function'
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
}

async function claimStartupBackfillRun(now: Date) {
  const migrationRef = adminDb.collection(MIGRATION_COLLECTION).doc(MIGRATION_ID);

  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(migrationRef);
    const state = snapshot.exists ? (snapshot.data() as MigrationState) : null;

    if (state?.status === 'complete') return false;

    const startedAtMs = toMillis(state?.startedAt);
    const runningLockIsActive =
      state?.status === 'running' &&
      startedAtMs !== null &&
      now.getTime() - startedAtMs < RUNNING_LOCK_TIMEOUT_MS;
    if (runningLockIsActive) return false;

    transaction.set(
      migrationRef,
      {
        status: 'running',
        startedAt: now,
        updatedAt: now,
        lockExpiresAt: new Date(now.getTime() + RUNNING_LOCK_TIMEOUT_MS),
      },
      { merge: true },
    );
    return true;
  });
}

export async function runTeamAccessWindowStartupBackfill() {
  const migrationRef = adminDb.collection(MIGRATION_COLLECTION).doc(MIGRATION_ID);
  const now = new Date();
  const shouldRun = await claimStartupBackfillRun(now);

  if (!shouldRun) {
    return { status: 'skipped' as const, updateCount: 0 };
  }

  try {
    const teamsSnapshot = await adminDb.collection('teams').get();
    const updateCount = await backfillMissingTeamAccessWindows(teamsSnapshot.docs, {
      batchFactory: () => adminDb.batch(),
    });

    await migrationRef.set(
      {
        status: 'complete',
        completedAt: new Date(),
        updatedAt: new Date(),
        updateCount,
      },
      { merge: true },
    );

    return { status: 'complete' as const, updateCount };
  } catch (error) {
    await migrationRef.set(
      {
        status: 'failed',
        updatedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
      },
      { merge: true },
    );
    throw error;
  }
}
