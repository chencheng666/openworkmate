import { UnauthorizedException } from '@nestjs/common';
import { verifyAuthToken } from './auth-token';

export type RequestContext = {
  tenantId: string;
  userId: string;
  userName?: string;
  orgId?: string;
  roleIds: string[];
  parkIds: string[];
};

export function contextFromHeaders(headers: Record<string, string | string[] | undefined>): RequestContext {
  const getHeader = (key: string) => {
    const value = headers[key.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  };

  const splitHeader = (value?: string) => (value || '').split(',').map((item) => item.trim()).filter(Boolean);
  const cookieValue = (name: string) => {
    const cookie = getHeader('cookie') || '';
    const item = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
    return item ? decodeURIComponent(item.slice(name.length + 1)) : undefined;
  };
  const decodeHeader = (value?: string) => {
    if (!value) return undefined;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  const authMode = (process.env.AUTH_MODE ?? 'development').trim().toLowerCase();
  const authorization = getHeader('authorization');
  if (authMode === 'jwt') {
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : cookieValue(process.env.AUTH_COOKIE_NAME?.trim() || 'workmate_session');
    if (!token) throw new UnauthorizedException('请先登录。');
    const claims = verifyAuthToken(token);
    return {
      tenantId: claims.tenantId,
      userId: claims.sub,
      userName: claims.name || claims.sub,
      orgId: claims.orgId,
      roleIds: claims.roles,
      parkIds: claims.parks ?? [],
    };
  }

  if (authMode !== 'development' && authMode !== 'trusted-proxy') {
    throw new UnauthorizedException('AUTH_MODE 配置不受支持。');
  }

  if (authMode === 'development'
    && process.env.NODE_ENV === 'production'
    && process.env.AUTH_ALLOW_DEV_AUTH !== 'true') {
    throw new UnauthorizedException('生产环境禁止使用开发身份，请配置 AUTH_MODE=jwt 或 trusted-proxy。');
  }

  if (authMode === 'trusted-proxy') {
    const proxySecret = process.env.TRUSTED_PROXY_SECRET?.trim();
    if (!proxySecret || getHeader('x-workmate-auth-secret') !== proxySecret) {
      throw new UnauthorizedException('未通过可信网关身份校验。');
    }
  }

  return {
    tenantId: getHeader('x-tenant-id') || 'workmate',
    userId: getHeader('x-user-id') || 'demo-user',
    userName: decodeHeader(getHeader('x-user-name')) || '演示用户',
    orgId: getHeader('x-org-id') || 'headquarters',
    roleIds: splitHeader(getHeader('x-role-ids') || 'platform-admin'),
    parkIds: splitHeader(getHeader('x-park-ids')),
  };
}
