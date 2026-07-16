import { formatAvailabilitySlotLabel } from '@/lib/utils/availability/availability';

type AssignmentStatusSummaryProps = {
  assignment?: {
    assignedBy?: 'auto' | 'manual';
    timeSlot?: string;
  } | null;
  team?: {
    teamName?: string;
  } | null;
  areaLabel?: string;
  compact?: boolean;
};

function getTimeSlotBadgeClass(timeSlot: string): string {
  if (timeSlot.endsWith('_am')) return 'bg-yellow-100 text-yellow-800';
  if (timeSlot.endsWith('_pm')) return 'bg-purple-100 text-purple-800';
  return 'bg-gray-100 text-gray-800';
}

export function AssignmentStatusSummary({
  assignment,
  team,
  areaLabel,
  compact = false,
}: AssignmentStatusSummaryProps) {
  if (!assignment || !team) {
    return (
      <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-800">
        未割り当て
      </span>
    );
  }

  const assignedBy = assignment.assignedBy === 'manual' ? 'manual' : 'auto';
  const assignmentLabel = assignedBy === 'auto' ? '自動' : '手動';

  return (
    <div className={compact ? 'text-xs' : 'text-sm'}>
      {!compact && <div className="font-medium text-gray-900">{team.teamName}</div>}
      {areaLabel && !compact && <div className="text-gray-500">{areaLabel}</div>}
      {assignment.timeSlot && !compact && (
        <div className="text-xs text-gray-400">
          配布枠: {formatAvailabilitySlotLabel(assignment.timeSlot)}
        </div>
      )}
      <div className={compact ? 'mt-1 flex flex-wrap gap-1' : 'mt-1 flex flex-wrap gap-2'}>
        <span
          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
            assignedBy === 'auto' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
          }`}
        >
          {assignmentLabel}
        </span>
        {assignment.timeSlot && (
          <span
            className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getTimeSlotBadgeClass(
              assignment.timeSlot,
            )}`}
          >
            {formatAvailabilitySlotLabel(assignment.timeSlot)}
          </span>
        )}
      </div>
    </div>
  );
}
