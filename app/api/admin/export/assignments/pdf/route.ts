import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { buildSectionedTableReportPdf } from '@/lib/server/pdf/sectioned-table-report';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';
import { formatDate } from '@/lib/utils/dateUtils';
import type { AssignmentExportRow } from '@/types';

export const runtime = 'nodejs';

type PdfRequestBody = {
  year?: unknown;
  rows?: unknown;
};

const COL_WIDTHS = [80, 447];

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRows(value: unknown): AssignmentExportRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const source = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
    return {
      team: normalizeString(source.team),
      grade: Number.isFinite(Number(source.grade)) ? Number(source.grade) : 0,
      name: normalizeString(source.name),
      isLeader: source.isLeader === true,
    };
  });
}

function sortRows(rows: AssignmentExportRow[]): AssignmentExportRow[] {
  const collator = new Intl.Collator('ja');
  return [...rows].sort((a, b) => {
    const teamCompare = collator.compare(a.team, b.team);
    if (teamCompare !== 0) return teamCompare;
    if (a.isLeader !== b.isLeader) return a.isLeader ? -1 : 1;
    if (b.grade !== a.grade) return b.grade - a.grade;
    return collator.compare(a.name, b.name);
  });
}

function groupRowsByTeam(
  rows: AssignmentExportRow[],
): Array<{ team: string; rows: AssignmentExportRow[] }> {
  const groups = new Map<string, AssignmentExportRow[]>();

  for (const row of rows) {
    const team = row.team || '班未設定';
    const groupRows = groups.get(team);
    if (groupRows) {
      groupRows.push(row);
    } else {
      groups.set(team, [row]);
    }
  }

  return Array.from(groups.entries()).map(([team, groupRows]) => ({
    team,
    rows: groupRows,
  }));
}

async function buildPdf(input: { year: string; rows: AssignmentExportRow[] }) {
  const groups = groupRowsByTeam(sortRows(input.rows));
  return buildSectionedTableReportPdf({
    title: 'チーム割り当て一覧',
    metaText: `年度: ${input.year}　割り当て数: ${input.rows.length}名　出力日時: ${formatDate(new Date())}`,
    legendText: '○ : 班リーダー',
    header: `工大祭実行委員会-学外配布${input.year}`,
    sections: groups.map((group) => ({
      label: group.team,
      count: group.rows.length,
      rows: group.rows,
    })),
    emptySectionLabel: '割り当てなし',
    columns: [
      {
        title: '学年',
        width: COL_WIDTHS[0],
        getText: (row) => (row.grade > 0 ? `${row.grade}年` : '-'),
        maxLines: 1,
      },
      {
        title: '氏名',
        width: COL_WIDTHS[1],
        getText: (row) => (row.isLeader ? `○ ${row.name || '-'}` : row.name || '-'),
        maxLines: 3,
      },
    ],
  });
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
    if (!hasAdminPrivileges(decodedToken as { role?: unknown; isAdmin?: unknown })) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const body = (await request.json()) as PdfRequestBody;
    const year = normalizeString(body.year);
    const rows = normalizeRows(body.rows);
    const pdfBytes = await buildPdf({ year, rows });

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(`チーム割り当て_${year}.pdf`)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('チーム割り当てPDF生成エラー:', error);
    return NextResponse.json({ error: 'PDFの生成に失敗しました' }, { status: 500 });
  }
}
