import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_STORE_IMPORT_ROWS,
  parseStoreImportTargetYear,
  resolveStoreImportAddress,
  resolveStoreImportAreaCode,
  validateStoreImportScope,
} from '../../lib/utils/stores/store-import-route';

const row = (year: number) => ({ year, rowNumber: 2 }) as never;

test('parseStoreImportTargetYear rejects invalid target years', () => {
  assert.equal(parseStoreImportTargetYear('2026'), 2026);
  assert.equal(parseStoreImportTargetYear('2026.5'), null);
  assert.equal(parseStoreImportTargetYear('26'), null);
});

test('validateStoreImportScope rejects too many rows', () => {
  const errors = validateStoreImportScope(
    Array.from({ length: MAX_STORE_IMPORT_ROWS + 1 }, () => row(2026)),
    null,
  );

  assert.deepEqual(errors, [`一度に取り込める店舗は${MAX_STORE_IMPORT_ROWS}件までです`]);
});

test('validateStoreImportScope rejects mixed years for a target year', () => {
  assert.deepEqual(validateStoreImportScope([row(2026), row(2027)], 2026), [
    '2026年度以外の行が含まれています',
  ]);
});

test('resolveStoreImportAreaCode returns empty when no area is assigned', () => {
  assert.equal(resolveStoreImportAreaCode('扇が丘', {}, new Map()), '');
});

test('resolveStoreImportAddress returns empty when the address is not confirmed', () => {
  assert.equal(resolveStoreImportAddress(undefined, '', undefined), '');
  assert.equal(resolveStoreImportAddress({ address: '  ' }, '', undefined), '');
});
