export interface Store {
  storeId: string;
  storeName: string;
  storeNameKana: string;
  address: string;
  addressKana: string;
  latitude?: number;
  longitude?: number;
  areaCode: string;
  distributionStatus: 'pending' | 'completed' | 'failed' | 'revisit';
  failureReason?: 'absent' | 'refused' | 'closed' | 'other';
  distributedCount: number;
  distributedBy: string;
  createdByTeamCode?: string;
  distributedAt?: Date;
  requiresPosterPickup?: boolean;
  notes?: string;
  registrationMethod: 'preset' | 'manual';
  eventId: string;
  distributionYear?: number;
  createdAt: Date;
  updatedAt: Date;
}
