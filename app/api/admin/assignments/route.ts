import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';
import {
  buildManualAssignmentRecords,
  preserveExistingAssignmentLabels,
} from '@/lib/utils/assignment/assignment-api';
import {
  normalizeAssignmentAuthHeader,
  parseAssignmentDeletePayload,
  parseAssignmentListQuery,
  parseAssignmentMutationPayload,
} from '@/lib/utils/assignment/assignment-route';
import { FirestoreCache } from '@/lib/utils/server-cache';

export async function GET(request: NextRequest) {
  try {
    const idToken = normalizeAssignmentAuthHeader(request.headers.get('authorization'));
    if (!idToken) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    if (!hasAdminPrivileges(decodedToken as { role?: unknown; isAdmin?: unknown })) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const parsedQuery = parseAssignmentListQuery(searchParams);
    if ('error' in parsedQuery) {
      return NextResponse.json({ error: parsedQuery.error }, { status: 400 });
    }

    let query = adminDb.collection('assignments').where('year', '==', parsedQuery.year);

    if (parsedQuery.formId) {
      query = query.where('formId', '==', parsedQuery.formId);
    }

    const assignmentsSnapshot = await query.get();

    const assignments = assignmentsSnapshot.docs.map((doc) => ({
      assignmentId: doc.id,
      ...doc.data(),
      assignedAt: doc.data().assignedAt?.toDate
        ? doc.data().assignedAt.toDate()
        : doc.data().assignedAt,
    }));

    return NextResponse.json({ assignments });
  } catch (error) {
    console.error('割り当て取得エラー:', error);
    return NextResponse.json({ error: '割り当ての取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const idToken = normalizeAssignmentAuthHeader(request.headers.get('authorization'));
    if (!idToken) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    if (!hasAdminPrivileges(decodedToken as { role?: unknown; isAdmin?: unknown })) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const parsedPayload = parseAssignmentMutationPayload(await request.json());
    if ('error' in parsedPayload) {
      return NextResponse.json({ error: parsedPayload.error }, { status: 400 });
    }

    const manualAssignments =
      parsedPayload.targets.length > 0
        ? buildManualAssignmentRecords({
            year: parsedPayload.year,
            formId: parsedPayload.formId,
            responseId: parsedPayload.responseId,
            targets: parsedPayload.targets,
            assignedAt: new Date(),
          })
        : [];
    if (!manualAssignments) {
      return NextResponse.json(
        { error: 'year, formId, responseId, teamId, timeSlot が必要です' },
        { status: 400 },
      );
    }

    const { year, formId, responseId } = parsedPayload;

    // 手動保存では同一参加者の割り当て先一覧を置き換える
    const query = await adminDb
      .collection('assignments')
      .where('year', '==', year)
      .where('formId', '==', formId)
      .where('responseId', '==', responseId)
      .get();
    const batch = adminDb.batch();
    query.docs.forEach((doc) => batch.delete(doc.ref));

    const assignmentIds: string[] = [];
    const assignmentsToSave = preserveExistingAssignmentLabels(
      manualAssignments,
      query.docs.map((doc) => {
        const data = doc.data();
        return {
          teamId: data.teamId,
          assignedAt: data.assignedAt,
          assignedBy: data.assignedBy,
        };
      }),
    );

    assignmentsToSave.forEach((assignment) => {
      const docRef = adminDb.collection('assignments').doc();
      assignmentIds.push(docRef.id);
      batch.set(docRef, {
        ...assignment,
      });
    });

    await batch.commit();

    if (year) {
      FirestoreCache.invalidateYear(Number(year));
    }

    return NextResponse.json({ success: true, assignmentIds, assignmentId: assignmentIds[0] });
  } catch (error) {
    console.error('割り当て作成エラー:', error);
    return NextResponse.json({ error: '割り当ての作成に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const idToken = normalizeAssignmentAuthHeader(request.headers.get('authorization'));
    if (!idToken) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    if (!hasAdminPrivileges(decodedToken as { role?: unknown; isAdmin?: unknown })) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const parsedPayload = parseAssignmentDeletePayload(await request.json());
    if ('error' in parsedPayload) {
      return NextResponse.json({ error: parsedPayload.error }, { status: 400 });
    }

    let query = adminDb.collection('assignments').where('year', '==', parsedPayload.year);

    if (parsedPayload.formId) {
      query = query.where('formId', '==', parsedPayload.formId);
    }

    const assignmentsSnapshot = await query.get();
    const docsToDelete =
      parsedPayload.assignedBy === 'auto'
        ? assignmentsSnapshot.docs.filter((doc) => doc.data().assignedBy !== 'manual')
        : assignmentsSnapshot.docs;

    const batch = adminDb.batch();
    docsToDelete.forEach((doc) => {
      batch.delete(doc.ref);
    });

    if (docsToDelete.length > 0) {
      await batch.commit();
    }

    if (docsToDelete.length > 0) {
      FirestoreCache.invalidateYear(parsedPayload.year);
    }

    return NextResponse.json({
      message:
        parsedPayload.assignedBy === 'auto'
          ? '自動割り当てが削除されました'
          : '割り当てが削除されました',
      deletedCount: docsToDelete.length,
    });
  } catch (error) {
    console.error('割り当て削除エラー:', error);
    return NextResponse.json({ error: '割り当ての削除に失敗しました' }, { status: 500 });
  }
}
