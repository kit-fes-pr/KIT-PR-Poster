export interface TempAccount {
  accountId: string;
  teamCode: string;
  tempEmail: string;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
}
