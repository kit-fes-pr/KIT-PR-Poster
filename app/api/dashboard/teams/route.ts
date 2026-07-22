import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { loadAreaMap } from '@/lib/server/team-area';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';
import {
  getDashboardEventIdForYear,
  getTeamYearValue,
  parseDashboardYear,
  teamBelongsToDashboardYear,
} from '@/lib/server/dashboard-year';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const isAdmin = hasAdminPrivileges(decodedToken as { role?: unknown; isAdmin?: unknown });
    const isTeam = decodedToken.role === 'team' && !!decodedToken.teamId;
    if (!isAdmin && !isTeam) {
      return NextResponse.json({ error: '閲覧権限がありません' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseDashboardYear(yearParam) : null;
    if (yearParam && !year) {
      return NextResponse.json({ error: 'year は4桁の年度で指定してください' }, { status: 400 });
    }
    const eventId = year ? await getDashboardEventIdForYear(year) : null;
    const areaMap = await loadAreaMap();

    const snapshot = await adminDb.collection('teams').get();
    const teams = snapshot.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const areaId = String(data.areaId || '');
        const assignedArea = String(data.assignedArea || '');
        const area =
          areaMap.byId.get(areaId) ||
          areaMap.byId.get(assignedArea) ||
          areaMap.byCode.get(assignedArea);
        return {
          teamId: doc.id,
          teamCode: typeof data.teamCode === 'string' ? data.teamCode : '',
          teamName: typeof data.teamName === 'string' ? data.teamName : '',
          assignedArea: typeof data.assignedArea === 'string' ? data.assignedArea : '',
          areaName: area?.areaName || '',
          timeSlot: typeof data.timeSlot === 'string' ? data.timeSlot : '',
          year: getTeamYearValue(data) || undefined,
          eventId: typeof data.eventId === 'string' ? data.eventId : undefined,
          isActive: data.isActive !== false,
          isOwnTeam: decodedToken.teamId === doc.id,
        };
      })
      .filter((team) => {
        if (!team.isActive || !team.teamCode || !team.teamName) return false;
        if (!year) return true;
        return teamBelongsToDashboardYear(team as Record<string, unknown>, year, eventId);
      })
      .sort((a, b) => {
        const yearCompare = Number(b.year || 0) - Number(a.year || 0);
        if (yearCompare !== 0) return yearCompare;
        return a.teamCode.localeCompare(b.teamCode, 'ja');
      });

    return NextResponse.json({ teams });
  } catch (error) {
    console.error('Get dashboard teams error:', error);
    return NextResponse.json({ error: '班一覧の取得に失敗しました' }, { status: 500 });
  }
}
