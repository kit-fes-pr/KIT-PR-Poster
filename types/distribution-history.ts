import type { TeamHistory } from './team-history';
import type { AreaHistory } from './area-history';

// 年度別データ管理
export interface DistributionHistory {
  historyId: string;
  eventId: string;
  year: number;
  eventName: string;
  distributionDate: Date;
  totalStores: number;
  completedStores: number;
  failedStores: number;
  completionRate: number;
  teams: TeamHistory[];
  areas: AreaHistory[];
  createdAt: Date;
  archivedAt: Date;
}
