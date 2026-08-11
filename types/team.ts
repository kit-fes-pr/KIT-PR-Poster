export interface Team {
  teamId: string;
  teamCode: string;
  teamName: string;
  timeSlot: string; // 配布枠キー: YYYY-MM-DD_am / YYYY-MM-DD_pm
  assignedArea: string;
  areaId?: string;
  adjacentAreas: string[];
  requiresCar?: boolean;
  eventId: string;
  year?: number; // 年度情報を追加
  isActive: boolean;
  // アクセス可能期間（範囲対応）
  validStartDate?:
    Date | string | { _seconds: number; _nanoseconds?: number } | { toDate: () => Date } | null;
  validEndDate?:
    Date | string | { _seconds: number; _nanoseconds?: number } | { toDate: () => Date } | null;
  validDate?:
    Date | string | { _seconds: number; _nanoseconds?: number } | { toDate: () => Date } | null; // 後方互換
  // メンバー関連
  maxMembers?: number;
  memberCount?: number;
  leaderId?: string;
  driverId?: string;
  // タイムスタンプ
  createdAt: Date | string;
  updatedAt?: Date | string;
}
