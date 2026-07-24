import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      console.log('No Authorization header found');
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken, true);
    } catch (error) {
      const firebaseError = error as { code?: string };
      if (firebaseError.code === 'auth/id-token-revoked') {
        return NextResponse.json(
          { error: 'セッションが失効しています。再度ログインしてください' },
          { status: 401 },
        );
      }

      decodedToken = await adminAuth.verifyIdToken(idToken);
    }

    // セッションの最大寿命（24時間）を強制
    const nowSec = Math.floor(Date.now() / 1000);
    const authTime =
      (decodedToken as unknown as { auth_time?: number }).auth_time || decodedToken.iat || nowSec;
    const maxAgeSec = 24 * 60 * 60;
    if (nowSec - authTime > maxAgeSec) {
      return NextResponse.json(
        { error: 'セッションが期限切れです。再度ログインしてください' },
        { status: 401 },
      );
    }

    const isAdmin = hasAdminPrivileges(decodedToken as { role?: unknown; isAdmin?: unknown });
    const { searchParams } = new URL(request.url);
    if (isAdmin && searchParams.get('recordLogin') === '1') {
      const now = new Date();
      await adminDb
        .collection('admins')
        .doc(decodedToken.uid)
        .set(
          {
            adminId: decodedToken.uid,
            email: decodedToken.email || '',
            lastLoginAt: now,
            updatedAt: now,
          },
          { merge: true },
        );
    }

    return NextResponse.json({
      success: true,
      user: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        teamCode: decodedToken.teamCode,
        teamId: decodedToken.teamId,
        role: decodedToken.role,
        isAdmin,
      },
    });
  } catch (error) {
    console.error('Auth verification error:', error);
    return NextResponse.json(
      { error: 'セッションが期限切れです。再度ログインしてください' },
      { status: 401 },
    );
  }
}
