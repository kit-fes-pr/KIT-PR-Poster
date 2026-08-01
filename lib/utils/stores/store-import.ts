export type StoreImportStatus = 'pending' | 'failed';

export type ParsedStoreImportRow = {
  rowIndex: number;
  rowNumber: number;
  storeName: string;
  year: number;
  status: StoreImportStatus;
  notes: string;
  csvArea: string;
};

function normalizeCsvValue(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .normalize('NFKC')
    .trim();
}

function parseCsvRecords(csv: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    const nextCharacter = csv[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === ',' && !inQuotes) {
      record.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && nextCharacter === '\n') index += 1;
      record.push(field);
      if (record.some((value) => value.trim() !== '')) records.push(record);
      record = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (field || record.length > 0) {
    record.push(field);
    if (record.some((value) => value.trim() !== '')) records.push(record);
  }

  return records;
}

export function parseStoreImportCsv(
  csv: string,
): { rows: ParsedStoreImportRow[]; errors: string[] } | { rows: []; errors: string[] } {
  const records = parseCsvRecords(csv);
  if (records.length === 0) return { rows: [], errors: ['CSVにデータがありません'] };

  const headers = records[0].map(normalizeCsvValue);
  const expectedHeaders = ['店舗名', '配布年度', '配布可否', '備考', '配布地域'];
  if (
    headers.length !== expectedHeaders.length ||
    headers.some((v, i) => v !== expectedHeaders[i])
  ) {
    return {
      rows: [],
      errors: [`ヘッダーは「${expectedHeaders.join(',')}」の順で指定してください`],
    };
  }

  const rows: ParsedStoreImportRow[] = [];
  const errors: string[] = [];
  records.slice(1).forEach((record, index) => {
    const rowNumber = index + 2;
    const values = [...record, '', '', '', '', ''].slice(0, 5).map(normalizeCsvValue);
    const [storeName, yearValue, availability, notes, csvArea] = values;
    const year = Number(yearValue);
    const rowErrors: string[] = [];

    if (!storeName) rowErrors.push('店舗名が空です');
    if (!/^\d{4}$/.test(yearValue) || !Number.isInteger(year)) {
      rowErrors.push('配布年度は4桁の西暦で指定してください');
    }
    if (availability !== '可' && availability !== '否') {
      rowErrors.push('配布可否は「可」または「否」で指定してください');
    }
    if (!csvArea) rowErrors.push('配布地域が空です');

    if (rowErrors.length > 0) {
      errors.push(`${rowNumber}行目: ${rowErrors.join('、')}`);
      return;
    }

    rows.push({
      rowIndex: index,
      rowNumber,
      storeName,
      year,
      status: availability === '可' ? 'pending' : 'failed',
      notes,
      csvArea,
    });
  });

  return { rows, errors };
}
