import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    if (!hasAdminPrivileges(decodedToken as { role?: unknown; isAdmin?: unknown })) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const { teamId } = await params;
    const teamDoc = await adminDb.collection('teams').doc(teamId).get();
    if (!teamDoc.exists) {
      return NextResponse.json({ error: 'チームが見つかりません' }, { status: 404 });
    }
    const teamData = teamDoc.data() as Record<string, unknown>;

    const storesSnapshot = await adminDb
      .collection('stores')
      .where('eventId', '==', teamData.eventId)
      .where('distributedBy', '==', teamData.teamCode)
      .get();

    const stores = storesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    // 追加の集計
    const completed = stores.filter(
      (s: Record<string, unknown>) =>
        s.distributionStatus === 'completed' || s.distributionStatus === 'revisit',
    ).length;
    const failed = stores.filter(
      (s: Record<string, unknown>) => s.distributionStatus === 'failed',
    ).length;
    const revisit = stores.filter(
      (s: Record<string, unknown>) =>
        s.requiresPosterPickup === true || s.distributionStatus === 'revisit',
    ).length;
    const total = stores.length;

    return NextResponse.json({
      team: { id: teamDoc.id, ...teamData },
      summary: { total, completed, failed, revisit },
      stores,
    });
  } catch (error) {
    console.error('Get team stores error:', error);
    return NextResponse.json({ error: 'チーム店舗の取得に失敗しました' }, { status: 500 });
  }
}
