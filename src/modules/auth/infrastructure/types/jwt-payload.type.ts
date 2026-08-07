export type JwtPayload = {
  sub: string;
  email: string;
  role?: string;
  storeId?: string | null;
};

export type JwtRefreshPayload = JwtPayload & {
  refreshToken?: string;
};
