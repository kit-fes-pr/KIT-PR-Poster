export type StoreImportStatus = 'completed' | 'failed';
export const MAX_DISTRIBUTED_COUNT = 99;

export type ParsedStoreImportRow = {
  rowIndex: number;
  rowNumber: number;
  storeName: string;
  year: number;
  status: StoreImportStatus;
  distributedCount: number;
  notes: string;
  csvArea: string;
  address: string;
  latitude?: number;
  longitude?: number;
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
  const legacyHeaders = ['店舗名', '配布年度', '配布可否', '備考', '配布地域'];
  const headersWithAddress = ['店舗名', '住所', '配布年度', '配布可否', '備考', '配布地域'];
  const headersWithCount = [
    '店舗名',
    '住所',
    '配布年度',
    '配布可否',
    '配布枚数',
    '備考',
    '配布地域',
  ];
  const headersWithCoordinates = [
    '店舗名',
    '住所',
    '緯度',
    '経度',
    '配布年度',
    '配布可否',
    '配布枚数',
    '備考',
    '配布地域',
  ];
  const isLegacyFormat =
    headers.length === legacyHeaders.length &&
    headers.every((value, index) => value === legacyHeaders[index]);
  const isAddressFormat =
    headers.length === headersWithAddress.length &&
    headers.every((value, index) => value === headersWithAddress[index]);
  const isCountFormat =
    headers.length === headersWithCount.length &&
    headers.every((value, index) => value === headersWithCount[index]);
  const isCoordinateFormat =
    headers.length === headersWithCoordinates.length &&
    headers.every((value, index) => value === headersWithCoordinates[index]);
  if (!isLegacyFormat && !isAddressFormat && !isCountFormat && !isCoordinateFormat) {
    return {
      rows: [],
      errors: [`ヘッダーは「${headersWithCount.join(',')}」の順で指定してください`],
    };
  }

  const rows: ParsedStoreImportRow[] = [];
  const errors: string[] = [];
  records.slice(1).forEach((record, index) => {
    const rowNumber = index + 2;
    const values = [...record, '', '', '', '', '', '']
      .slice(0, headers.length)
      .map(normalizeCsvValue);
    const [
      storeName,
      address = '',
      latitudeValue = '',
      longitudeValue = '',
      yearValue,
      availability,
      distributedCountValue,
      notes,
      csvArea,
    ] = isCoordinateFormat
      ? values
      : isCountFormat
        ? [values[0], values[1], '', '', values[2], values[3], values[4], values[5], values[6]]
        : isAddressFormat
          ? [values[0], values[1], '', '', values[2], values[3], '', values[4], values[5]]
          : [values[0], '', '', '', values[1], values[2], '', values[3], values[4]];
    const year = Number(yearValue);
    const latitude = latitudeValue ? Number(latitudeValue) : undefined;
    const longitude = longitudeValue ? Number(longitudeValue) : undefined;
    const defaultDistributedCount = availability === '可' ? 1 : 0;
    const distributedCount = distributedCountValue
      ? Number(distributedCountValue)
      : defaultDistributedCount;
    const rowErrors: string[] = [];

    if (!storeName) rowErrors.push('店舗名が空です');
    if (!/^\d{4}$/.test(yearValue) || !Number.isInteger(year)) {
      rowErrors.push('配布年度は4桁の西暦で指定してください');
    }
    if (availability !== '可' && availability !== '否') {
      rowErrors.push('配布可否は「可」または「否」で指定してください');
    }
    if (latitudeValue && (!Number.isFinite(latitude) || latitude! < -90 || latitude! > 90)) {
      rowErrors.push('緯度は-90から90の数値で指定してください');
    }
    if (longitudeValue && (!Number.isFinite(longitude) || longitude! < -180 || longitude! > 180)) {
      rowErrors.push('経度は-180から180の数値で指定してください');
    }
    if (
      !Number.isInteger(distributedCount) ||
      distributedCount < 0 ||
      distributedCount > MAX_DISTRIBUTED_COUNT
    ) {
      rowErrors.push(`配布枚数は0以上${MAX_DISTRIBUTED_COUNT}以下の整数で指定してください`);
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
      status: availability === '可' ? 'completed' : 'failed',
      distributedCount,
      notes,
      csvArea,
      address,
      latitude,
      longitude,
    });
  });

  return { rows, errors };
}
