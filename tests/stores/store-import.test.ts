import assert from 'node:assert/strict';
import test from 'node:test';
import { parseStoreImportCsv } from '../../lib/utils/stores/store-import';

test('parseStoreImportCsv parses the legacy store header and availability values', () => {
  const result = parseStoreImportCsv(
    '店舗名,配布年度,配布可否,備考,配布地域\n"金沢店",2026,可,"駅前,担当者確認",A-01\n白山店,2026,否,,白山市',
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].status, 'completed');
  assert.equal(result.rows[0].distributedCount, 1);
  assert.equal(result.rows[0].notes, '駅前,担当者確認');
  assert.equal(result.rows[0].address, '');
  assert.equal(result.rows[1].status, 'failed');
  assert.equal(result.rows[1].distributedCount, 0);
});

test('parseStoreImportCsv accepts an optional address column', () => {
  const result = parseStoreImportCsv(
    '店舗名,住所,配布年度,配布可否,備考,配布地域\n店舗,金沢市〇〇1-2-3,2026,可,,A-01',
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0].address, '金沢市〇〇1-2-3');
  assert.equal(result.rows[0].distributedCount, 1);
});

test('parseStoreImportCsv parses the distribution count column', () => {
  const result = parseStoreImportCsv(
    '店舗名,住所,配布年度,配布可否,配布枚数,備考,配布地域\n店舗,金沢市〇〇1-2-3,2026,可,3,駅前,A-01\n別店舗,,2026,否,0,,A-01',
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0].distributedCount, 3);
  assert.equal(result.rows[0].notes, '駅前');
  assert.equal(result.rows[1].distributedCount, 0);
});

test('parseStoreImportCsv rejects an invalid header and availability value', () => {
  const result = parseStoreImportCsv('店舗名,年度,配布可否,備考,配布地域\n店舗,2026,○,,A-01');

  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0], /ヘッダー/);

  const invalidAvailability = parseStoreImportCsv(
    '店舗名,配布年度,配布可否,備考,配布地域\n店舗,2026,○,,A-01',
  );
  assert.match(invalidAvailability.errors[0], /可/);
});

test('parseStoreImportCsv rejects distribution counts above 99', () => {
  const result = parseStoreImportCsv(
    '店舗名,住所,配布年度,配布可否,配布枚数,備考,配布地域\n店舗,,2026,可,100,,A-01',
  );

  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0], /0以上99以下/);
});
