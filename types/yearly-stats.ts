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
