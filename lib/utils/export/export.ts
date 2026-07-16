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
