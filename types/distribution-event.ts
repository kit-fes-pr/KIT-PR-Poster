export interface DistributionEvent {
  eventId: string;
  eventName: string;
  distributionStartDate?: Date | string;
  distributionEndDate?: Date | string;
  distributionAvailabilitySlots?: string[];
  distributionTimeZone?: string;
  year: number;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt?: Date | string;
}
