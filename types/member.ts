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
