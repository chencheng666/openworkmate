import { createHmac, timingSafeEqual } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';

export type AuthTokenClaims = {
  sub: string;
  name?: string;
  tenantId: string;
  orgId?: string;
  roles: string[];
  parks?: string[];
  exp: number;
};

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

function secret() {
  const value = process.env.JWT_SECRET?.trim();
  if (!value || value.length < 32) {
    throw new UnauthorizedException('服务端 JWT_SECRET 未配置或长度不足。');
  }
  return value;
}

export function signAuthToken(claims: Omit<AuthTokenClaims, 'exp'> & { exp?: number }) {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({ ...claims, exp: claims.exp ?? Math.floor(Date.now() / 1000) + 8 * 60 * 60 }));
  const body = `${header}.${payload}`;
  const signature = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifyAuthToken(token: string): AuthTokenClaims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new UnauthorizedException('登录凭证格式无效。');

  const [encodedHeader, encodedPayload, providedSignature] = parts;
  const expectedSignature = createHmac('sha256', secret())
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const actualSignature = Buffer.from(providedSignature, 'base64url');
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
    throw new UnauthorizedException('登录凭证签名无效。');
  }

  try {
    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8')) as { alg?: string; typ?: string };
    if (header.alg !== 'HS256' || header.typ !== 'JWT') throw new Error('unsupported token');
    const claims = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Partial<AuthTokenClaims>;
    if (!claims.sub || !claims.tenantId || !Array.isArray(claims.roles) || !claims.exp || claims.exp <= Math.floor(Date.now() / 1000)) {
      throw new Error('invalid claims');
    }
    return claims as AuthTokenClaims;
  } catch {
    throw new UnauthorizedException('登录凭证内容无效或已过期。');
  }
}
