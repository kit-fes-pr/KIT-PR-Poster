import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const email = process.env.ADMIN_EMAIL;
const displayName = process.env.ADMIN_NAME?.trim();
const password = process.env.ADMIN_PASSWORD;

if (!email || !password || !displayName) {
  console.error('Run `make admin` and enter the email, password, and name interactively.');
  process.exit(1);
}

const adminEmailPattern = /^[^\s@]+@(?:[^\s@]+\.)+kanazawa-it\.ac\.jp$/i;

if (!adminEmailPattern.test(email)) {
  console.error('kanazawa-it.ac.jp のメールアドレスのみ使用可能です');
  process.exit(1);
}

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
const hasAdminCredentials = Boolean(projectId && clientEmail && privateKey);
const useEmulators = process.env.FIREBASE_USE_EMULATORS === 'true' || !hasAdminCredentials;

if (!useEmulators && !hasAdminCredentials) {
  console.error(
    'FIREBASE_ADMIN_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL / FIREBASE_ADMIN_PRIVATE_KEY が必要です',
  );
  process.exit(1);
}

if (useEmulators) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= 'localhost:9099';
  process.env.FIRESTORE_EMULATOR_HOST ||= 'localhost:8080';
}

const app = getApps().length
  ? getApps()[0]
  : useEmulators
    ? initializeApp({ projectId: projectId || 'demo-kit-pr-poster' })
    : initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        projectId,
      });

const adminAuth = getAuth(app);
const adminDb = getFirestore(app);

(async () => {
  let userRecord;
  let operation;
  try {
    const existingUser = await adminAuth.getUserByEmail(email);
    userRecord = await adminAuth.updateUser(existingUser.uid, {
      password,
      displayName,
      emailVerified: true,
      disabled: false,
    });
    operation = 'updated';
  } catch (error) {
    const firebaseError = error;
    if (firebaseError?.code === 'auth/user-not-found') {
      userRecord = await adminAuth.createUser({
        email,
        password,
        displayName,
        emailVerified: true,
        disabled: false,
      });
      operation = 'created';
    } else {
      throw error;
    }
  }

  await adminAuth.setCustomUserClaims(userRecord.uid, {
    role: 'admin',
    isAdmin: true,
  });

  const adminDoc = await adminDb.collection('admins').doc(userRecord.uid).get();
  if (!adminDoc.exists) {
    await adminDb
      .collection('admins')
      .doc(userRecord.uid)
      .set({
        adminId: userRecord.uid,
        email: userRecord.email,
        name: userRecord.displayName || displayName,
        isActive: true,
        createdAt: new Date(),
      });
  }

  const customToken = await adminAuth.createCustomToken(userRecord.uid, {
    role: 'admin',
    isAdmin: true,
  });

  console.log(
    JSON.stringify(
      {
        success: true,
        operation,
        user: {
          uid: userRecord.uid,
          email: userRecord.email,
          name: userRecord.displayName || displayName,
          isAdmin: true,
        },
        customToken,
      },
      null,
      2,
    ),
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
