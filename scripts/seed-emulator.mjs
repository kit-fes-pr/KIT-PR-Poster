import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST)
  throw new Error('Emulator only');
const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || 'demo-kit-pr-poster';
const email = process.env.LOCAL_ADMIN_EMAIL || 'developer@kanazawa-it.ac.jp';
const password = process.env.LOCAL_ADMIN_PASSWORD || 'local-password';
const app = initializeApp({ projectId });
const auth = getAuth(app);
const db = getFirestore(app);
let user;
try {
  user = await auth.getUserByEmail(email);
  user = await auth.updateUser(user.uid, { password, emailVerified: true, disabled: false });
} catch (error) {
  if (error?.code !== 'auth/user-not-found') throw error;
  user = await auth.createUser({ email, password, emailVerified: true });
}
await auth.setCustomUserClaims(user.uid, { role: 'admin', isAdmin: true });
await db
  .collection('admins')
  .doc(user.uid)
  .set(
    { adminId: user.uid, email, name: 'Local Developer', isActive: true, createdAt: new Date() },
    { merge: true },
  );
console.log(`Firebase emulator seeded: ${email}`);
