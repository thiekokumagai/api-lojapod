export type JwtPayload = {
  sub: string;
  email: string;
};

export type JwtRefreshPayload = JwtPayload & {
  refreshToken?: string;
};
