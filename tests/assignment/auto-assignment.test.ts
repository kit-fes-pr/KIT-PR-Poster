import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  canParticipantDrive,
  performAutoAssignment,
} from '../../lib/utils/assignment/auto-assignment';

describe('auto assignment utils', () => {
  const eventSlotKeys = ['2026-06-01_am'];
  const baseTeams = [
    {
      teamId: 'team-car',
      teamCode: 'CAR',
      teamName: '車チーム',
      timeSlot: '2026-06-01_am',
      assignedArea: 'A-01',
      maxMembers: 2,
      requiresCar: true,
    },
    {
      teamId: 'team-normal',
      teamCode: 'N',
      teamName: '通常チーム',
      timeSlot: '2026-06-01_am',
      assignedArea: 'A-02',
      maxMembers: 2,
    },
  ];

  test('canParticipantDrive reads carUsage direct values and answers', () => {
    assert.equal(
      canParticipantDrive({
        responseId: 'p1',
        name: '運転者',
        grade: 3,
        section: 'PR',
        availableSlots: eventSlotKeys,
        carUsage: '運転できる',
      }),
      true,
    );
    assert.equal(
      canParticipantDrive({
        responseId: 'p2',
        name: '回答内運転者',
        grade: 2,
        section: 'PR',
        availableSlots: eventSlotKeys,
        answers: [{ fieldId: 'carUsage', value: '運転できる' }],
      }),
      true,
    );
    assert.equal(
      canParticipantDrive({
        responseId: 'p3',
        name: '非運転者',
        grade: 3,
        section: 'PR',
        availableSlots: eventSlotKeys,
        carUsage: '免許はあるが運転しない',
      }),
      false,
    );
  });

  test('performAutoAssignment assigns a driver to every car-required team first', () => {
    const result = performAutoAssignment(
      [
        {
          responseId: 'driver',
          name: '運転者',
          grade: 1,
          section: 'PR',
          availableSlots: eventSlotKeys,
          carUsage: '運転できる',
        },
        {
          responseId: 'senior',
          name: '上級生',
          grade: 4,
          section: 'PR',
          availableSlots: eventSlotKeys,
          carUsage: '免許を持っていない',
        },
      ],
      baseTeams,
      eventSlotKeys,
    );

    assert.equal(result.carRequiredTeamIdsWithoutDriver.length, 0);
    assert.deepEqual(
      result.assignments
        .filter((assignment) => assignment.teamId === 'team-car')
        .map((assignment) => assignment.responseId),
      ['driver'],
    );
  });

  test('manual driver assignment satisfies a car-required team', () => {
    const result = performAutoAssignment(
      [
        {
          responseId: 'driver',
          name: '手動運転者',
          grade: 3,
          section: 'PR',
          availableSlots: eventSlotKeys,
          carUsage: '運転できる',
        },
        {
          responseId: 'member',
          name: '追加メンバー',
          grade: 2,
          section: 'PR',
          availableSlots: eventSlotKeys,
          carUsage: '免許を持っていない',
        },
      ],
      baseTeams,
      eventSlotKeys,
      [
        {
          responseId: 'driver',
          teamId: 'team-car',
          assignedAt: new Date('2026-01-01T00:00:00.000Z'),
          assignedBy: 'manual',
          timeSlot: '2026-06-01_am',
        },
      ],
    );

    assert.equal(result.carRequiredTeamIdsWithoutDriver.length, 0);
    assert.equal(
      result.assignments.some(
        (assignment) => assignment.responseId === 'driver' && assignment.teamId === 'team-car',
      ),
      false,
    );
  });
});
