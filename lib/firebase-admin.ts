import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

let adminApp: App;

if (!getApps().length) {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  const isValidKey = !!privateKey?.includes('BEGIN PRIVATE KEY');
  const useEmulators = Boolean(
    process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST,
  );

  if (useEmulators) {
    adminApp = initializeApp({ projectId: projectId || 'demo-kit-pr-poster' });
  } else if (!projectId || !clientEmail || !privateKey || !isValidKey) {
    console.warn(
      'Firebase Admin SDK credentials not provided or invalid - some functionality will be limited',
    );
    adminApp = initializeApp({});
  } else {
    adminApp = initializeApp({
      credential: cert({
        projectId: projectId,
        clientEmail: clientEmail,
        privateKey: privateKey,
      }),
      projectId,
    });
  }
} else {
  adminApp = getApps()[0] as App;
}

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
export default adminApp;
