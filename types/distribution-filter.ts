// 配布履歴フィルター
export interface DistributionFilter {
  year?: number;
  eventId?: string;
  teamCode?: string;
  areaCode?: string;
  timeSlot?: 'morning' | 'afternoon';
  completionRateMin?: number;
  completionRateMax?: number;
}
