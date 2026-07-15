import { formatDate } from '@/lib/utils/dateUtils';
import { escapeHtml } from '@/lib/utils/export/export';
import { groupResponseExportRowsByGrade, ResponseExportRow } from '@/lib/utils/forms/forms';

type ResponseExportPdfDocumentInput = {
  year: string;
  formTitle: string;
  rows: ResponseExportRow[];
  generatedAt?: Date;
};

export function buildResponseExportPdfHtml({
  year,
  formTitle,
  rows,
  generatedAt = new Date(),
}: ResponseExportPdfDocumentInput): string {
  const groupedRows = groupResponseExportRowsByGrade(rows);
  const totalCount = rows.length;
  const documentHeader = `工大祭実行委員会-学外配布${year}`;
  const groupSections = groupedRows
    .map(
      (group) => `
        <section class="grade-section">
          <h2>${escapeHtml(group.label)} <span>${group.rows.length}名</span></h2>
          <table>
            <thead>
              <tr>
                <th>名前</th>
                <th>セクション</th>
                <th>回答日時</th>
              </tr>
            </thead>
            <tbody>
              ${group.rows
                .map(
                  (row) => `
                    <tr>
                      <td>${escapeHtml(row.name || '名前未入力')}</td>
                      <td>${escapeHtml(row.section)}</td>
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
            color: #111827;
            font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif;
            font-size: 11px;
            line-height: 1.45;
          }
          header {
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
          .document-header {
            color: #374151;
            font-size: 10px;
            font-weight: 700;
            margin-bottom: 6px;
          }
          .grade-section {
            break-inside: avoid;
            margin-bottom: 14px;
            page-break-inside: avoid;
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
          th:nth-child(1),
          td:nth-child(1) {
            width: 34%;
          }
          th:nth-child(2),
          td:nth-child(2) {
            width: 30%;
          }
          th:nth-child(3),
          td:nth-child(3) {
            width: 36%;
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
        <header>
          <div class="document-header">${escapeHtml(documentHeader)}</div>
          <h1>回答者一覧</h1>
          <div class="meta">
            <span>フォーム: ${escapeHtml(formTitle)}</span>
            <span>回答数: ${totalCount}名</span>
            <span>出力日時: ${escapeHtml(formatDate(generatedAt))}</span>
          </div>
        </header>
        ${totalCount > 0 ? groupSections : '<div class="empty">回答がありません</div>'}
        <script>
          window.addEventListener('load', () => {
            window.focus();
            window.print();
          });
        </script>
      </body>
    </html>
  `;
}
