export interface AccountInfo {
  user: AccountUser;
  tokens: AccountTokens;
  origin: 'login' | 'cli';
}

export interface AccountUser {
  iss: string;
  azp: string;
  aud: string;
  sub: string;
  email: string;
  email_verified: true;
  at_hash: string;
  iat: number;
  exp: number;
}

export interface AccountTokens {
  expires_at: number;
  refresh_token: string;
  scopes: string[];
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token: string;
}
