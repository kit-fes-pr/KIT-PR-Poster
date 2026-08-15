import { readFile } from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import TwoDimensionalCodeGenerator from 'qrcode';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { hasAdminPrivileges } from '@/lib/utils/admin/auth';
import { formatDate } from '@/lib/utils/dateUtils';
import {
  buildTeamManualLoginUrl,
  normalizeTeamManualRows,
  TEAM_MANUAL_BASE_URL,
  TeamManualRow,
} from '@/lib/utils/team/team-manual';
import { compareTeamsByDistributionSlot } from '@/lib/utils/team/team-sort';

export const runtime = 'nodejs';

type PdfRequestBody = {
  year?: unknown;
  rows?: unknown;
  separate?: unknown;
};

type FontEntry = {
  bytes: Uint8Array;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 48;
const HEADER_Y = PAGE_HEIGHT - 30;
const FOOTER_Y = 24;
const TITLE_SIZE = 22;
const HEADING_SIZE = 13;
const BODY_SIZE = 11;
const SMALL_SIZE = 9;

let fontEntryCache: Promise<FontEntry> | null = null;

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isAsciiPrintable(value: string): boolean {
  return /^[\x20-\x7e]+$/.test(value);
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function sanitizeFileName(value: string): string {
  return (
    value
      .trim()
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 80) || 'team'
  );
}

function buildCrc32Table(): number[] {
  return Array.from({ length: 256 }, (_, index) => {
    let c = index;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return c >>> 0;
  });
}

const CRC32_TABLE = buildCrc32Table();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pushUint16(bytes: number[], value: number) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushUint32(bytes: number[], value: number) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function buildZip(files: Array<{ name: string; bytes: Uint8Array }>): Uint8Array {
  const chunks: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encodeUtf8(file.name);
    const checksum = crc32(file.bytes);
    const localHeader: number[] = [];
    pushUint32(localHeader, 0x04034b50);
    pushUint16(localHeader, 20);
    pushUint16(localHeader, 0x0800);
    pushUint16(localHeader, 0);
    pushUint16(localHeader, 0);
    pushUint16(localHeader, 0);
    pushUint32(localHeader, checksum);
    pushUint32(localHeader, file.bytes.length);
    pushUint32(localHeader, file.bytes.length);
    pushUint16(localHeader, nameBytes.length);
    pushUint16(localHeader, 0);
    const localChunk = concatUint8Arrays([Uint8Array.from(localHeader), nameBytes, file.bytes]);
    chunks.push(localChunk);

    const centralHeader: number[] = [];
    pushUint32(centralHeader, 0x02014b50);
    pushUint16(centralHeader, 20);
    pushUint16(centralHeader, 20);
    pushUint16(centralHeader, 0x0800);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint32(centralHeader, checksum);
    pushUint32(centralHeader, file.bytes.length);
    pushUint32(centralHeader, file.bytes.length);
    pushUint16(centralHeader, nameBytes.length);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint32(centralHeader, 0);
    pushUint32(centralHeader, offset);
    centralDirectory.push(concatUint8Arrays([Uint8Array.from(centralHeader), nameBytes]));
    offset += localChunk.length;
  }

  const centralStart = offset;
  chunks.push(...centralDirectory);
  const centralSize = centralDirectory.reduce((sum, chunk) => sum + chunk.length, 0);
  const endRecord: number[] = [];
  pushUint32(endRecord, 0x06054b50);
  pushUint16(endRecord, 0);
  pushUint16(endRecord, 0);
  pushUint16(endRecord, files.length);
  pushUint16(endRecord, files.length);
  pushUint32(endRecord, centralSize);
  pushUint32(endRecord, centralStart);
  pushUint16(endRecord, 0);
  chunks.push(Uint8Array.from(endRecord));

  return concatUint8Arrays(chunks);
}

async function loadTeamManualRowsForYear(year: string): Promise<TeamManualRow[]> {
  const numericYear = /^\d{4}$/.test(year) ? Number(year) : Number.NaN;
  if (!Number.isFinite(numericYear)) return [];

  const snapshotMap = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  const byYear = await adminDb.collection('teams').where('year', '==', numericYear).get();
  byYear.docs.forEach((doc) => snapshotMap.set(doc.id, doc));

  const eventSnap = await adminDb
    .collection('distributionEvents')
    .where('year', '==', numericYear)
    .limit(1)
    .get();
  if (!eventSnap.empty) {
    const byEvent = await adminDb
      .collection('teams')
      .where('eventId', '==', eventSnap.docs[0].id)
      .get();
    byEvent.docs.forEach((doc) => snapshotMap.set(doc.id, doc));
  }

  return normalizeTeamManualRows(
    Array.from(snapshotMap.values()).map((doc) => ({ teamId: doc.id, ...doc.data() })),
  );
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

function drawWrappedText(input: {
  page: PDFPage;
  font: PDFFont;
  text: string;
  x: number;
  y: number;
  size: number;
  maxWidth: number;
  maxLines: number;
  lineHeight?: number;
  color?: ReturnType<typeof rgb>;
}) {
  const lineHeight = input.lineHeight || input.size + 5;
  const lines = splitTextToLines(input);
  lines.forEach((line, index) => {
    drawText({
      page: input.page,
      font: input.font,
      text: line,
      x: input.x,
      y: input.y - index * lineHeight,
      size: input.size,
      color: input.color,
    });
  });
}

async function embedTwoDimensionalCode(pdfDoc: PDFDocument, value: string) {
  const pngBytes = await TwoDimensionalCodeGenerator.toBuffer(value, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 4,
    width: 680,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  });
  return pdfDoc.embedPng(pngBytes);
}

