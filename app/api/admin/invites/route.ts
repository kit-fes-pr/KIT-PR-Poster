import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';
import {
  buildAdminUserView,
  buildAdminRecordCreatePayload,
  buildAdminRecordUpdatePayload,
  buildAdminInviteDisplayName,
  buildAdminInviteLogPayload,
  normalizeAdminDisplayName,
  normalizeAdminInviteEmail,
  normalizeAdminUserAction,
} from '@/lib/utils/admin/invites';

async function verifyAdminRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: '認証が必要です' }, { status: 401 }),
    };
  }

  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    if (!hasAdminPrivileges(decodedToken as { role?: unknown; isAdmin?: unknown })) {
      return {
        ok: false as const,
        response: NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 }),
      };
    }
    return { ok: true as const, decodedToken };
  } catch (error) {
    console.error('認証トークンの検証に失敗しました:', error);
    return {
      ok: false as const,
      response: NextResponse.json({ error: '認証が必要です' }, { status: 401 }),
    };
  }
}

async function getAuthUsersByUid(
  uids: string[],
): Promise<Map<string, { email?: string; displayName?: string; disabled?: boolean }>> {
  const usersByUid = new Map<
    string,
    { email?: string; displayName?: string; disabled?: boolean }
  >();
  const chunkSize = 100;

  for (let i = 0; i < uids.length; i += chunkSize) {
    const uidChunk = uids.slice(i, i + chunkSize);
    try {
      const result = await adminAuth.getUsers(uidChunk.map((uid) => ({ uid })));
      result.users.forEach((user) => {
        usersByUid.set(user.uid, {
          email: user.email,
          displayName: user.displayName,
          disabled: user.disabled,
        });
      });
      result.notFound.forEach((identifier) => {
        console.error('管理者ユーザーの Auth 情報が見つかりません:', identifier);
      });
    } catch (error) {
      console.error('管理者ユーザーの Auth 情報一括取得に失敗しました:', error);
    }
  }

  return usersByUid;
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAdminRequest(request);
    if (!authResult.ok) return authResult.response;

    const snapshot = await adminDb.collection('admins').orderBy('email', 'asc').get();
    const authUsersByUid = await getAuthUsersByUid(snapshot.docs.map((doc) => doc.id));
    const admins = snapshot.docs.map((doc) =>
      buildAdminUserView(doc.id, doc.data(), authUsersByUid.get(doc.id)),
    );

    return NextResponse.json({ admins });
  } catch (error) {
    console.error('管理者ユーザー一覧取得エラー:', error);
    return NextResponse.json({ error: '管理者ユーザー一覧の取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAdminRequest(request);
    if (!authResult.ok) return authResult.response;
    const { decodedToken } = authResult;

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

export async function PATCH(request: NextRequest) {
  try {
    const authResult = await verifyAdminRequest(request);
    if (!authResult.ok) return authResult.response;
    const { decodedToken } = authResult;

    const body = (await request.json().catch(() => null)) as {
      adminId?: unknown;
      action?: unknown;
      name?: unknown;
    } | null;
    const adminId = typeof body?.adminId === 'string' ? body.adminId.trim() : '';
    const action = normalizeAdminUserAction(body?.action);
    const name = normalizeAdminDisplayName(body?.name);

    if (!adminId || !action) {
      return NextResponse.json({ error: 'adminId と action は必須です' }, { status: 400 });
    }

    const isSelf = adminId === decodedToken.uid;
    if (isSelf && (action === 'suspend' || action === 'revoke')) {
      return NextResponse.json(
        { error: '自分自身の停止または権限剥奪はできません' },
        { status: 400 },
      );
    }

    const adminRef = adminDb.collection('admins').doc(adminId);
    const adminDoc = await adminRef.get();
    if (!adminDoc.exists) {
      return NextResponse.json({ error: '管理者ユーザーが見つかりません' }, { status: 404 });
    }

    const now = new Date();

    if (action === 'updateName') {
      if (!name) {
        return NextResponse.json({ error: '表示名を入力してください' }, { status: 400 });
      }
      await adminAuth.updateUser(adminId, { displayName: name });
      await adminRef.set({ name, updatedAt: now }, { merge: true });
    }

    if (action === 'suspend') {
      await adminAuth.updateUser(adminId, { disabled: true });
      await adminRef.set({ isSuspended: true, suspendedAt: now, updatedAt: now }, { merge: true });
    }

    if (action === 'resume') {
      await adminAuth.updateUser(adminId, { disabled: false });
      await adminRef.set({ isSuspended: false, resumedAt: now, updatedAt: now }, { merge: true });
    }

    if (action === 'revoke') {
      await adminAuth.updateUser(adminId, { disabled: false });
      await adminAuth.setCustomUserClaims(adminId, { role: 'user', isAdmin: false });
      await adminRef.set(
        {
          isActive: false,
          isSuspended: false,
          revokedAt: now,
          revokedBy: decodedToken.email || decodedToken.uid,
          updatedAt: now,
        },
        { merge: true },
      );
    }

    const updatedDoc = await adminRef.get();
    let authUser;
    try {
      authUser = await adminAuth.getUser(adminId);
    } catch (error) {
      console.error(`管理者ユーザーの Auth 情報取得に失敗しました (${adminId}):`, error);
    }

    return NextResponse.json({
      success: true,
      admin: buildAdminUserView(
        adminId,
        updatedDoc.data() as Record<string, unknown>,
        authUser
          ? {
              email: authUser.email,
              displayName: authUser.displayName,
              disabled: authUser.disabled,
            }
          : undefined,
      ),
    });
  } catch (error) {
    console.error('管理者ユーザー更新エラー:', error);
    return NextResponse.json({ error: '管理者ユーザーの更新に失敗しました' }, { status: 500 });
  }
}
