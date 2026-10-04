import { Body, Controller, Get, Headers, HttpStatus, Post, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';
import { contextFromHeaders } from '../../common/request-context';
import { signAuthToken } from '../../common/auth-token';
import { OidcAuthService } from './oidc-auth.service';

class DevLoginDto {
  @IsString()
  @MinLength(2)
  userId!: string;

  @IsString()
  @MinLength(2)
  userName!: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  orgId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];
}

@Controller('auth')
export class AuthController {
  constructor(private readonly oidc: OidcAuthService) {}

  @Get('config')
  config() {
    return this.oidc.getConfig();
  }

  @Get('oidc/start')
  oidcStart() {
    return this.oidc.start();
  }

  @Get('oidc/callback')
  async oidcCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    if (!code || !state) return reply.code(HttpStatus.BAD_REQUEST).send({ authenticated: false, message: 'SSO 回调缺少 code 或 state。' });
    const result = await this.oidc.callback(code, state);
    const redirectUri = this.oidc.getConfig().webRedirectUri;
    if (!redirectUri) return reply.send({ authenticated: true, ...result });
    const cookieName = process.env.AUTH_COOKIE_NAME?.trim() || 'workmate_session';
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    const domain = process.env.AUTH_COOKIE_DOMAIN?.trim() ? `; Domain=${process.env.AUTH_COOKIE_DOMAIN.trim()}` : '';
    reply.header('Set-Cookie', `${cookieName}=${encodeURIComponent(result.token)}; HttpOnly; Path=/; Max-Age=${result.expiresIn}; SameSite=Lax${secure}${domain}`);
    const location = new URL(redirectUri);
    return reply.redirect(location.toString());
  }

  @Get('me')
  me(@Headers() headers: Record<string, string | string[] | undefined>) {
    const context = contextFromHeaders(headers);
    return { authenticated: true, context };
  }

  @Post('logout')
  logout(@Res() reply: FastifyReply) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    const domain = process.env.AUTH_COOKIE_DOMAIN?.trim() ? `; Domain=${process.env.AUTH_COOKIE_DOMAIN.trim()}` : '';
    reply.header('Set-Cookie', `${process.env.AUTH_COOKIE_NAME?.trim() || 'workmate_session'}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}${domain}`);
    return reply.send({ authenticated: false });
  }

  @Post('dev-login')
  devLogin(@Body() dto: DevLoginDto) {
    if ((process.env.AUTH_MODE ?? 'development').trim().toLowerCase() !== 'development'
      || (process.env.NODE_ENV === 'production' && process.env.AUTH_ALLOW_DEV_AUTH !== 'true')) {
      return { authenticated: false, message: '开发登录仅在 AUTH_MODE=development 时可用。' };
    }
    const token = signAuthToken({
      sub: dto.userId,
      name: dto.userName,
      tenantId: dto.tenantId ?? 'workmate',
      orgId: dto.orgId ?? 'headquarters',
      roles: dto.roles ?? ['employee'],
      parks: [],
    });
    return { authenticated: true, token, expiresIn: 8 * 60 * 60 };
  }
}
