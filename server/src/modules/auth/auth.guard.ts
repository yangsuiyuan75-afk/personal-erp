import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import type { AuthenticatedRequest, AuthUser } from './auth.types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: '请先登录' });
    }

    try {
      const payload = await this.jwt.verifyAsync<AuthUser & { type: string; sub: string }>(token);
      if (payload.type !== 'access') throw new Error('wrong token type');
      request.user = { id: payload.sub, username: payload.username };
      return true;
    } catch {
      throw new UnauthorizedException({ code: 'AUTH_EXPIRED', message: '登录已过期，请重新登录' });
    }
  }
}
