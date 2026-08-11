export interface TeamMember {
  memberId: string;
  name: string;
  section: string;
  grade: number;
  role?: 'leader' | 'member';
  joinedAt: Date;
}
