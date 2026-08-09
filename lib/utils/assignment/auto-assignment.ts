import { normalizeGrade } from '../grade/grade';
import { effectiveSlotCount, getMatchingTeamSlots, resolveParticipantSlotKeys } from './assignment';

export interface AutoAssignmentParticipant {
  responseId: string;
  name: string;
  grade: number;
  section: string;
  availableSlots: string[];
  carUsage?: unknown;
  answers?: Array<{ fieldId: string; value: unknown }>;
}

export interface AutoAssignmentTeam {
  teamId: string;
  teamCode: string;
  teamName: string;
  timeSlot: string;
  assignedArea: string;
  adjacentAreas?: string[];
  maxMembers?: number;
  preferredGrades?: number[];
  requiresCar?: boolean;
}

export interface AutoAssignmentRecord {
  responseId: string;
  teamId: string;
  assignedAt: Date;
  assignedBy: 'auto' | 'manual';
  timeSlot: string;
}

export interface StoredAutoAssignmentRecord extends AutoAssignmentRecord {
  year?: number;
  formId?: string;
}

export function getParticipantCarUsage(participant: AutoAssignmentParticipant): string {
  if (typeof participant.carUsage === 'string') return participant.carUsage.trim();

  const answer = participant.answers?.find((item) => item.fieldId === 'carUsage');
  if (typeof answer?.value === 'string') return answer.value.trim();

  return '';
}

export function canParticipantDrive(participant: AutoAssignmentParticipant): boolean {
  return getParticipantCarUsage(participant) === '運転できる';
}

export function performAutoAssignment(
  participants: AutoAssignmentParticipant[],
  teams: AutoAssignmentTeam[],
  eventSlotKeys: string[],
  existingAssignments: StoredAutoAssignmentRecord[] = [],
): {
  assignments: AutoAssignmentRecord[];
  skippedUnavailable: number;
  skippedNoMatchingTeam: number;
  skippedFull: number;
  carRequiredTeamIdsWithoutDriver: string[];
} {
  const assignments: AutoAssignmentRecord[] = [];
  const usedParticipants = new Set<string>();
  let skippedUnavailable = 0;
  let skippedNoMatchingTeam = 0;
  let skippedFull = 0;

  const normalizedParticipants = participants.map((participant) => ({
    ...participant,
    grade: normalizeGrade(participant.grade),
  }));
  const normalizedTeams = teams.map((team) => ({
    ...team,
    preferredGrades: Array.isArray(team.preferredGrades)
      ? team.preferredGrades.map((grade) => normalizeGrade(grade)).filter((grade) => grade > 0)
      : undefined,
    requiresCar: team.requiresCar === true,
  }));
  const participantById = new Map(
    normalizedParticipants.map((participant) => [participant.responseId, participant] as const),
  );
  const teamById = new Map(normalizedTeams.map((team) => [team.teamId, team] as const));

  const teamAssignmentCount: Record<string, number> = {};
  const teamSeniorCount: Record<string, number> = {};
  const teamDriverCount: Record<string, number> = {};
  const teamSectionCount: Record<string, Record<string, number>> = {};
  const teamGradeCount: Record<string, Record<number, number>> = {};
  normalizedTeams.forEach((team) => {
    teamAssignmentCount[team.teamId] = 0;
    teamSeniorCount[team.teamId] = 0;
    teamDriverCount[team.teamId] = 0;
    teamSectionCount[team.teamId] = {};
    teamGradeCount[team.teamId] = {};
  });

  const applyAssignmentState = (
    participant: AutoAssignmentParticipant,
    team: AutoAssignmentTeam,
    assignment: AutoAssignmentRecord,
  ) => {
    usedParticipants.add(assignment.responseId);
    teamAssignmentCount[team.teamId]++;

    if (participant.grade >= 3) {
      teamSeniorCount[team.teamId]++;
    }
    if (canParticipantDrive(participant)) {
      teamDriverCount[team.teamId]++;
    }

    teamSectionCount[team.teamId][participant.section] =
      (teamSectionCount[team.teamId][participant.section] || 0) + 1;
    teamGradeCount[team.teamId][participant.grade] =
      (teamGradeCount[team.teamId][participant.grade] || 0) + 1;
  };

  existingAssignments.forEach((assignment) => {
    const participant = participantById.get(assignment.responseId);
    const team = teamById.get(assignment.teamId);
    if (!participant || !team) return;
    applyAssignmentState(participant, team, assignment);
  });

  const sortedParticipants = [...normalizedParticipants].sort((a, b) => {
    const aIsSenior = a.grade >= 3;
    const bIsSenior = b.grade >= 3;

    if (aIsSenior && !bIsSenior) return -1;
    if (!aIsSenior && bIsSenior) return 1;

    const slotCountDiff =
      effectiveSlotCount(a.availableSlots, eventSlotKeys) -
      effectiveSlotCount(b.availableSlots, eventSlotKeys);
    if (slotCountDiff !== 0) return slotCountDiff;

    return a.responseId.localeCompare(b.responseId);
  });

  const createAssignment = (
    participant: AutoAssignmentParticipant,
    team: AutoAssignmentTeam,
  ): AutoAssignmentRecord | null => {
    const participantSlotKeys = resolveParticipantSlotKeys(
      participant.availableSlots,
      eventSlotKeys,
    );
    const assignmentTimeSlot = getMatchingTeamSlots(team, eventSlotKeys).find((slot) =>
      participantSlotKeys.includes(slot),
    );
    if (!assignmentTimeSlot) return null;

    return {
      responseId: participant.responseId,
      teamId: team.teamId,
      assignedAt: new Date(),
      assignedBy: 'auto',
      timeSlot: assignmentTimeSlot,
    };
  };

  const assign = (participant: AutoAssignmentParticipant, team: AutoAssignmentTeam): boolean => {
    if (teamAssignmentCount[team.teamId] >= (team.maxMembers || 10)) return false;
    const assignment = createAssignment(participant, team);
    if (!assignment) return false;

    assignments.push(assignment);
    applyAssignmentState(participant, team, assignment);
    return true;
  };

  const carRequiredTeams = normalizedTeams
    .filter((team) => team.requiresCar)
    .sort((a, b) => a.teamId.localeCompare(b.teamId));

  for (const team of carRequiredTeams) {
    if (teamDriverCount[team.teamId] > 0) continue;

    const driverCandidates = sortedParticipants.filter((participant) => {
      if (usedParticipants.has(participant.responseId)) return false;
      if (!canParticipantDrive(participant)) return false;
      if (teamAssignmentCount[team.teamId] >= (team.maxMembers || 10)) return false;
      return createAssignment(participant, team) !== null;
    });

    if (driverCandidates.length === 0) continue;

    const [driver] = driverCandidates.sort((a, b) => {
      const slotCountDiff =
        effectiveSlotCount(a.availableSlots, eventSlotKeys) -
        effectiveSlotCount(b.availableSlots, eventSlotKeys);
      if (slotCountDiff !== 0) return slotCountDiff;
      if (b.grade !== a.grade) return b.grade - a.grade;
      return a.responseId.localeCompare(b.responseId);
    });
    assign(driver, team);
  }

  for (const participant of sortedParticipants) {
    if (usedParticipants.has(participant.responseId)) continue;

    const participantSlotKeys = resolveParticipantSlotKeys(
      participant.availableSlots,
      eventSlotKeys,
    );
    if (participantSlotKeys.length === 0) {
      skippedUnavailable++;
      continue;
    }

    const candidateTeams = normalizedTeams.filter((team) => {
      return getMatchingTeamSlots(team, eventSlotKeys).some((slot) =>
        participantSlotKeys.includes(slot),
      );
    });

    if (candidateTeams.length === 0) {
      skippedNoMatchingTeam++;
      continue;
    }

    const bestTeam = selectBalancedBestTeam(
      candidateTeams,
      participant,
      teamAssignmentCount,
      teamSeniorCount,
      teamSectionCount,
      teamGradeCount,
    );

    if (bestTeam) {
      assign(participant, bestTeam);
    }
  }

  const skippedByCapacity =
    participants.length - usedParticipants.size - skippedUnavailable - skippedNoMatchingTeam;
  if (skippedByCapacity > 0) {
    skippedFull += skippedByCapacity;
  }

  const carRequiredTeamIdsWithoutDriver = carRequiredTeams
    .filter((team) => teamDriverCount[team.teamId] === 0)
    .map((team) => team.teamId);

  return {
    assignments,
    skippedUnavailable,
    skippedNoMatchingTeam,
    skippedFull,
    carRequiredTeamIdsWithoutDriver,
  };
}

