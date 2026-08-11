/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';
import { normalizeAvailabilitySlots } from '@/lib/utils/availability/availability';
import { normalizeGrade } from '@/lib/utils/grade/grade';
import type { Member } from '@/types';

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const yearStr = searchParams.get('year');
    if (!yearStr) return NextResponse.json({ error: 'year が必要です' }, { status: 400 });
    const year = parseInt(yearStr, 10);
    if (Number.isNaN(year))
      return NextResponse.json({ error: 'year の形式が不正です' }, { status: 400 });

    // 通常割り当てを取得（responseId, formId, teamId, timeSlot）
    const assignmentsSnap = await adminDb.collection('assignments').where('year', '==', year).get();
    const assignments = assignmentsSnap.docs.map(
      (d) =>
        d.data() as {
          responseId: string;
          formId: string;
          teamId: string;
          timeSlot: 'morning' | 'afternoon';
        },
    );

    // formIdごとに responseId をまとめて responses をバルク取得
    const byForm: Record<string, Set<string>> = {};
    for (const a of assignments) {
      if (a.formId && a.responseId) {
        byForm[a.formId] = byForm[a.formId] || new Set<string>();
        byForm[a.formId].add(a.responseId);
      }
    }

    const responseMap: Record<string, { formId: string; data: any } | undefined> = {};

    const getAllChunked = async (refs: FirebaseFirestore.DocumentReference[]) => {
      const out: FirebaseFirestore.DocumentSnapshot[] = [];
      const size = 300;
      for (let i = 0; i < refs.length; i += size) {
        const chunk = refs.slice(i, i + size);
        const snaps = await adminDb.getAll(...chunk);
        out.push(...snaps);
      }
      return out;
    };

    for (const [formId, idSet] of Object.entries(byForm)) {
      const refs = Array.from(idSet).map((rid) =>
        adminDb.collection('forms').doc(formId).collection('responses').doc(rid),
      );
      const snaps = await getAllChunked(refs);
      for (const s of snaps) if (s.exists) responseMap[s.id] = { formId, data: s.data() };
    }

    // レコード生成（responseIdベースで重複排除）
    const memberMap = new Map<string, Member>();

    // 通常割り当て
    for (const a of assignments) {
      const rec = responseMap[a.responseId];
      if (!rec) continue;
      const pd = rec.data?.participantData || {};
      const submittedAt = rec.data?.submittedAt?.toDate
        ? rec.data.submittedAt.toDate()
        : rec.data?.submittedAt
          ? new Date(rec.data.submittedAt)
          : new Date();
      const availableSlots = normalizeAvailabilitySlots(pd.availableSlots);
      memberMap.set(a.responseId, {
        memberId: a.responseId,
        name: pd.name || '-',
        section: pd.section || '-',
        grade: normalizeGrade(pd.grade),
        availableSlots,
        source: 'form',
        teamId: a.teamId,
        createdAt: submittedAt,
      });
    }

    const members = Array.from(memberMap.values());
    return NextResponse.json({ members });
  } catch (error) {
    console.error('メンバー一覧取得エラー:', error);
    return NextResponse.json({ error: 'メンバー一覧の取得に失敗しました' }, { status: 500 });
  }
}
