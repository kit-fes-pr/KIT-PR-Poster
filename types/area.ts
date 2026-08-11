export interface Area {
  areaId: string;
  areaCode: string;
  areaName: string;
  adjacentAreas?: string[];
  description?: string;
  createdAt: Date;
}
