import assert from 'node:assert/strict';
import test from 'node:test';
import { parseStoreImportCsv } from '../../lib/utils/stores/store-import';

test('parseStoreImportCsv parses the legacy store header and availability values', () => {
  const result = parseStoreImportCsv(
    '店舗名,配布年度,配布可否,備考,配布地域\n"金沢店",2026,可,"駅前,担当者確認",A-01\n白山店,2026,否,,白山市',
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].status, 'pending');
  assert.equal(result.rows[0].notes, '駅前,担当者確認');
  assert.equal(result.rows[1].status, 'failed');
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
