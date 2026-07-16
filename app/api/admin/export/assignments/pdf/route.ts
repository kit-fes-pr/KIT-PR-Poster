import { readFile } from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFPage, PDFFont, rgb } from 'pdf-lib';
import { adminAuth } from '@/lib/firebase-admin';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';
import { formatDate } from '@/lib/utils/dateUtils';

export const runtime = 'nodejs';

type PdfRequestBody = {
  year?: unknown;
  rows?: unknown;
};

type AssignmentExportRow = {
  team: string;
  grade: number;
  name: string;
};

type FontEntry = {
  bytes: Uint8Array;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 34;
const HEADER_Y = PAGE_HEIGHT - 28;
const FOOTER_Y = 24;
const CONTENT_TOP = PAGE_HEIGHT - 55;
const CONTENT_BOTTOM = 48;
const FONT_SIZE = 10;
const HEADER_FONT_SIZE = 10;
const TITLE_FONT_SIZE = 18;
const LINE_HEIGHT = 13;
const TABLE_HEADER_HEIGHT = 22;
const TABLE_ROW_HEIGHT = 28;
const COL_WIDTHS = [250, 70, 207];

let fontEntryCache: Promise<FontEntry> | null = null;

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
    };
  });
}

async function loadFontEntry(): Promise<FontEntry> {
  if (!fontEntryCache) {
    fontEntryCache = (async () => {
      try {
        const fontPath = path.join(
          process.cwd(),
          'node_modules',
          '@expo-google-fonts',
          'noto-sans-jp',
          '400Regular',
          'NotoSansJP_400Regular.ttf',
        );
        return {
          bytes: await readFile(fontPath),
        };
      } catch (error) {
        fontEntryCache = null;
        throw error;
      }
    })();
  }

  return fontEntryCache;
}

