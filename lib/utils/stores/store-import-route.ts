import { normalizeDistributionYear } from '../events/events';
import type { ParsedStoreImportRow } from './store-import';

export const MAX_STORE_IMPORT_ROWS = 1000;

export function parseStoreImportTargetYear(value: unknown) {
  return value === undefined || value === null || value === ''
    ? null
    : normalizeDistributionYear(value);
}

export function validateStoreImportScope(rows: ParsedStoreImportRow[], targetYear: number | null) {
  const errors: string[] = [];
  if (rows.length > MAX_STORE_IMPORT_ROWS) {
    errors.push(`一度に取り込める店舗は${MAX_STORE_IMPORT_ROWS}件までです`);
  }
  if (targetYear !== null && rows.some((row) => row.year !== targetYear)) {
    errors.push(`${targetYear}年度以外の行が含まれています`);
  }
  return errors;
}

export function resolveStoreImportAreaCode(
  csvArea: string,
  areaAssignments: Record<string, unknown>,
  fallbackAreaCodes: Map<string, string>,
) {
  return String(
    areaAssignments[csvArea.trim()] || fallbackAreaCodes.get(csvArea.trim()) || '',
  ).trim();
}

export function resolveStoreImportAddress(
  addressSelection: { address?: unknown } | undefined,
  rowAddress: string,
  fallbackAddress: string | undefined,
) {
  const selectedAddress =
    typeof addressSelection?.address === 'string' ? addressSelection.address.trim() : '';
  return selectedAddress || rowAddress || fallbackAddress || '';
}
