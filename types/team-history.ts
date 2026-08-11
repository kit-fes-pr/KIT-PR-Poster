import type { TeamMember } from './team-member';
import type { StoreDistributionRecord } from './store-distribution-record';

export interface TeamHistory {
  teamId: string;
  teamCode: string;
  teamName: string;
  timeSlot: 'morning' | 'afternoon';
  assignedArea: string;
  adjacentAreas: string[];
  members: TeamMember[];
  totalStores: number;
  completedStores: number;
  completionRate: number;
  distributedStores: StoreDistributionRecord[];
}
