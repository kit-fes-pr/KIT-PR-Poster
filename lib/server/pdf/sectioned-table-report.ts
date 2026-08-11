import { readFile } from 'fs/promises';
import path from 'path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFPage, PDFFont, rgb } from 'pdf-lib';

type FontEntry = {
  bytes: Uint8Array;
};

export type PdfTableColumn<Row> = {
  title: string;
  width: number;
  getText: (row: Row) => string;
  maxLines?: number;
};

export type PdfTableSection<Row> = {
  label: string;
  count: number;
  rows: Row[];
};

export type SectionedTableReportOptions<Row> = {
  title: string;
  metaText: string;
  legendText?: string;
  header: string;
  sections: PdfTableSection<Row>[];
  emptySectionLabel: string;
  columns: PdfTableColumn<Row>[];
  headerFontSize?: number;
  titleFontSize?: number;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 34;
const HEADER_Y = PAGE_HEIGHT - 28;
const FOOTER_Y = 24;
const CONTENT_TOP = PAGE_HEIGHT - 55;
const CONTENT_BOTTOM = 48;
const FONT_SIZE = 9;
const DEFAULT_HEADER_FONT_SIZE = 10;
const DEFAULT_TITLE_FONT_SIZE = 18;
const LINE_HEIGHT = 12;
const TABLE_HEADER_HEIGHT = 20;
const TABLE_ROW_MIN_HEIGHT = 20;
const SECTION_TITLE_HEIGHT = 18;
const FIRST_PAGE_BASE_INTRO_HEIGHT = 86;
const TITLE_GAP = 20;
const DIVIDER_OFFSET = 8;
const INTRO_BOTTOM_GAP = 28;
const LEGEND_HEIGHT = 14;
const CELL_HORIZONTAL_PADDING = 4;
const CELL_VERTICAL_PADDING = 8;

let fontEntryCache: Promise<FontEntry> | null = null;

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

function drawRect(input: {
  page: PDFPage;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: boolean;
}) {
  input.page.drawRectangle({
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    borderWidth: 0.5,
    borderColor: rgb(0.82, 0.84, 0.88),
    color: input.fill ? rgb(0.95, 0.96, 0.98) : undefined,
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
  fontSize: number;
  lineHeight: number;
  cellHorizontalPadding: number;
  maxLines: number;
  fill?: boolean;
}) {
  drawRect({
    page: input.page,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    fill: Boolean(input.fill),
  });
  const lines = splitTextToLines({
    font: input.font,
    text: input.text,
    maxWidth: input.width - input.cellHorizontalPadding * 2,
    size: input.fontSize,
    maxLines: input.maxLines,
  });
  const totalTextHeight = lines.length * input.lineHeight;
  let textY =
    input.y + (input.height - totalTextHeight) / 2 + (input.lineHeight - input.fontSize) / 2;
  textY += (lines.length - 1) * input.lineHeight;

  for (const line of lines) {
    drawText({
      page: input.page,
      font: input.font,
      text: line,
      x: input.x + input.cellHorizontalPadding,
      y: textY,
      size: input.fontSize,
    });
    textY -= input.lineHeight;
  }
}

function drawHeaderFooter(input: {
  page: PDFPage;
  font: PDFFont;
  header: string;
  pageNumber: number;
  pageCount: number;
  headerFontSize: number;
}) {
  drawText({
    page: input.page,
    font: input.font,
    text: input.header,
    x: MARGIN_X,
    y: HEADER_Y,
    size: input.headerFontSize,
    color: rgb(0.22, 0.26, 0.32),
  });
  drawText({
    page: input.page,
    font: input.font,
    text: 'PR系',
    x: MARGIN_X,
    y: FOOTER_Y,
    size: input.headerFontSize,
    color: rgb(0.22, 0.26, 0.32),
  });
  const pageNumberText = `[${input.pageNumber}/${input.pageCount}]`;
  drawText({
    page: input.page,
    font: input.font,
    text: pageNumberText,
    x: PAGE_WIDTH - MARGIN_X - input.font.widthOfTextAtSize(pageNumberText, input.headerFontSize),
    y: FOOTER_Y,
    size: input.headerFontSize,
    color: rgb(0.22, 0.26, 0.32),
  });
}

function calculateRowHeight<Row>(input: {
  font: PDFFont;
  columns: PdfTableColumn<Row>[];
  row: Row;
}): number {
  const maxLineCount = Math.max(
    1,
    ...input.columns.map((column) => {
      const lines = splitTextToLines({
        font: input.font,
        text: column.getText(input.row),
        maxWidth: column.width - CELL_HORIZONTAL_PADDING * 2,
        size: FONT_SIZE,
        maxLines: column.maxLines || 2,
      });
      return lines.length;
    }),
  );

  return Math.max(TABLE_ROW_MIN_HEIGHT, maxLineCount * LINE_HEIGHT + CELL_VERTICAL_PADDING);
}

export async function buildSectionedTableReportPdf<Row>(
  options: SectionedTableReportOptions<Row>,
): Promise<Uint8Array> {
  const headerFontSize = options.headerFontSize || DEFAULT_HEADER_FONT_SIZE;
  const titleFontSize = options.titleFontSize || DEFAULT_TITLE_FONT_SIZE;
  const usableHeight = CONTENT_TOP - CONTENT_BOTTOM;
  const firstPageIntroHeight =
    FIRST_PAGE_BASE_INTRO_HEIGHT + (options.legendText ? LEGEND_HEIGHT : 0);
  const firstPageBottomGap = INTRO_BOTTOM_GAP + (options.legendText ? LEGEND_HEIGHT : 0);
  const sectionHeight = SECTION_TITLE_HEIGHT + TABLE_HEADER_HEIGHT;
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const fontEntry = await loadFontEntry();
  const font = await pdfDoc.embedFont(fontEntry.bytes, { subset: false });
  const pageChunks: Array<
    Array<
      { type: 'section'; label: string; count: number } | { type: 'row'; row: Row; height: number }
    >
  > = [];
  let current: Array<
    { type: 'section'; label: string; count: number } | { type: 'row'; row: Row; height: number }
  > = [];
  let usedHeight = firstPageIntroHeight;

  const pushPage = () => {
    pageChunks.push(current);
    current = [];
    usedHeight = 0;
  };

  for (const section of options.sections) {
    const firstRowHeight = section.rows[0]
      ? calculateRowHeight({
          font,
          columns: options.columns,
          row: section.rows[0],
        })
      : 0;
    if (current.length > 0 && usedHeight + sectionHeight + firstRowHeight > usableHeight) {
      pushPage();
    }

    current.push({ type: 'section', label: section.label, count: section.count });
    usedHeight += sectionHeight;

    for (const row of section.rows) {
      const rowHeight = calculateRowHeight({
        font,
        columns: options.columns,
        row,
      });

      if (usedHeight + rowHeight > usableHeight) {
        pushPage();
        current.push({
          type: 'section',
          label: `${section.label}（続き）`,
          count: section.count,
        });
        usedHeight += sectionHeight;
      }

      current.push({ type: 'row', row, height: rowHeight });
      usedHeight += rowHeight;
    }
  }

  if (current.length === 0) {
    current.push({ type: 'section', label: options.emptySectionLabel, count: 0 });
  }
  pageChunks.push(current);

  for (const [pageIndex, items] of pageChunks.entries()) {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawHeaderFooter({
      page,
      font,
      header: options.header,
      pageNumber: pageIndex + 1,
      pageCount: pageChunks.length,
      headerFontSize,
    });

    let y = CONTENT_TOP;
    if (pageIndex === 0) {
      drawText({
        page,
        font,
        text: options.title,
        x: MARGIN_X,
        y,
        size: titleFontSize,
      });
      y -= TITLE_GAP;
      drawText({
        page,
        font,
        text: options.metaText,
        x: MARGIN_X,
        y,
        size: headerFontSize,
        color: rgb(0.29, 0.33, 0.39),
      });
      const dividerY = y - DIVIDER_OFFSET;
      page.drawLine({
        start: { x: MARGIN_X, y: dividerY },
        end: { x: PAGE_WIDTH - MARGIN_X, y: dividerY },
        thickness: 0.5,
        color: rgb(0.82, 0.84, 0.88),
      });
      if (options.legendText) {
        drawText({
          page,
          font,
          text: options.legendText,
          x: MARGIN_X,
          y: dividerY - 14,
          size: headerFontSize,
          color: rgb(0.29, 0.33, 0.39),
        });
      }
      y -= firstPageBottomGap;
    }

    for (const item of items) {
      if (item.type === 'section') {
        drawText({
          page,
          font,
          text: `${item.label} ${item.count}名`,
          x: MARGIN_X,
          y: y - Math.max(13, SECTION_TITLE_HEIGHT - 6),
          size: 12,
        });
        y -= SECTION_TITLE_HEIGHT;

        let x = MARGIN_X;
        for (const column of options.columns) {
          drawWrappedCell({
            page,
            font,
            text: column.title,
            x,
            y: y - TABLE_HEADER_HEIGHT,
            width: column.width,
            height: TABLE_HEADER_HEIGHT,
            fontSize: FONT_SIZE,
            lineHeight: LINE_HEIGHT,
            cellHorizontalPadding: CELL_HORIZONTAL_PADDING,
            maxLines: 1,
            fill: true,
          });
          x += column.width;
        }
        y -= TABLE_HEADER_HEIGHT;
        continue;
      }

      let x = MARGIN_X;
      for (const column of options.columns) {
        drawWrappedCell({
          page,
          font,
          text: column.getText(item.row),
          x,
          y: y - item.height,
          width: column.width,
          height: item.height,
          fontSize: FONT_SIZE,
          lineHeight: LINE_HEIGHT,
          cellHorizontalPadding: CELL_HORIZONTAL_PADDING,
          maxLines: column.maxLines || 2,
        });
        x += column.width;
      }
      y -= item.height;
    }
  }

  return pdfDoc.save();
}
