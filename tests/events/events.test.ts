import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildDistributionAvailabilitySlotKeys,
  buildDistributionEventCreateDefaults,
  buildDistributionEventUpdateDefaults,
  normalizeDistributionDateRange,
  normalizeDistributionYear,
  serializeDateOnlyValue,
  serializeDateTimeValue,
  serializeEventDoc,
} from '../../lib/utils/events/events';

describe('events utils', () => {
  test('normalizeDistributionDateRange validates date order and format', () => {
    assert.deepEqual(normalizeDistributionDateRange('2026-06-01', '2026-06-03'), {
      startDateStr: '2026-06-01',
      endDateStr: '2026-06-03',
      error: null,
    });
    assert.equal(
      normalizeDistributionDateRange('2026-06-03', '2026-06-01').error,
      '配布開始日は配布終了日以前を指定してください',
    );
    assert.equal(
      normalizeDistributionDateRange('2026-6-1', '2026-06-03').error,
      '配布日の形式が不正です',
    );
  });

  test('normalizeDistributionYear accepts 4 digit years only', () => {
    assert.equal(normalizeDistributionYear(2026), 2026);
    assert.equal(normalizeDistributionYear('2027'), 2027);
    assert.equal(normalizeDistributionYear('2027.5'), null);
    assert.equal(normalizeDistributionYear(999), null);
  });

  test('buildDistributionAvailabilitySlotKeys prefers stored slots and falls back to generated ones', () => {
    assert.deepEqual(
      buildDistributionAvailabilitySlotKeys('2026-06-01', '2026-06-02', ['a', 'b']),
      ['a', 'b'],
    );
    assert.deepEqual(buildDistributionAvailabilitySlotKeys('2026-06-01', '2026-06-02', []), [
      '2026-06-01_am',
      '2026-06-01_pm',
      '2026-06-02_am',
      '2026-06-02_pm',
    ]);
  });

  test('buildDistributionEventCreateDefaults and update defaults keep payloads consistent', () => {
    const createDefaults = buildDistributionEventCreateDefaults({
      year: 2026,
      eventId: '',
      eventName: '工大祭2026',
      distributionStartDate: '2026-06-01',
      distributionEndDate: '2026-06-03',
      distributionTimeZone: '',
      distributionAvailabilitySlots: [],
    });
    assert.ok(!('error' in createDefaults));
    assert.equal(createDefaults.eventId, 'kodai2026');
    assert.equal(createDefaults.distributionTimeZone, 'Asia/Tokyo');
    assert.deepEqual(createDefaults.distributionAvailabilitySlots, [
      '2026-06-01_am',
      '2026-06-01_pm',
      '2026-06-02_am',
      '2026-06-02_pm',
      '2026-06-03_am',
      '2026-06-03_pm',
    ]);

    const updateDefaults = buildDistributionEventUpdateDefaults({
      eventName: '工大祭2027',
      distributionStartDate: '2027-06-01',
      distributionEndDate: '2027-06-03',
      distributionTimeZone: '',
      distributionAvailabilitySlots: ['2027-06-01_am'],
      isActive: false,
    });
    assert.equal(updateDefaults.error, null);
    assert.equal(updateDefaults.update.distributionTimeZone, 'Asia/Tokyo');
    assert.equal(updateDefaults.update.eventName, '工大祭2027');
    assert.equal(updateDefaults.update.isActive, false);
    assert.deepEqual(updateDefaults.update.distributionAvailabilitySlots, ['2027-06-01_am']);

    const updateDefaultsNoTz = buildDistributionEventUpdateDefaults({
      eventName: '工大祭2027',
      isActive: false,
    });
    assert.equal(updateDefaultsNoTz.error, null);
    assert.equal(updateDefaultsNoTz.update.distributionTimeZone, undefined);
  });

  test('buildDistributionEventUpdateDefaults requires both start and end dates if either is provided', () => {
    const errorOnlyStart = buildDistributionEventUpdateDefaults({
      distributionStartDate: '2026-06-01',
    });
    assert.equal(errorOnlyStart.error, '配布開始日と配布終了日は両方指定する必要があります');

    const errorOnlyEnd = buildDistributionEventUpdateDefaults({
      distributionEndDate: '2026-06-03',
    });
    assert.equal(errorOnlyEnd.error, '配布開始日と配布終了日は両方指定する必要があります');

    const successBoth = buildDistributionEventUpdateDefaults({
      distributionStartDate: '2026-06-01',
      distributionEndDate: '2026-06-03',
    });
    assert.equal(successBoth.error, null);
    assert.equal(successBoth.update.distributionStartDate, '2026-06-01');
    assert.equal(successBoth.update.distributionEndDate, '2026-06-03');
  });

  test('serializeDateOnlyValue keeps date-only values stable and serializes timestamps', () => {
    const date = new Date('2026-06-21T15:00:00.000Z');
    assert.equal(serializeDateOnlyValue(date), '2026-06-22');
    assert.equal(serializeDateOnlyValue(1), '1970-01-01');
    assert.equal(serializeDateOnlyValue('2026-06-21'), '2026-06-21');
    assert.equal(serializeDateOnlyValue('2026-06-21T15:00:00.000Z'), '2026-06-22');
  });

  test('serializeDateTimeValue and serializeEventDoc preserve event payload shape', () => {
    const date = new Date('2026-06-21T12:34:56.000Z');
    assert.equal(serializeDateTimeValue(date), '2026-06-21T12:34:56.000Z');
    const doc = serializeEventDoc('kodai2026', {
      distributionTimeZone: 'Asia/Tokyo',
      createdAt: date,
      updatedAt: new Date('2026-06-21T13:00:00.000Z'),
      distributionStartDate: '2026-06-01',
      distributionEndDate: '2026-06-03',
      distributionAvailabilitySlots: ['2026-06-01_am'],
    });
    assert.equal(doc.id, 'kodai2026');
    assert.equal(doc.createdAt, '2026-06-21T12:34:56.000Z');
    assert.equal(doc.updatedAt, '2026-06-21T13:00:00.000Z');
    assert.equal(doc.distributionStartDate, '2026-06-01');
    assert.equal(doc.distributionEndDate, '2026-06-03');
  });
});