function drawHeaderFooter(input: {
  page: PDFPage;
  font: PDFFont;
  year: string;
  pageNumber: number;
  pageCount: number;
}) {
  drawText({
    page: input.page,
    font: input.font,
    text: `工大祭実行委員会-学外配布${input.year}`,
    x: MARGIN_X,
    y: HEADER_Y,
    size: SMALL_SIZE,
    color: rgb(0.22, 0.26, 0.32),
  });
  drawText({
    page: input.page,
    font: input.font,
    text: 'PR系',
    x: MARGIN_X,
    y: FOOTER_Y,
    size: SMALL_SIZE,
    color: rgb(0.22, 0.26, 0.32),
  });
  const pageNumberText = `[${input.pageNumber}/${input.pageCount}]`;
  drawText({
    page: input.page,
    font: input.font,
    text: pageNumberText,
    x: PAGE_WIDTH - MARGIN_X - input.font.widthOfTextAtSize(pageNumberText, SMALL_SIZE),
    y: FOOTER_Y,
    size: SMALL_SIZE,
    color: rgb(0.22, 0.26, 0.32),
  });
}

async function buildPdf(input: { year: string; rows: TeamManualRow[] }) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const fontEntry = await loadFontEntry();
  const font = await pdfDoc.embedFont(fontEntry.bytes, { subset: false });
  const latinBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const rows = [...input.rows].sort(compareTeamsByDistributionSlot);

  for (const [index, row] of rows.entries()) {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const loginUrl = buildTeamManualLoginUrl(row.teamCode);
    const twoDimensionalCodeImage = await embedTwoDimensionalCode(pdfDoc, loginUrl);

    drawHeaderFooter({
      page,
      font,
      year: input.year,
      pageNumber: index + 1,
      pageCount: rows.length,
    });

    drawText({ page, font, text: '配布班用マニュアル', x: MARGIN_X, y: 760, size: TITLE_SIZE });
    drawText({
      page,
      font,
      text: `出力日時: ${formatDate(new Date())}`,
      x: MARGIN_X,
      y: 734,
      size: SMALL_SIZE,
      color: rgb(0.38, 0.42, 0.48),
    });
    page.drawLine({
      start: { x: MARGIN_X, y: 718 },
      end: { x: PAGE_WIDTH - MARGIN_X, y: 718 },
      thickness: 0.5,
      color: rgb(0.82, 0.84, 0.88),
    });

    drawText({ page, font, text: 'チーム名', x: MARGIN_X, y: 678, size: HEADING_SIZE });
    drawWrappedText({
      page,
      font,
      text: row.teamName,
      x: MARGIN_X,
      y: 652,
      size: 28,
      maxWidth: 310,
      maxLines: 2,
      lineHeight: 34,
    });

    drawText({ page, font, text: 'チームコード', x: MARGIN_X, y: 564, size: HEADING_SIZE });
    drawText({
      page,
      font: isAsciiPrintable(row.teamCode) ? latinBoldFont : font,
      text: row.teamCode,
      x: MARGIN_X,
      y: 527,
      size: 30,
    });

    drawText({ page, font, text: 'アクセス先URL', x: MARGIN_X, y: 472, size: HEADING_SIZE });
    drawText({ page, font, text: TEAM_MANUAL_BASE_URL, x: MARGIN_X, y: 448, size: BODY_SIZE });

    drawText({ page, font, text: '2次元コード', x: 365, y: 678, size: HEADING_SIZE });
    page.drawImage(twoDimensionalCodeImage, {
      x: 350,
      y: 500,
      width: 170,
      height: 170,
    });

    page.drawRectangle({
      x: MARGIN_X,
      y: 240,
      width: PAGE_WIDTH - MARGIN_X * 2,
      height: 150,
      borderColor: rgb(0.82, 0.84, 0.88),
      borderWidth: 0.5,
      color: rgb(0.97, 0.98, 0.99),
    });
    drawText({ page, font, text: '使い方', x: MARGIN_X + 18, y: 358, size: HEADING_SIZE });
    [
      '1. 上のコードを読み取る、またはURLを開きます。',
      '2. ログインコードが入力済みであることを確認します。',
      '3. ログインボタンを押して、配布管理画面を開きます。',
      '4. 担当店舗の配布状況を入力してください。',
    ].forEach((text, stepIndex) => {
      drawText({
        page,
        font,
        text,
        x: MARGIN_X + 18,
        y: 328 - stepIndex * 24,
        size: BODY_SIZE,
      });
    });
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
    let rows = normalizeTeamManualRows(body.rows);
    if (body.separate === true && rows.length === 0) {
      rows = await loadTeamManualRowsForYear(year);
    }
    if (rows.length === 0) {
      return NextResponse.json({ error: '出力できるチームがありません' }, { status: 400 });
    }

    if (body.separate === true) {
      const files: Array<{ name: string; bytes: Uint8Array }> = [];
      for (const row of rows) {
        files.push({
          name: `${sanitizeFileName(`${row.teamName}_${row.teamCode}`)}.pdf`,
          bytes: await buildPdf({ year, rows: [row] }),
        });
      }
      const zipBytes = buildZip(files);

      return new NextResponse(Buffer.from(zipBytes), {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`配布班マニュアル_${year}.zip`)}`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const pdfBytes = await buildPdf({ year, rows });

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(`配布班マニュアル_${year}.pdf`)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('配布班マニュアルPDF生成エラー:', error);
    return NextResponse.json({ error: 'PDFの生成に失敗しました' }, { status: 500 });
  }
}
