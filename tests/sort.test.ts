import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { compareJapaneseText, sortByGradeThenKanaThenName } from '../lib/utils/sort';

describe('sort utils', () => {
  test('compareJapaneseText compares values with Japanese collation', () => {
    assert.equal(compareJapaneseText('あ', 'い') < 0, true);
    assert.equal(compareJapaneseText(null, '') === 0, true);
  });

  test('sortByGradeThenKanaThenName sorts by grade, kana, name, and response id', () => {
    const rows = sortByGradeThenKanaThenName([
      { responseId: 'r5', grade: 1, nameKana: 'いとう', name: '伊東' },
      { responseId: 'r3', grade: 2, nameKana: 'さとう', name: '佐藤' },
      { responseId: 'r2', grade: 1, nameKana: 'いとう', name: '伊藤' },
      { responseId: 'r4', grade: 1, nameKana: 'いとう', name: '伊藤' },
      { responseId: 'r1', grade: 1, nameKana: 'あべ', name: '阿部' },
    ]);

    assert.deepEqual(
      rows.map((row) => row.responseId),
      ['r1', 'r5', 'r2', 'r4', 'r3'],
    );
  });
});
