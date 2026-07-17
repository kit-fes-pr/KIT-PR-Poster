import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { generateKana } from '@/lib/kanaUtils';
import { FieldValue } from 'firebase-admin/firestore';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> },
) {
  try {
    const authHeader = request.headers.get('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    const { storeName, address, distributionStatus, failureReason, distributedCount, notes } =
      await request.json();

    const resolvedParams = await params;
    const storeRef = adminDb.collection('stores').doc(resolvedParams.storeId);
    const storeDoc = await storeRef.get();

    if (!storeDoc.exists) {
      return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 });
    }

    const store = storeDoc.data() as Record<string, unknown>;
    const isAdmin = hasAdminPrivileges(decodedToken as { role?: unknown; isAdmin?: unknown });
    const isRelatedTeam =
      !!decodedToken.teamCode &&
      (store.createdByTeamCode === decodedToken.teamCode ||
        store.distributedBy === decodedToken.teamCode);
    if (!isAdmin && !isRelatedTeam) {
      return NextResponse.json({ error: '更新権限がありません' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    // 基本情報の更新
    if (typeof storeName === 'string' && storeName.trim().length > 0) {
      const name = storeName.trim();
      updateData.storeName = name;
      updateData.storeNameKana = generateKana(name);
    }
    if (typeof address === 'string' && address.trim().length > 0) {
      const addr = address.trim();
      updateData.address = addr;
      updateData.addressKana = generateKana(addr);
    }

    if (typeof notes === 'string') {
      updateData.notes = notes.trim();
    }

    // 配布状態の更新
    if (distributionStatus) {
      updateData.distributionStatus = distributionStatus;
      updateData.distributedBy = decodedToken.teamCode || '';
      if (distributionStatus === 'completed') {
        updateData.distributedAt = new Date();
        updateData.distributedCount = distributedCount || 0;
      } else if (distributionStatus === 'failed') {
        if (failureReason) {
          updateData.failureReason = failureReason;
        }
        // completed 以外では配布枚数は 0 にリセット
        updateData.distributedCount = 0;
        // completed 以外へ戻したら distributedAt を削除
        updateData.distributedAt = FieldValue.delete();
      } else {
        // pending / revisit の場合は枚数 0
        updateData.distributedCount = 0;
        // completed 以外へ戻したら distributedAt を削除
        updateData.distributedAt = FieldValue.delete();
      }
    }

    // ここまでで distributionStatus に応じた更新は完了

    await storeRef.update(updateData);

    const updatedDoc = await storeRef.get();
    const updatedStore = {
      id: updatedDoc.id,
      ...updatedDoc.data(),
    };

    return NextResponse.json({
      success: true,
      store: updatedStore,
    });
  } catch (error) {
    console.error('Update store error:', error);
    return NextResponse.json({ error: '店舗情報の更新に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> },
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const { storeId } = await params;

    const storeRef = adminDb.collection('stores').doc(storeId);
    const storeDoc = await storeRef.get();
    if (!storeDoc.exists) {
      return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 });
    }

    const store = storeDoc.data() as Record<string, unknown>;

    // 管理者は削除可能。それ以外は作成チームのみ削除可能。
    const isAdmin = hasAdminPrivileges(decodedToken as { role?: unknown; isAdmin?: unknown });
    const isCreator = !!decodedToken.teamCode && store.createdByTeamCode === decodedToken.teamCode;
    if (!isAdmin && !isCreator) {
      return NextResponse.json({ error: '削除権限がありません' }, { status: 403 });
    }

    await storeRef.delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete store error:', error);
    return NextResponse.json({ error: '店舗の削除に失敗しました' }, { status: 500 });
  }
}
