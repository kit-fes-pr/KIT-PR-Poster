import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildTeamManualLoginUrl,
  normalizeTeamManualRows,
  TEAM_MANUAL_BASE_URL,
} from '../../lib/utils/team/team-manual';
import { compareTeamsByDistributionSlot } from '../../lib/utils/team/team-sort';

describe('team manual utils', () => {
  test('buildTeamManualLoginUrl keeps login code as a prefilled query', () => {
    assert.equal(
      buildTeamManualLoginUrl(' AM1-2026 '),
      `${TEAM_MANUAL_BASE_URL}/?teamCode=AM1-2026`,
    );
    assert.equal(
      buildTeamManualLoginUrl('午前1班'),
      `${TEAM_MANUAL_BASE_URL}/?teamCode=%E5%8D%88%E5%89%8D1%E7%8F%AD`,
    );
  });

  test('normalizeTeamManualRows keeps only printable team rows', () => {
    assert.deepEqual(
      normalizeTeamManualRows([
        { id: 'team-1', teamName: ' 午前1班 ', teamCode: ' AM1-2026 ' },
        { teamId: 'team-2', teamName: '', teamCode: 'AM2-2026' },
        { teamId: 'team-3', teamName: '午前3班', teamCode: '' },
      ]),
      [{ teamId: 'team-1', teamName: '午前1班', teamCode: 'AM1-2026' }],
    );
  });
});

test('compareTeamsByDistributionSlot sorts date, period, then Japanese team name', () => {
  const teams = [
    { teamName: 'い班', teamCode: 'B', timeSlot: '2026-06-02_am' },
    { teamName: 'あ班', teamCode: 'C', timeSlot: '2026-06-01_pm' },
    { teamName: 'か班', teamCode: 'A', timeSlot: '2026-06-01_am' },
    { teamName: 'あ班', teamCode: 'D', timeSlot: '2026-06-01_am' },
  ].sort(compareTeamsByDistributionSlot);

  assert.deepEqual(
    teams.map((team) => `${team.timeSlot}:${team.teamName}:${team.teamCode}`),
    [
      '2026-06-01_am:あ班:D',
      '2026-06-01_am:か班:A',
      '2026-06-01_pm:あ班:C',
      '2026-06-02_am:い班:B',
    ],
  );
});