function selectBalancedBestTeam(
  candidateTeams: AutoAssignmentTeam[],
  participant: AutoAssignmentParticipant,
  teamAssignmentCount: Record<string, number>,
  teamSeniorCount: Record<string, number>,
  teamSectionCount: Record<string, Record<string, number>>,
  teamGradeCount: Record<string, Record<number, number>>,
): AutoAssignmentTeam | null {
  if (candidateTeams.length === 0) return null;

  const availableTeams = candidateTeams.filter(
    (team) => teamAssignmentCount[team.teamId] < (team.maxMembers || 10),
  );
  if (availableTeams.length === 0) return null;

  const minCount = Math.min(...availableTeams.map((t) => teamAssignmentCount[t.teamId]));
  let bestTeams = availableTeams.filter((t) => teamAssignmentCount[t.teamId] === minCount);

  const section = participant.section;
  const minSectionDup = Math.min(...bestTeams.map((t) => teamSectionCount[t.teamId][section] || 0));
  bestTeams = bestTeams.filter((t) => (teamSectionCount[t.teamId][section] || 0) === minSectionDup);

  const grade = participant.grade;
  const minGradeDup = Math.min(...bestTeams.map((t) => teamGradeCount[t.teamId][grade] || 0));
  bestTeams = bestTeams.filter((t) => (teamGradeCount[t.teamId][grade] || 0) === minGradeDup);

  const isSenior = grade >= 3;
  const withSeniorPreference = bestTeams.sort((a, b) => {
    const aNeedSenior = teamSeniorCount[a.teamId] === 0 ? 1 : 0;
    const bNeedSenior = teamSeniorCount[b.teamId] === 0 ? 1 : 0;
    if (aNeedSenior !== bNeedSenior && isSenior) return bNeedSenior - aNeedSenior;
    return 0;
  });

  const preferredFirst = withSeniorPreference.sort((a, b) => {
    const aPref = a.preferredGrades?.includes(grade) ? 1 : 0;
    const bPref = b.preferredGrades?.includes(grade) ? 1 : 0;
    return bPref - aPref;
  });

  preferredFirst.sort((a, b) => a.teamId.localeCompare(b.teamId));

  return preferredFirst[0] || null;
}
