import type { Store } from './store';

export interface StoreDistributionRecord {
  storeId: string;
  storeName: string;
  address: string;
  areaCode: string;
  distributionStatus: Store['distributionStatus'];
  failureReason?: Store['failureReason'];
  distributedCount: number;
  distributedBy: string;
  distributedAt: Date;
  teamMembers: string[];
  requiresPosterPickup?: boolean;
  notes?: string;
}
