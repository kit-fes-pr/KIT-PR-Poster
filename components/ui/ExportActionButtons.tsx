'use client';

type ExportActionButtonsProps = {
  onCsvExport?: () => void;
  onPdfExport?: () => void;
  csvLabel?: string;
  pdfLabel?: string;
  disabled?: boolean;
};

export function ExportActionButtons({
  onCsvExport,
  onPdfExport,
  csvLabel = 'CSV出力',
  pdfLabel = 'PDF出力',
  disabled = false,
}: ExportActionButtonsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {onCsvExport && (
        <button
          type="button"
          onClick={onCsvExport}
          disabled={disabled}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {csvLabel}
        </button>
      )}
      {onPdfExport && (
        <button
          type="button"
          onClick={onPdfExport}
          disabled={disabled}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pdfLabel}
        </button>
      )}
    </div>
  );
}
