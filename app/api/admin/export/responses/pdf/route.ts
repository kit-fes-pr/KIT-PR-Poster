import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { PDFDocument, PDFPage, PDFFont, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { adminAuth } from '@/lib/firebase-admin';
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
const FONT_SIZE = 9;
const HEADER_FONT_SIZE = 10;
const TITLE_FONT_SIZE = 18;
const LINE_HEIGHT = 12;
const TABLE_HEADER_HEIGHT = 20;
const TABLE_ROW_HEIGHT = 43;
const SECTION_TITLE_HEIGHT = 18;
const COL_WIDTHS = [96, 78, 236, 117];

let fontEntryCache: Promise<FontEntry> | null = null;

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

function drawTextRun(input: {
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

function measureTextWidth(input: { font: PDFFont; text: string; size: number }): number {
  return input.font.widthOfTextAtSize(input.text, input.size);
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
    maxWidth: input.width - 8,
    size,
    maxLines: input.maxLines || 3,
  });
  const totalTextHeight = lines.length * LINE_HEIGHT;
  let textY = input.y + (input.height - totalTextHeight) / 2 + (LINE_HEIGHT - size) / 2;
  textY += (lines.length - 1) * LINE_HEIGHT;

  for (const line of lines) {
    drawTextRun({
      page: input.page,
      font: input.font,
      text: line,
      x: input.x + 4,
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
  drawTextRun({
    page: input.page,
    font: input.font,
    text: input.header,
    x: MARGIN_X,
    y: HEADER_Y,
    size: HEADER_FONT_SIZE,
    color: rgb(0.22, 0.26, 0.32),
  });
  drawTextRun({
    page: input.page,
    font: input.font,
    text: 'PR系',
    x: MARGIN_X,
    y: FOOTER_Y,
    size: HEADER_FONT_SIZE,
    color: rgb(0.22, 0.26, 0.32),
  });
  const pageNumberText = `[${input.pageNumber}/${input.pageCount}]`;
  const pageNumberWidth = measureTextWidth({
    font: input.font,
    text: pageNumberText,
    size: HEADER_FONT_SIZE,
  });
  drawTextRun({
    page: input.page,
    font: input.font,
    text: pageNumberText,
    x: PAGE_WIDTH - MARGIN_X - pageNumberWidth,
    y: FOOTER_Y,
    size: HEADER_FONT_SIZE,
    color: rgb(0.22, 0.26, 0.32),
  });
}

async function buildPdf(input: { year: string; formTitle: string; rows: ResponseExportRow[] }) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const fontEntry = await loadFontEntry();
  const font = await pdfDoc.embedFont(fontEntry.bytes, { subset: false });
  const grouped = groupResponseExportRowsByGrade(input.rows);
  const header = `工大祭実行委員会-学外配布${input.year}`;
  const pageChunks: Array<
    Array<
      { type: 'section'; label: string; count: number } | { type: 'row'; row: ResponseExportRow }
    >
  > = [];
  let current: Array<
    { type: 'section'; label: string; count: number } | { type: 'row'; row: ResponseExportRow }
  > = [];
  let usedHeight = 86;

  const pushPage = () => {
    pageChunks.push(current);
    current = [];
    usedHeight = 0;
  };

  for (const group of grouped) {
    const sectionHeight = SECTION_TITLE_HEIGHT + TABLE_HEADER_HEIGHT;
    if (
      current.length > 0 &&
      usedHeight + sectionHeight + TABLE_ROW_HEIGHT > CONTENT_TOP - CONTENT_BOTTOM
    ) {
      pushPage();
    }
    current.push({ type: 'section', label: group.label, count: group.rows.length });
    usedHeight += sectionHeight;
    for (const row of group.rows) {
      if (usedHeight + TABLE_ROW_HEIGHT > CONTENT_TOP - CONTENT_BOTTOM) {
        pushPage();
        current.push({
          type: 'section',
          label: `${group.label}（続き）`,
          count: group.rows.length,
        });
        usedHeight += sectionHeight;
      }
      current.push({ type: 'row', row });
      usedHeight += TABLE_ROW_HEIGHT;
    }
  }

  if (current.length === 0) {
    current.push({ type: 'section', label: '回答なし', count: 0 });
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
      drawTextRun({
        page,
        font,
        text: '回答者一覧',
        x: MARGIN_X,
        y,
        size: TITLE_FONT_SIZE,
      });
      y -= 20;
      drawTextRun({
        page,
        font,
        text: `フォーム: ${input.formTitle}　回答数: ${input.rows.length}名　出力日時: ${formatDate(new Date())}`,
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

    for (const item of items) {
      if (item.type === 'section') {
        drawTextRun({
          page,
          font,
          text: `${item.label} ${item.count}名`,
          x: MARGIN_X,
          y: y - 13,
          size: 12,
        });
        y -= SECTION_TITLE_HEIGHT;
        let x = MARGIN_X;
        for (const [index, title] of ['名前', 'セクション', '参加可能日時', '回答日時'].entries()) {
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
        continue;
      }

      const values = [
        item.row.name || '名前未入力',
        item.row.section,
        formatResponseExportAvailability(item.row),
        formatDate(item.row.submittedAt),
      ];
      let x = MARGIN_X;
      for (const [index, value] of values.entries()) {
        drawWrappedCell({
          page,
          font,
          text: value,
          x,
          y: y - TABLE_ROW_HEIGHT,
          width: COL_WIDTHS[index],
          height: TABLE_ROW_HEIGHT,
          maxLines: index === 2 ? 3 : 2,
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
