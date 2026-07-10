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

export interface Team {
  teamId: string;
  teamCode: string;
  teamName: string;
  timeSlot: string; // 配布枠キー: YYYY-MM-DD_am / YYYY-MM-DD_pm
  assignedArea: string;
  areaId?: string;
  adjacentAreas: string[];
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
  // タイムスタンプ
  createdAt: Date | string;
  updatedAt?: Date | string;
}

export interface Store {
  storeId: string;
  storeName: string;
  storeNameKana: string;
  address: string;
  addressKana: string;
  areaCode: string;
  distributionStatus: 'pending' | 'completed' | 'failed' | 'revisit';
  failureReason?: 'absent' | 'refused' | 'closed' | 'other';
  distributedCount: number;
  distributedBy: string;
  createdByTeamCode?: string;
  distributedAt?: Date;
  notes?: string;
  registrationMethod: 'preset' | 'manual';
  eventId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Area {
  areaId: string;
  areaCode: string;
  areaName: string;
  adjacentAreas?: string[];
  description?: string;
  createdAt: Date;
}

export interface Member {
  memberId: string;
  name: string;
  displayName?: string; // 表示名
  studentId?: string; // 学籍番号
  section: string;
  department?: string; // 学科
  grade: number;
  availableSlots?: string[];
  teamId?: string;
  year?: number; // 年度
  source: 'form';
  createdAt: Date | string;
  updatedAt?: Date | string;
}

export interface Admin {
  adminId: string;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
}

export interface TempAccount {
  accountId: string;
  teamCode: string;
  tempEmail: string;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
}

export interface AuthUser {
  uid: string;
  email?: string;
  teamCode?: string;
  teamId?: string;
  isAdmin: boolean;
  customClaims?: {
    teamCode?: string;
    teamId?: string;
    role?: 'admin' | 'team';
  };
}

export interface StoreFormData {
  storeName: string;
  address: string;
  distributionStatus: Store['distributionStatus'];
  failureReason?: Store['failureReason'];
  distributedCount: number;
  notes?: string;
}

export interface LoginFormData {
  teamCode: string;
}

export interface AdminLoginFormData {
  email: string;
  password: string;
}

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

export interface TeamMember {
  memberId: string;
  name: string;
  section: string;
  grade: number;
  role?: 'leader' | 'member';
  joinedAt: Date;
}

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
  notes?: string;
}

// 年度別統計データ
export interface YearlyStats {
  year: number;
  eventName: string;
  totalEvents: number;
  totalStores: number;
  totalTeams: number;
  totalMembers: number;
  averageCompletionRate: number;
  bestPerformingTeam: {
    teamCode: string;
    teamName: string;
    completionRate: number;
  };
  distributionTrends: {
    date: Date;
    completedStores: number;
    totalStores: number;
  }[];
}

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
