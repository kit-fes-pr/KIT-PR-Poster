/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';
import { normalizeGrade } from '@/lib/utils/grade/grade';

type MemberItem = {
  responseId: string;
  name: string;
  nameKana: string;
  grade: number;
  section: string;
  timeSlot: string;
  formId: string;
};

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

    const { searchParams } = new URL(request.url);
    const yearStr = searchParams.get('year');
    if (!yearStr) {
      return NextResponse.json({ error: 'year が必要です' }, { status: 400 });
    }
    const year = parseInt(yearStr, 10);
    if (Number.isNaN(year)) {
      return NextResponse.json({ error: 'year の形式が不正です' }, { status: 400 });
    }

    const { teamId } = await params;

    // 1) 通常の割り当て（assignments）
    const assignmentsSnap = await adminDb
      .collection('assignments')
      .where('year', '==', year)
      .where('teamId', '==', teamId)
      .get();

    const normalAssignments = assignmentsSnap.docs.map(
      (d) =>
        d.data() as {
          responseId: string;
          formId: string;
          timeSlot: string;
        },
    );

    // 3) 回答ドキュメントをまとめて取得
    // 3-1) 通常割り当ては formId があるのでダイレクト参照で取得
    const byForm: Record<string, Set<string>> = {};
    for (const a of normalAssignments) {
      if (!a.formId || !a.responseId) continue;
      byForm[a.formId] = byForm[a.formId] || new Set<string>();
      byForm[a.formId].add(a.responseId);
    }

    const responseMap: Record<string, { formId: string; data: any } | undefined> = {};

    const getAllChunked = async (refs: FirebaseFirestore.DocumentReference[]) => {
      const out: FirebaseFirestore.DocumentSnapshot[] = [];
      const size = 300; // safety chunk size
      for (let i = 0; i < refs.length; i += size) {
        const chunk = refs.slice(i, i + size);
        const snaps = await adminDb.getAll(...chunk);
        out.push(...snaps);
      }
      return out;
    };

    // Fetch normal assignment responses
    for (const [formId, idSet] of Object.entries(byForm)) {
      const refs = Array.from(idSet).map((rid) =>
        adminDb.collection('forms').doc(formId).collection('responses').doc(rid),
      );
      const snaps = await getAllChunked(refs);
      for (const s of snaps) {
        if (s.exists) {
          responseMap[s.id] = { formId, data: s.data() };
        }
      }
    }

    // 4) メンバー配列を構築
    const members: MemberItem[] = [];
    const pushMember = (a: { responseId: string; formId?: string; timeSlot?: string }) => {
      const rec = responseMap[a.responseId];
      if (!rec) return;
      const pd = rec.data?.participantData || {};
      members.push({
        responseId: a.responseId,
        name: pd.name || '-',
        nameKana: pd.nameKana || '',
        grade: normalizeGrade(pd.grade),
        section: pd.section || '-',
        timeSlot: String(a.timeSlot || ''),
        formId: rec.formId || a.formId || 'unknown',
      });
    };

    normalAssignments.forEach((a) => pushMember(a));

    return NextResponse.json({ members });
  } catch (error) {
    console.error('チームメンバー取得エラー:', error);
    return NextResponse.json({ error: 'チームメンバーの取得に失敗しました' }, { status: 500 });
  }
}
