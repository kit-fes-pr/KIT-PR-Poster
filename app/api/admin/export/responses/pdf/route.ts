import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { buildSectionedTableReportPdf } from '@/lib/server/pdf/sectioned-table-report';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';
import {
  formatResponseExportAvailability,
  groupResponseExportRowsByGrade,
  ResponseExportRow,
} from '@/lib/utils/forms/forms';
import { formatDate } from '@/lib/utils/dateUtils';

export const runtime = 'nodejs';

type PdfRequestBody = {
  year?: unknown;
  formTitle?: unknown;
  rows?: unknown;
};

const COL_WIDTHS = [96, 78, 236, 117];

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRows(value: unknown): ResponseExportRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const source = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
    return {
      responseId: normalizeString(source.responseId),
      name: normalizeString(source.name),
      nameKana: normalizeString(source.nameKana),
      grade: Number.isFinite(Number(source.grade)) ? Number(source.grade) : 0,
      section: normalizeString(source.section),
      availableSlots: Array.isArray(source.availableSlots)
        ? source.availableSlots.filter((slot): slot is string => typeof slot === 'string')
        : [],
      submittedAt:
        typeof source.submittedAt === 'string' || typeof source.submittedAt === 'number'
          ? source.submittedAt
          : '',
    };
  });
}

async function buildPdf(input: { year: string; formTitle: string; rows: ResponseExportRow[] }) {
  const grouped = groupResponseExportRowsByGrade(input.rows);
  return buildSectionedTableReportPdf({
    title: '回答者一覧',
    metaText: `フォーム: ${input.formTitle}　回答数: ${input.rows.length}名　出力日時: ${formatDate(new Date())}`,
    header: `工大祭実行委員会-学外配布${input.year}`,
    sections: grouped.map((group) => ({
      label: group.label,
      count: group.rows.length,
      rows: group.rows,
    })),
    emptySectionLabel: '回答なし',
    columns: [
      {
        title: '名前',
        width: COL_WIDTHS[0],
        getText: (row) => row.name || '名前未入力',
        maxLines: 2,
      },
      {
        title: 'セクション',
        width: COL_WIDTHS[1],
        getText: (row) => row.section,
        maxLines: 2,
      },
      {
        title: '参加可能日時',
        width: COL_WIDTHS[2],
        getText: (row) => formatResponseExportAvailability(row),
        maxLines: 3,
      },
      {
        title: '回答日時',
        width: COL_WIDTHS[3],
        getText: (row) => formatDate(row.submittedAt),
        maxLines: 2,
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
    const formTitle = normalizeString(body.formTitle) || '回答者一覧';
    const rows = normalizeRows(body.rows);
    const pdfBytes = await buildPdf({ year, formTitle, rows });

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(`${formTitle}_回答者一覧.pdf`)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('回答者PDF生成エラー:', error);
    return NextResponse.json({ error: 'PDFの生成に失敗しました' }, { status: 500 });
  }
}
