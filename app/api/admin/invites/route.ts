import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';
import {
  buildAdminUserView,
  buildAdminRecordCreatePayload,
  buildAdminRecordUpdatePayload,
  buildAdminInviteDisplayName,
  buildAdminInviteLogPayload,
  normalizeAdminInviteEmail,
} from '@/lib/utils/admin/invites';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (error) {
      console.error('認証トークンの検証に失敗しました:', error);
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }
    if (!hasAdminPrivileges(decodedToken as { role?: unknown; isAdmin?: unknown })) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const snapshot = await adminDb.collection('admins').orderBy('email', 'asc').get();
    const admins = snapshot.docs.map((doc) => buildAdminUserView(doc.id, doc.data()));

    return NextResponse.json({ admins });
  } catch (error) {
    console.error('管理者ユーザー一覧取得エラー:', error);
    return NextResponse.json({ error: '管理者ユーザー一覧の取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (error) {
      console.error('認証トークンの検証に失敗しました:', error);
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }
    if (!hasAdminPrivileges(decodedToken as { role?: unknown; isAdmin?: unknown })) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as {
      email?: string;
    } | null;
    const email = normalizeAdminInviteEmail(body?.email);

    if (!email) {
      return NextResponse.json(
        { error: 'kanazawa-it.ac.jp のメールアドレスを入力してください' },
        { status: 400 },
      );
    }

    const fallbackDisplayName = buildAdminInviteDisplayName(email);

    let userRecord;
    let operation: 'created' | 'updated';
    try {
      const existingUser = await adminAuth.getUserByEmail(email);
      const displayName = existingUser.displayName || fallbackDisplayName;
      userRecord = await adminAuth.updateUser(existingUser.uid, {
        displayName,
        emailVerified: true,
        disabled: false,
      });
      operation = 'updated';
    } catch (error) {
      const firebaseError = error as { code?: string };
      if (firebaseError.code !== 'auth/user-not-found') {
        throw error;
      }

      const displayName = fallbackDisplayName;
      userRecord = await adminAuth.createUser({
        email,
        displayName,
        emailVerified: true,
        disabled: false,
      });
      operation = 'created';
    }

    await adminAuth.setCustomUserClaims(userRecord.uid, {
      role: 'admin',
      isAdmin: true,
    });

    const adminRef = adminDb.collection('admins').doc(userRecord.uid);
    const adminDoc = await adminRef.get();
    if (adminDoc.exists) {
      await adminRef.set(
        buildAdminRecordUpdatePayload({
          email: userRecord.email || email,
          displayName: userRecord.displayName || fallbackDisplayName,
          now: new Date(),
        }),
        { merge: true },
      );
    } else {
      await adminRef.set(
        buildAdminRecordCreatePayload({
          adminId: userRecord.uid,
          email: userRecord.email || email,
          displayName: userRecord.displayName || fallbackDisplayName,
          now: new Date(),
        }),
      );
    }

    await adminDb.collection('adminInvites').add(
      buildAdminInviteLogPayload({
        email,
        displayName: userRecord.displayName || fallbackDisplayName,
        invitedBy: decodedToken.email || decodedToken.uid,
        now: new Date(),
        operation,
        uid: userRecord.uid,
      }),
    );

    return NextResponse.json({
      success: true,
      invite: {
        email,
        name: userRecord.displayName || fallbackDisplayName,
        operation,
      },
    });
  } catch (error) {
    console.error('管理者招待エラー:', error);
    return NextResponse.json({ error: 'ユーザー招待に失敗しました' }, { status: 500 });
  }
}
