import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ALL_AVAILABLE_SLOT_KEY,
  UNAVAILABLE_SLOT_KEY,
  buildAvailabilitySlotChoices,
  buildAvailabilitySlotKeysForDateRange,
  formatAvailabilitySlotLabel,
  formatDistributionSlotDate,
  formatDistributionSlotTime,
  isAvailableForAnySlot,
  normalizeAvailabilitySlotValue,
  summarizeAvailabilitySlots,
  sortAvailabilitySlotKeys,
  validateAvailabilitySelection,
  toggleAvailabilitySelection,
} from '../../lib/utils/availability/availability';

describe('availability utils', () => {
  test('buildAvailabilitySlotChoices generates am/pm choices for each date', () => {
    const choices = buildAvailabilitySlotChoices('2026-06-01', '2026-06-03');
    assert.equal(choices.length, 6);
    assert.deepEqual(
      choices.map((choice: { key: string }) => choice.key),
      [
        '2026-06-01_am',
        '2026-06-01_pm',
        '2026-06-02_am',
        '2026-06-02_pm',
        '2026-06-03_am',
        '2026-06-03_pm',
      ],
    );
  });

  test('buildAvailabilitySlotKeysForDateRange respects timeSlot filters', () => {
    assert.deepEqual(buildAvailabilitySlotKeysForDateRange('2026-06-01', '2026-06-02'), [
      '2026-06-01_am',
      '2026-06-01_pm',
      '2026-06-02_am',
      '2026-06-02_pm',
    ]);
    assert.deepEqual(buildAvailabilitySlotKeysForDateRange('2026-06-01', '2026-06-02', 'morning'), [
      '2026-06-01_am',
      '2026-06-02_am',
    ]);
    assert.deepEqual(
      buildAvailabilitySlotKeysForDateRange('2026-06-01', '2026-06-02', 'afternoon'),
      ['2026-06-01_pm', '2026-06-02_pm'],
    );
  });

  test('compareAvailabilitySlotKeys sorts special slots first and date slots by day then am/pm', () => {
    const sorted = sortAvailabilitySlotKeys([
      '2026-06-02_pm',
      UNAVAILABLE_SLOT_KEY,
      ALL_AVAILABLE_SLOT_KEY,
      '2026-06-01_am',
    ]);

    assert.deepEqual(sorted, [
      ALL_AVAILABLE_SLOT_KEY,
      UNAVAILABLE_SLOT_KEY,
      '2026-06-01_am',
      '2026-06-02_pm',
    ]);
  });

  test('formatAvailabilitySlotLabel formats special and date slots', () => {
    assert.equal(formatAvailabilitySlotLabel(ALL_AVAILABLE_SLOT_KEY), '全て可能');
    assert.equal(formatAvailabilitySlotLabel(UNAVAILABLE_SLOT_KEY), '参加不可');
    assert.match(formatAvailabilitySlotLabel('2026-06-01_am'), /午前$/);
  });

  test('formatDistributionSlotDate and formatDistributionSlotTime format team distribution slots', () => {
    assert.equal(formatDistributionSlotDate('2026-06-01_am'), '2026年6月1日');
    assert.equal(formatDistributionSlotTime('2026-06-01_am'), '午前');
    assert.equal(formatDistributionSlotTime('2026-06-01_pm'), '午後');
    assert.equal(formatDistributionSlotDate('invalid'), '-');
    assert.equal(formatDistributionSlotTime('invalid'), '-');
  });

  test('normalizeAvailabilitySlotValue accepts special and date keys only', () => {
    assert.equal(normalizeAvailabilitySlotValue(' 2026-06-01_am '), '2026-06-01_am');
    assert.equal(normalizeAvailabilitySlotValue(ALL_AVAILABLE_SLOT_KEY), ALL_AVAILABLE_SLOT_KEY);
    assert.equal(normalizeAvailabilitySlotValue(UNAVAILABLE_SLOT_KEY), UNAVAILABLE_SLOT_KEY);
    assert.equal(normalizeAvailabilitySlotValue('foo'), 'foo');
    assert.equal(normalizeAvailabilitySlotValue(''), null);
  });

  test('validateAvailabilitySelection rejects conflicting special choices', () => {
    assert.equal(
      validateAvailabilitySelection([ALL_AVAILABLE_SLOT_KEY, UNAVAILABLE_SLOT_KEY]),
      '参加不可と全て可能は同時に選択できません',
    );
    assert.equal(validateAvailabilitySelection(['2026-06-01_am']), null);
  });

  test('summarizeAvailabilitySlots and isAvailableForAnySlot classify availability correctly', () => {
    assert.equal(summarizeAvailabilitySlots([]), 'other');
    assert.equal(summarizeAvailabilitySlots([UNAVAILABLE_SLOT_KEY]), 'other');
    assert.equal(summarizeAvailabilitySlots([ALL_AVAILABLE_SLOT_KEY]), 'both');
    assert.equal(summarizeAvailabilitySlots(['2026-06-01_am']), 'morning');
    assert.equal(summarizeAvailabilitySlots(['2026-06-01_pm']), 'afternoon');
    assert.equal(summarizeAvailabilitySlots(['2026-06-01_am', '2026-06-01_pm']), 'both');
    assert.equal(isAvailableForAnySlot([UNAVAILABLE_SLOT_KEY]), false);
    assert.equal(isAvailableForAnySlot(['2026-06-01_am']), true);
  });

  test('toggleAvailabilitySelection keeps unavailable exclusive and all-available expansive', () => {
    const allDateSlotKeys = ['2026-06-01_am', '2026-06-01_pm'];
    assert.deepEqual(toggleAvailabilitySelection([], UNAVAILABLE_SLOT_KEY, allDateSlotKeys), [
      UNAVAILABLE_SLOT_KEY,
    ]);
    assert.deepEqual(toggleAvailabilitySelection([], ALL_AVAILABLE_SLOT_KEY, allDateSlotKeys), [
      ...allDateSlotKeys,
      ALL_AVAILABLE_SLOT_KEY,
    ]);
    assert.deepEqual(
      toggleAvailabilitySelection(
        [...allDateSlotKeys, ALL_AVAILABLE_SLOT_KEY],
        '2026-06-01_am',
        allDateSlotKeys,
      ),
      ['2026-06-01_pm'],
    );
  });
});
