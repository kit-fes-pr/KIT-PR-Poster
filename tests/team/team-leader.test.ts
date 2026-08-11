import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { selectTeamLeaderResponseId } from '../../lib/utils/team/team-leader';

describe('team leader selection', () => {
  test('selects a PR third-year before a higher-grade member', () => {
    assert.equal(
      selectTeamLeaderResponseId([
        { responseId: 'fourth-year', name: '一般4年', grade: 4, section: '一般' },
        { responseId: 'pr-third-year', name: 'PR3年', grade: 3, section: 'pr' },
      ]),
      'pr-third-year',
    );
  });

  test('selects the highest-grade member when there is no PR third-year', () => {
    assert.equal(
      selectTeamLeaderResponseId([
        { responseId: 'second-year', name: '2年', grade: 2, section: '一般' },
        { responseId: 'third-year', name: '3年', grade: 3, section: '一般' },
      ]),
      'third-year',
    );
  });

  test('returns undefined when there are no members', () => {
    assert.equal(selectTeamLeaderResponseId([]), undefined);
  });
});
