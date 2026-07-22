import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { formatTeamAccessPeriod, isWithinTeamAccessWindow } from '@/lib/utils/team/team-access';

export async function POST(request: NextRequest) {
  try {
    const { teamCode } = await request.json();

    if (!teamCode) {
      return NextResponse.json({ error: 'ログインコードを入力してください' }, { status: 400 });
    }

    const teamsRef = adminDb.collection('teams');
    const teamQuery = await teamsRef
      .where('teamCode', '==', teamCode)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (teamQuery.empty) {
      return NextResponse.json(
        { error: '入力されたログインコードが見つかりません' },
        { status: 404 },
      );
    }

    const teamDoc = teamQuery.docs[0];
    const teamData = teamDoc.data();

    // 学外配布日の判定
    const fmtJst = (d: Date) => {
      const parts = new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(d);
      const y = parts.find((p) => p.type === 'year')?.value || '';
      const m = parts.find((p) => p.type === 'month')?.value || '';
      const da = parts.find((p) => p.type === 'day')?.value || '';
      return `${y}-${m}-${da}`;
    };

    const todayKey = fmtJst(new Date());

    let distStartKey: string | null = null;
    let distEndKey: string | null = null;
    try {
      if (teamData.eventId) {
        const evDoc = await adminDb.collection('distributionEvents').doc(teamData.eventId).get();
        if (evDoc.exists) {
          const ev = evDoc.data() as Record<string, unknown>;
          const parseDate = (v: Record<string, unknown> | string | Date) =>
            (v as Record<string, unknown>)?._seconds
              ? new Date(((v as Record<string, unknown>)._seconds as number) * 1000)
              : typeof v === 'string'
                ? new Date(v)
                : new Date(v as unknown as Date);
          if (ev?.distributionStartDate || ev?.distributionEndDate) {
            const ds = ev.distributionStartDate
              ? parseDate(ev.distributionStartDate as Record<string, unknown> | string | Date)
              : null;
            const de = ev.distributionEndDate
              ? parseDate(ev.distributionEndDate as Record<string, unknown> | string | Date)
              : null;
            if (ds && !isNaN(ds.getTime())) distStartKey = fmtJst(ds);
            if (de && !isNaN(de.getTime())) distEndKey = fmtJst(de);
          }
        }
      }
    } catch (error) {
      console.error('エラー内容:', error);
    }

    // イベントの配布日設定が存在し、当日一致（単日一致 or 期間内一致）
    if (!(distStartKey && distEndKey)) {
      return NextResponse.json(
        { error: '配布日が未設定です（イベントの配布日を設定してください）' },
        { status: 403 },
      );
    }
    const inRange =
      distStartKey && distEndKey ? distStartKey <= todayKey && todayKey <= distEndKey : false;
    if (!inRange) {
      const dispDist = `${distStartKey.replace(/-/g, '/')}〜${distEndKey.replace(/-/g, '/')}`;
      return NextResponse.json(
        { error: `本日は配布日ではありません。イベント: ${dispDist}` },
        { status: 403 },
      );
    }

    // 班のアクセス可能日時（範囲）の確認（存在する場合のみチェック）
    const teamAccessResult = isWithinTeamAccessWindow({
      now: new Date(),
      validStartDate: teamData.validStartDate,
      validEndDate: teamData.validEndDate,
      validDate: teamData.validDate,
    });
    if (teamAccessResult === false) {
      return NextResponse.json(
        { error: `現在はアクセス期間外です。班: ${formatTeamAccessPeriod(teamData)}` },
        { status: 403 },
      );
    }

    // 後方互換: 日付のみで保存されていた班のアクセス可能日を確認
    let teamStartKey: string | null = null;
    let teamEndKey: string | null = null;
    try {
      const parseAny = (v: unknown) => {
        const obj = v as
          { _seconds?: number; toDate?: () => Date } | string | Date | undefined | null;
        if (!obj) return new Date('invalid');
        if (typeof obj === 'string') return new Date(obj);
        if (obj instanceof Date) return obj;
        if (typeof obj === 'object') {
          if (typeof obj._seconds === 'number') return new Date(obj._seconds * 1000);
          if (typeof obj.toDate === 'function') return obj.toDate();
        }
        return new Date(obj as unknown as Date);
      };
      if (teamData.validStartDate) {
        const vs = parseAny(teamData.validStartDate);
        if (!isNaN(vs.getTime())) teamStartKey = fmtJst(vs);
      } else if (teamData.validDate) {
        // 後方互換
        const vd = parseAny(teamData.validDate);
        if (!isNaN(vd.getTime())) {
          teamStartKey = fmtJst(vd);
          teamEndKey = fmtJst(vd);
        }
      }
      if (teamData.validEndDate) {
        const ve = parseAny(teamData.validEndDate);
        if (!isNaN(ve.getTime())) teamEndKey = fmtJst(ve);
      }
    } catch (error) {
      console.error('エラー内容:', error);
    }

    if (teamAccessResult === null && (teamStartKey || teamEndKey)) {
      const ts = teamStartKey || teamEndKey; // どちらか片方でも設定されていれば判定対象
      const te = teamEndKey || teamStartKey;
      const teamInRange = ts && te ? ts <= todayKey && todayKey <= te : todayKey === ts;
      if (!teamInRange) {
        const dispTeam =
          ts && te && ts !== te
            ? `${ts.replace(/-/g, '/')}〜${te.replace(/-/g, '/')}`
            : ts
              ? ts.replace(/-/g, '/')
              : '-';
        return NextResponse.json(
          { error: `本日は配布日ではありません。班: ${dispTeam}` },
          { status: 403 },
        );
      }
    }

    // 一時メールアドレス + パスワード方式
    const tempEmail = `${teamData.teamCode}@temp.kodai-poster.local`;
    const tempPassword = randomUUID().replace(/-/g, '').slice(0, 24);

    // 既存ユーザー確認 or 作成
    let uid: string | null = null;
    try {
      const existing = await adminAuth.getUserByEmail(tempEmail);
      uid = existing.uid;
      // 既存の一時ユーザーのパスワードをローテーション
      await adminAuth.updateUser(uid, {
        password: tempPassword,
        emailVerified: true,
        displayName: teamData.teamName || teamData.teamCode,
        disabled: false,
      });
    } catch (error) {
      const firebaseError = error as { code?: string };
      if (firebaseError.code !== 'auth/user-not-found') {
        throw error;
      }
      const created = await adminAuth.createUser({
        email: tempEmail,
        password: tempPassword,
        emailVerified: true,
        displayName: teamData.teamName || teamData.teamCode,
        disabled: false,
      });
      uid = created.uid;
    }

    // カスタムクレームを設定（班情報）
    if (uid) {
      await adminAuth.setCustomUserClaims(uid, {
        teamCode: teamData.teamCode,
        teamId: teamDoc.id,
        role: 'team',
        tempUser: true,
      });
    }

    // 一時アカウント情報を記録
    const tempAccountRef = adminDb.collection('tempAccounts').doc();
    await tempAccountRef.set({
      accountId: tempAccountRef.id,
      teamCode: teamData.teamCode,
      tempEmail,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      isActive: true,
    });

    return NextResponse.json({
      success: true,
      tempEmail,
      tempPassword,
      teamData: {
        teamId: teamDoc.id,
        teamCode: teamData.teamCode,
        teamName: teamData.teamName,
        assignedArea: teamData.assignedArea,
        adjacentAreas: teamData.adjacentAreas,
        year: teamData.year,
      },
    });
  } catch (error) {
    console.error('Team login error:', error);
    return NextResponse.json({ error: 'ログインに失敗しました' }, { status: 500 });
  }
}
