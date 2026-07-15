import { formatDate } from '@/lib/utils/dateUtils';
import { escapeHtml } from '@/lib/utils/export/export';
import {
  formatResponseExportAvailability,
  groupResponseExportRowsByGrade,
  ResponseExportRow,
} from '@/lib/utils/forms/forms';

type ResponseExportPdfDocumentInput = {
  year: string;
  formTitle: string;
  rows: ResponseExportRow[];
  generatedAt?: Date;
};

const FIRST_PAGE_ROW_LIMIT = 13;
const CONTINUED_PAGE_ROW_LIMIT = 18;

type PdfSection = {
  label: string;
  rows: ResponseExportRow[];
  totalCount: number;
  continued: boolean;
};

type PdfPage = {
  sections: PdfSection[];
};

function paginateRows(rows: ResponseExportRow[]): PdfPage[] {
  const groups = groupResponseExportRowsByGrade(rows);
  const pages: PdfPage[] = [];
  let currentPage: PdfPage = { sections: [] };
  let currentCount = 0;
  let currentLimit = FIRST_PAGE_ROW_LIMIT;

  const pushPage = () => {
    pages.push(currentPage);
    currentPage = { sections: [] };
    currentCount = 0;
    currentLimit = CONTINUED_PAGE_ROW_LIMIT;
  };

  for (const group of groups) {
    let cursor = 0;
    while (cursor < group.rows.length) {
      if (currentCount >= currentLimit) {
        pushPage();
      }

      const remaining = currentLimit - currentCount;
      const rowsForPage = group.rows.slice(cursor, cursor + remaining);
      currentPage.sections.push({
        label: group.label,
        rows: rowsForPage,
        totalCount: group.rows.length,
        continued: cursor > 0,
      });
      currentCount += rowsForPage.length;
      cursor += rowsForPage.length;
    }
  }

  if (currentPage.sections.length > 0 || pages.length === 0) {
    pages.push(currentPage);
  }

  return pages;
}

export function buildResponseExportPdfHtml({
  year,
  formTitle,
  rows,
  generatedAt = new Date(),
}: ResponseExportPdfDocumentInput): string {
  const totalCount = rows.length;
  const documentHeader = `工大祭実行委員会-学外配布${year}`;
  const pages = paginateRows(rows);
  const pageCount = pages.length;
  const pageHtml = pages
    .map(
      (page, pageIndex) => `
        <section class="pdf-page" data-pdf-page>
          <div class="page-header">${escapeHtml(documentHeader)}</div>
          <main>
            ${
              pageIndex === 0
                ? `
                  <header class="document-title">
                    <h1>回答者一覧</h1>
                    <div class="meta">
                      <span>フォーム: ${escapeHtml(formTitle)}</span>
                      <span>回答数: ${totalCount}名</span>
                      <span>出力日時: ${escapeHtml(formatDate(generatedAt))}</span>
                    </div>
                  </header>
                `
                : ''
            }
            ${
              totalCount > 0
                ? page.sections
                    .map(
                      (section) => `
                        <section class="grade-section">
                          <h2>${escapeHtml(section.label)}${section.continued ? '（続き）' : ''} <span>${section.totalCount}名</span></h2>
                          <table>
                            <thead>
                              <tr>
                                <th>名前</th>
                                <th>セクション</th>
                                <th>参加可能日時</th>
                                <th>回答日時</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${section.rows
                                .map(
                                  (row) => `
                                    <tr>
                                      <td>${escapeHtml(row.name || '名前未入力')}</td>
                                      <td>${escapeHtml(row.section)}</td>
                                      <td>${escapeHtml(formatResponseExportAvailability(row))}</td>
                                      <td>${escapeHtml(formatDate(row.submittedAt))}</td>
                                    </tr>
                                  `,
                                )
                                .join('')}
                            </tbody>
                          </table>
                        </section>
                      `,
                    )
                    .join('')
                : '<div class="empty">回答がありません</div>'
            }
          </main>
          <footer class="page-footer">
            <span>PR系</span>
            <span>[${pageIndex + 1}/${pageCount}]</span>
          </footer>
        </section>
      `,
    )
    .join('');

  return `
    <!doctype html>
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(formTitle)} 回答者一覧</title>
        <style>
          @page {
            size: A4;
            margin: 18mm 12mm;
            @top-center {
              content: "${escapeHtml(documentHeader)}";
              font-family: "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif;
              font-size: 10px;
              color: #374151;
            }
            @bottom-left {
              content: "PR系";
              font-family: "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif;
              font-size: 10px;
              color: #374151;
            }
            @bottom-right {
              content: "[" counter(page) "/" counter(pages) "]";
              font-family: "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif;
              font-size: 10px;
              color: #374151;
            }
          }
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            background: #ffffff;
            color: #111827;
            font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif;
            font-size: 11px;
            line-height: 1.45;
          }
          .pdf-page {
            background: #ffffff;
            height: 1123px;
            overflow: hidden;
            padding: 68px 45px;
            position: relative;
            width: 794px;
          }
          .page-header {
            color: #374151;
            font-size: 10px;
            font-weight: 700;
            left: 45px;
            position: absolute;
            right: 45px;
            text-align: left;
            top: 24px;
          }
          .page-footer {
            align-items: center;
            bottom: 24px;
            color: #374151;
            display: flex;
            font-size: 10px;
            justify-content: space-between;
            left: 45px;
            position: absolute;
            right: 45px;
          }
          main {
            display: block;
          }
          .document-title {
            border-bottom: 1px solid #d1d5db;
            margin-bottom: 14px;
            padding-bottom: 10px;
          }
          h1 {
            font-size: 20px;
            line-height: 1.25;
            margin: 0 0 6px;
          }
          .meta {
            color: #4b5563;
            display: flex;
            flex-wrap: wrap;
            gap: 8px 16px;
          }
          .grade-section {
            margin-bottom: 14px;
          }
          h2 {
            align-items: baseline;
            border-left: 4px solid #4f46e5;
            display: flex;
            gap: 8px;
            font-size: 14px;
            margin: 0 0 6px;
            padding-left: 8px;
          }
          h2 span {
            color: #6b7280;
            font-size: 10px;
            font-weight: 500;
          }
          table {
            border-collapse: collapse;
            table-layout: fixed;
            width: 100%;
          }
          th,
          td {
            border: 1px solid #d1d5db;
            padding: 5px 6px;
            text-align: left;
            vertical-align: top;
            word-break: break-word;
          }
          th {
            background: #f3f4f6;
            font-weight: 700;
          }
          .empty {
            border: 1px solid #d1d5db;
            color: #6b7280;
            padding: 18px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        ${pageHtml}
      </body>
    </html>
  `;
}
