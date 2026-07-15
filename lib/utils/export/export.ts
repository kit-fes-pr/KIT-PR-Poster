export function sanitizeFileName(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_');
  return sanitized || 'export';
}

export function escapeCsvValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

export function buildCsvContent(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvValue).join(',')).join('\r\n');
}

export function downloadCsvFile(fileName: string, csvContent: string): void {
  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function openPrintableHtml(html: string): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('PDF出力用のウィンドウを開けませんでした。ポップアップ設定を確認してください。');
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();
}

export async function openPdfViewerFromHtml(html: string): Promise<void> {
  const viewerWindow = window.open('', '_blank');
  if (!viewerWindow) {
    alert('PDFビューアを開けませんでした。ポップアップ設定を確認してください。');
    return;
  }

  viewerWindow.document.write(
    '<!doctype html><html><head><meta charset="utf-8"><title>PDF生成中</title></head><body style="font-family: sans-serif; padding: 24px;">PDFを生成しています...</body></html>',
  );
  viewerWindow.document.close();

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.left = '-10000px';
  frame.style.top = '0';
  frame.style.width = '794px';
  frame.style.height = '1123px';
  frame.style.border = '0';
  document.body.appendChild(frame);

  try {
    const frameDocument = frame.contentDocument;
    if (!frameDocument) {
      throw new Error('PDF出力用のドキュメントを作成できませんでした');
    }

    frameDocument.open();
    frameDocument.write(html);
    frameDocument.close();

    await new Promise<void>((resolve) => {
      frame.onload = () => resolve();
      window.setTimeout(resolve, 300);
    });
    await frame.contentDocument?.fonts?.ready;

    const pageElements = Array.from(
      frame.contentDocument?.querySelectorAll<HTMLElement>('[data-pdf-page]') || [],
    );
    if (pageElements.length === 0) {
      throw new Error('PDF出力用の内容を読み込めませんでした');
    }

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    for (const [index, pageElement] of pageElements.entries()) {
      const canvas = await html2canvas(pageElement, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        windowWidth: 794,
        windowHeight: 1123,
      });
      const imageData = canvas.toDataURL('image/jpeg', 0.95);

      if (index > 0) {
        pdf.addPage();
      }
      pdf.addImage(imageData, 'JPEG', 0, 0, pageWidth, pageHeight);
    }

    const pdfUrl = URL.createObjectURL(pdf.output('blob'));
    viewerWindow.location.href = pdfUrl;
    window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000);
  } catch (error) {
    viewerWindow.document.body.textContent =
      error instanceof Error ? error.message : 'PDFの生成に失敗しました';
  } finally {
    document.body.removeChild(frame);
  }
}
