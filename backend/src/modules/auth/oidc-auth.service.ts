import { Injectable, Optional, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { Model } from 'mongoose';
import { randomBytes } from 'node:crypto';
import { signAuthToken } from '../../common/auth-token';
import { OidcLoginState } from './oidc-login-state.schema';

type OidcDiscovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
};

type PendingLogin = { nonce: string; expiresAt: number };

@Injectable()
export class OidcAuthService {
  private readonly pending = new Map<string, PendingLogin>();
  private discovery?: OidcDiscovery;
  private remoteJwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private readonly config: ConfigService,
    @Optional() @InjectModel(OidcLoginState.name) private readonly stateModel?: Model<OidcLoginState>,
  ) {}

  getConfig() {
    const mode = (this.config.get<string>('AUTH_MODE') ?? 'development').trim().toLowerCase();
    return {
      mode,
      oidcEnabled: mode === 'jwt' && Boolean(this.config.get<string>('OIDC_ISSUER') && this.config.get<string>('OIDC_CLIENT_ID')),
      oidcLoginUrl: this.config.get<string>('OIDC_LOGIN_URL')?.trim() || undefined,
      devLoginEnabled: mode === 'development',
      webRedirectUri: this.config.get<string>('OIDC_WEB_REDIRECT_URI')?.trim() || undefined,
    };
  }

  async start() {
    const discovery = await this.loadDiscovery();
    const clientId = this.required('OIDC_CLIENT_ID');
    const redirectUri = this.required('OIDC_REDIRECT_URI');
    const state = randomBytes(24).toString('base64url');
    const nonce = randomBytes(24).toString('base64url');
    await this.savePendingState(state, nonce);
    const url = new URL(discovery.authorization_endpoint);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: this.config.get<string>('OIDC_SCOPE')?.trim() || 'openid profile email',
      state,
      nonce,
    }).toString();
    return { url: url.toString(), expiresIn: 600 };
  }

  async callback(code: string, state: string) {
    const pending = await this.consumePendingState(state);
    if (!pending || pending.expiresAt < Date.now()) throw new UnauthorizedException('SSO 登录状态已过期，请重新登录。');

    const discovery = await this.loadDiscovery();
    const clientId = this.required('OIDC_CLIENT_ID');
    const clientSecret = this.required('OIDC_CLIENT_SECRET');
    const redirectUri = this.required('OIDC_REDIRECT_URI');
    const tokenResponse = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });
    const tokenPayload = await tokenResponse.json().catch(() => null) as { id_token?: string; error_description?: string } | null;
    if (!tokenResponse.ok || !tokenPayload?.id_token) throw new UnauthorizedException(tokenPayload?.error_description || 'SSO 授权码交换失败。');

    if (!this.remoteJwks) this.remoteJwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
    const verified = await jwtVerify(tokenPayload.id_token, this.remoteJwks, {
      issuer: discovery.issuer,
      audience: clientId,
    });
    const claims = verified.payload;
    const userId = this.claimString(claims, 'sub');
    const tenantId = this.claimString(claims, this.config.get<string>('OIDC_TENANT_CLAIM') || 'tenant_id');
    if (!userId || !tenantId) throw new UnauthorizedException('SSO 令牌缺少用户或租户信息。');
    const roles = this.claimStrings(claims, this.config.get<string>('OIDC_ROLES_CLAIM') || 'roles');
    const parks = this.claimStrings(claims, this.config.get<string>('OIDC_PARKS_CLAIM') || 'parks');
    const token = signAuthToken({
      sub: userId,
      name: this.claimString(claims, this.config.get<string>('OIDC_NAME_CLAIM') || 'name') || userId,
      tenantId,
      orgId: this.claimString(claims, this.config.get<string>('OIDC_ORG_CLAIM') || 'org_id'),
      roles: roles.length > 0 ? roles : ['employee'],
      parks,
    });
    return { token, expiresIn: 8 * 60 * 60 };
  }

  private async savePendingState(state: string, nonce: string) {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    if (this.stateModel) {
      await this.stateModel.create({ state, nonce, expiresAt });
      return;
    }
    this.pending.set(state, { nonce, expiresAt: expiresAt.getTime() });
  }

  private async consumePendingState(state: string): Promise<PendingLogin | undefined> {
    if (this.stateModel) {
      const record = await this.stateModel.findOneAndDelete({ state, expiresAt: { $gt: new Date() } }).lean();
      return record ? { nonce: record.nonce, expiresAt: record.expiresAt.getTime() } : undefined;
    }
    const pending = this.pending.get(state);
    this.pending.delete(state);
    return pending;
  }

  private async loadDiscovery() {
    if (this.discovery) return this.discovery;
    const issuer = this.required('OIDC_ISSUER').replace(/\/$/, '');
    const response = await fetch(`${issuer}/.well-known/openid-configuration`);
    const discovery = await response.json().catch(() => null) as Partial<OidcDiscovery> | null;
    if (!response.ok || !discovery?.authorization_endpoint || !discovery.token_endpoint || !discovery.jwks_uri) {
      throw new ServiceUnavailableException('无法读取企业 SSO 的 OIDC 配置。');
    }
    this.discovery = { ...discovery, issuer: discovery.issuer || issuer } as OidcDiscovery;
    return this.discovery;
  }

  private required(name: string) {
    const value = this.config.get<string>(name)?.trim();
    if (!value) throw new ServiceUnavailableException(`未配置 ${name}。`);
    return value;
  }

  private claimString(claims: Record<string, unknown>, name: string) {
    const value = claims[name];
    return typeof value === 'string' ? value.trim() : undefined;
  }

  private claimStrings(claims: Record<string, unknown>, name: string) {
    const value = claims[name];
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
    return [];
  }
}
