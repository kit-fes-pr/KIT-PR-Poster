import type { Store } from './store';

export interface StoreFormData {
  storeName: string;
  address: string;
  latitude?: number;
  longitude?: number;
  distributionStatus: Store['distributionStatus'];
  failureReason?: Store['failureReason'];
  distributedCount: number;
  requiresPosterPickup?: boolean;
  notes?: string;
}
