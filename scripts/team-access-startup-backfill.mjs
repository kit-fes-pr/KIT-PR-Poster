import { existsSync, readFileSync } from 'node:fs';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const MIGRATION_COLLECTION = 'systemMigrations';
const MIGRATION_ID = 'teamAccessWindowV1';
const RUNNING_LOCK_TIMEOUT_MS = 10 * 60 * 1000;
const TEAM_ACCESS_START_HOUR = 8;
const TEAM_ACCESS_END_HOUR = 21;
const TEAM_ACCESS_WINDOW_VERSION = 1;

function loadDotEnv() {
  if (!existsSync('.env')) return;
  const lines = readFileSync('.env', 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

function getAdminDb() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (projectId && clientEmail && privateKey?.includes('BEGIN PRIVATE KEY')) {
      initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
        projectId,
      });
    } else {
      initializeApp({});
    }
  }

  return getFirestore();
}

function normalizeTeamTimeSlot(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}_(am|pm)$/.test(trimmed) ? trimmed : null;
}

function padHour(hour) {
  return String(hour).padStart(2, '0');
}

function isDateOnlyString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function buildMissingTeamAccessWindowPatch(team) {
  if (
    team.validStartDate &&
    team.validEndDate &&
    !isDateOnlyString(team.validStartDate) &&
    !isDateOnlyString(team.validEndDate)
  ) {
    return null;
  }

  const normalizedTimeSlot = normalizeTeamTimeSlot(team.timeSlot);
  if (!normalizedTimeSlot) return null;

  const dateKey = normalizedTimeSlot.slice(0, 10);
  return {
    validStartDate: `${dateKey}T${padHour(TEAM_ACCESS_START_HOUR)}:00:00+09:00`,
    validEndDate: `${dateKey}T${padHour(TEAM_ACCESS_END_HOUR)}:00:00+09:00`,
    accessWindowVersion: TEAM_ACCESS_WINDOW_VERSION,
  };
}

function toMillis(value) {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  return null;
}

async function claimStartupBackfillRun(db, now) {
  const migrationRef = db.collection(MIGRATION_COLLECTION).doc(MIGRATION_ID);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(migrationRef);
    const state = snapshot.exists ? snapshot.data() : null;

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

async function run() {
  loadDotEnv();
  const db = getAdminDb();
  const migrationRef = db.collection(MIGRATION_COLLECTION).doc(MIGRATION_ID);
  const now = new Date();
  const shouldRun = await claimStartupBackfillRun(db, now);

  if (!shouldRun) {
    console.log('team access window startup backfill skipped: 0 updated');
    return;
  }

  const teamsSnapshot = await db.collection('teams').get();
  let batch = db.batch();
  let updateCount = 0;
  let writesInBatch = 0;

  for (const doc of teamsSnapshot.docs) {
    const patch = buildMissingTeamAccessWindowPatch(doc.data());
    if (!patch) continue;

    batch.update(doc.ref, patch);
    updateCount++;
    writesInBatch++;

    if (writesInBatch >= 450) {
      await batch.commit();
      batch = db.batch();
      writesInBatch = 0;
    }
  }

  if (writesInBatch > 0) {
    await batch.commit();
  }

  await migrationRef.set(
    {
      status: 'complete',
      completedAt: new Date(),
      updatedAt: new Date(),
      updateCount,
    },
    { merge: true },
  );

  console.log(`team access window startup backfill complete: ${updateCount} updated`);
}

run().catch(async (error) => {
  console.error('team access window startup backfill failed:', error);
  try {
    const db = getAdminDb();
    await db
      .collection(MIGRATION_COLLECTION)
      .doc(MIGRATION_ID)
      .set(
        {
          status: 'failed',
          updatedAt: new Date(),
          error: error instanceof Error ? error.message : String(error),
        },
        { merge: true },
      );
  } catch {
    // Keep startup non-blocking even when failure logging is unavailable.
  }
});