function splitTextToLines(input: {
  font: PDFFont;
  text: string;
  maxWidth: number;
  size: number;
  maxLines: number;
}): string[] {
  const lines: string[] = [];
  let current = '';
  let currentWidth = 0;
  const chars = Array.from(input.text || '-');

  for (const char of chars) {
    const width = input.font.widthOfTextAtSize(char, input.size);
    if (current && currentWidth + width > input.maxWidth) {
      lines.push(current);
      current = char;
      currentWidth = width;
      if (lines.length >= input.maxLines) break;
    } else {
      current += char;
      currentWidth += width;
    }
  }

  if (lines.length < input.maxLines && current) {
    lines.push(current);
  }

  if (lines.length > 0 && chars.join('').length > lines.join('').length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, -1)}…`;
  }

  return lines.length > 0 ? lines : ['-'];
}

function drawText(input: {
  page: PDFPage;
  font: PDFFont;
  text: string;
  x: number;
  y: number;
  size: number;
  color?: ReturnType<typeof rgb>;
}) {
  input.page.drawText(input.text, {
    x: input.x,
    y: input.y,
    size: input.size,
    font: input.font,
    color: input.color || rgb(0.07, 0.09, 0.15),
  });
}

function drawRect(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: boolean,
) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderWidth: 0.5,
    borderColor: rgb(0.82, 0.84, 0.88),
    color: fill ? rgb(0.95, 0.96, 0.98) : undefined,
  });
}

function drawWrappedCell(input: {
  page: PDFPage;
  font: PDFFont;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  size?: number;
  maxLines?: number;
  fill?: boolean;
}) {
  drawRect(input.page, input.x, input.y, input.width, input.height, Boolean(input.fill));
  const size = input.size || FONT_SIZE;
  const lines = splitTextToLines({
    font: input.font,
    text: input.text,
    maxWidth: input.width - 10,
    size,
    maxLines: input.maxLines || 2,
  });
  const totalTextHeight = lines.length * LINE_HEIGHT;
  let textY = input.y + (input.height - totalTextHeight) / 2 + (LINE_HEIGHT - size) / 2;
  textY += (lines.length - 1) * LINE_HEIGHT;

  for (const line of lines) {
    drawText({
      page: input.page,
      font: input.font,
      text: line,
      x: input.x + 5,
      y: textY,
      size,
    });
    textY -= LINE_HEIGHT;
  }
}

function drawHeaderFooter(input: {
  page: PDFPage;
  font: PDFFont;
  header: string;
  pageNumber: number;
  pageCount: number;
}) {
  drawText({
    page: input.page,
    font: input.font,
    text: input.header,
    x: MARGIN_X,
    y: HEADER_Y,
    size: HEADER_FONT_SIZE,
    color: rgb(0.22, 0.26, 0.32),
  });
  drawText({
    page: input.page,
    font: input.font,
    text: 'PR系',
    x: MARGIN_X,
    y: FOOTER_Y,
    size: HEADER_FONT_SIZE,
    color: rgb(0.22, 0.26, 0.32),
  });
  const pageNumberText = `[${input.pageNumber}/${input.pageCount}]`;
  drawText({
    page: input.page,
    font: input.font,
    text: pageNumberText,
    x: PAGE_WIDTH - MARGIN_X - input.font.widthOfTextAtSize(pageNumberText, HEADER_FONT_SIZE),
    y: FOOTER_Y,
    size: HEADER_FONT_SIZE,
    color: rgb(0.22, 0.26, 0.32),
  });
}

function sortRows(rows: AssignmentExportRow[]): AssignmentExportRow[] {
  const collator = new Intl.Collator('ja');
  return [...rows].sort((a, b) => {
    const teamCompare = collator.compare(a.team, b.team);
    if (teamCompare !== 0) return teamCompare;
    if (b.grade !== a.grade) return b.grade - a.grade;
    return collator.compare(a.name, b.name);
  });
}

async function buildPdf(input: { year: string; rows: AssignmentExportRow[] }) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const fontEntry = await loadFontEntry();
  const font = await pdfDoc.embedFont(fontEntry.bytes, { subset: false });
  const rows = sortRows(input.rows);
  const header = `工大祭実行委員会-学外配布${input.year}`;
  const firstPageIntroHeight = 68;
  const usableHeight = CONTENT_TOP - CONTENT_BOTTOM;
  const pageChunks: AssignmentExportRow[][] = [];
  let current: AssignmentExportRow[] = [];
  let usedHeight = firstPageIntroHeight + TABLE_HEADER_HEIGHT;

  for (const row of rows) {
    if (current.length > 0 && usedHeight + TABLE_ROW_HEIGHT > usableHeight) {
      pageChunks.push(current);
      current = [];
      usedHeight = TABLE_HEADER_HEIGHT;
    }
    current.push(row);
    usedHeight += TABLE_ROW_HEIGHT;
  }

  pageChunks.push(current);

  for (const [pageIndex, items] of pageChunks.entries()) {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawHeaderFooter({
      page,
      font,
      header,
      pageNumber: pageIndex + 1,
      pageCount: pageChunks.length,
    });

    let y = CONTENT_TOP;
    if (pageIndex === 0) {
      drawText({
        page,
        font,
        text: 'チーム割り当て一覧',
        x: MARGIN_X,
        y,
        size: TITLE_FONT_SIZE,
      });
      y -= 20;
      drawText({
        page,
        font,
        text: `年度: ${input.year}　割り当て数: ${rows.length}名　出力日時: ${formatDate(new Date())}`,
        x: MARGIN_X,
        y,
        size: HEADER_FONT_SIZE,
        color: rgb(0.29, 0.33, 0.39),
      });
      page.drawLine({
        start: { x: MARGIN_X, y: y - 8 },
        end: { x: PAGE_WIDTH - MARGIN_X, y: y - 8 },
        thickness: 0.5,
        color: rgb(0.82, 0.84, 0.88),
      });
      y -= 28;
    }

    let x = MARGIN_X;
    for (const [index, title] of ['チーム', '学年', '氏名'].entries()) {
      drawWrappedCell({
        page,
        font,
        text: title,
        x,
        y: y - TABLE_HEADER_HEIGHT,
        width: COL_WIDTHS[index],
        height: TABLE_HEADER_HEIGHT,
        size: FONT_SIZE,
        maxLines: 1,
        fill: true,
      });
      x += COL_WIDTHS[index];
    }
    y -= TABLE_HEADER_HEIGHT;

    for (const row of items) {
      const values = [row.team || '-', row.grade > 0 ? `${row.grade}年` : '-', row.name || '-'];
      x = MARGIN_X;
      for (const [index, value] of values.entries()) {
        drawWrappedCell({
          page,
          font,
          text: value,
          x,
          y: y - TABLE_ROW_HEIGHT,
          width: COL_WIDTHS[index],
          height: TABLE_ROW_HEIGHT,
          maxLines: index === 0 ? 2 : 1,
        });
        x += COL_WIDTHS[index];
      }
      y -= TABLE_ROW_HEIGHT;
    }
  }

  return pdfDoc.save();
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
