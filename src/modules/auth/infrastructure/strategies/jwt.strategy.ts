import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { JwtPayload } from '../types/jwt-payload.type';
import { TenantContextService } from '../../../tenant/tenant-context.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly tenantContextService: TenantContextService) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET não definido');
    }

    super({
      jwtFromRequest: (req: Request): string | null => {
        const authHeader = req?.headers?.authorization;
        if (typeof authHeader !== 'string') return null;
        return authHeader.replace(/^Bearer\s+/i, '');
      },
      secretOrKey: secret,
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    if (payload.storeId) {
      this.tenantContextService.setStoreId(payload.storeId);
    }

    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      storeId: payload.storeId,
    };
  }
}
