import { cert, initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const KEEP_FROM_YEAR = 2026;
const MAX_BATCH_SIZE = 400;

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseYear(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d{4}$/.test(value.trim())) return Number(value);
  return null;
}

function isDryRun() {
  return (process.env.DRY_RUN || 'true').toLowerCase() !== 'false';
}

function createDb() {
  const useEmulators = process.env.FIREBASE_USE_EMULATORS === 'true';
  const projectId = useEmulators
    ? process.env.FIREBASE_ADMIN_PROJECT_ID?.trim() || 'demo-kit-pr-poster'
    : requireEnv('FIREBASE_ADMIN_PROJECT_ID');
  if (useEmulators) {
    process.env.FIRESTORE_EMULATOR_HOST ||= 'localhost:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||= 'localhost:9099';
    return { app: getApps().length ? getApps()[0] : initializeApp({ projectId }), projectId };
  }

  const clientEmail = requireEnv('FIREBASE_ADMIN_CLIENT_EMAIL');
  const privateKey = requireEnv('FIREBASE_ADMIN_PRIVATE_KEY').replace(/\\n/g, '\n');

  const app = getApps().length
    ? getApps()[0]
    : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });

  return { app, projectId };
}

async function main() {
  const dryRun = isDryRun();
  if (!dryRun && process.env.CONFIRM !== 'DELETE_BEFORE_2026') {
    throw new Error('Set CONFIRM=DELETE_BEFORE_2026 to run this cleanup');
  }

  const { app, projectId } = createDb();
  const db = getFirestore(app);

  const eventSnapshot = await db.collection('distributionEvents').get();
  const oldEventIds = eventSnapshot.docs
    .filter((doc) => {
      const year = parseYear(doc.data().year);
      return year !== null && year < KEEP_FROM_YEAR;
    })
    .map((doc) => doc.id);

  const storesToDelete = [];
  for (let index = 0; index < oldEventIds.length; index += 10) {
    const eventIds = oldEventIds.slice(index, index + 10);
    const stores = await db.collection('stores').where('eventId', 'in', eventIds).get();
    storesToDelete.push(
      ...stores.docs.map((doc) => ({
        ref: doc.ref,
        storeId: doc.id,
        storeName: doc.data().storeName || '(店舗名未設定)',
        eventId: doc.data().eventId,
        year: parseYear(
          eventSnapshot.docs.find((event) => event.id === doc.data().eventId)?.data().year,
        ),
      })),
    );
  }

  const result = {
    keepFromYear: KEEP_FROM_YEAR,
    oldEventCount: oldEventIds.length,
    storeCount: storesToDelete.length,
    dryRun: isDryRun(),
    deletedStoreCount: 0,
  };

  if (result.dryRun) {
    result.candidates = storesToDelete.map(({ ref, ...candidate }) => candidate);
  }

  if (!result.dryRun) {
    for (let index = 0; index < storesToDelete.length; index += MAX_BATCH_SIZE) {
      const batch = db.batch();
      storesToDelete.slice(index, index + MAX_BATCH_SIZE).forEach(({ ref }) => batch.delete(ref));
      await batch.commit();
    }
    result.deletedStoreCount = storesToDelete.length;
  }

  console.log(JSON.stringify({ success: true, projectId, ...result }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
