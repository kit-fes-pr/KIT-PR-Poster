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
