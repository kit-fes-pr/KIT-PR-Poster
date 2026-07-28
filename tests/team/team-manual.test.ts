import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildTeamManualLoginUrl,
  normalizeTeamManualRows,
  TEAM_MANUAL_BASE_URL,
} from '../../lib/utils/team/team-manual';

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
