export interface AreaHistory {
  areaId: string;
  areaCode: string;
  areaName: string;
  timeSlot: 'morning' | 'afternoon';
  totalStores: number;
  completedStores: number;
  completionRate: number;
  assignedTeams: string[];
}
