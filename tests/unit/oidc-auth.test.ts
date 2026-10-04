import { describe, expect, it, vi } from 'vitest';
import { OidcAuthService } from '../../backend/src/modules/auth/oidc-auth.service';

describe('OIDC 登录适配器', () => {
  it('根据 OIDC Discovery 生成带 state 和 nonce 的登录地址', async () => {
    const config = {
      get: (key: string) => ({
        AUTH_MODE: 'jwt',
        OIDC_ISSUER: 'https://sso.example.test',
        OIDC_CLIENT_ID: 'workmate-web',
        OIDC_REDIRECT_URI: 'http://localhost:5180/auth/callback',
      }[key]),
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      issuer: 'https://sso.example.test',
      authorization_endpoint: 'https://sso.example.test/authorize',
      token_endpoint: 'https://sso.example.test/token',
      jwks_uri: 'https://sso.example.test/jwks',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = new OidcAuthService(config as never);
    expect(service.getConfig()).toMatchObject({ mode: 'jwt', oidcEnabled: true, devLoginEnabled: false });
    const result = await service.start();
    const url = new URL(result.url);
    expect(url.origin).toBe('https://sso.example.test');
    expect(url.pathname).toBe('/authorize');
    expect(url.searchParams.get('client_id')).toBe('workmate-web');
    expect(url.searchParams.get('state')).toHaveLength(32);
    expect(url.searchParams.get('nonce')).toHaveLength(32);

    vi.unstubAllGlobals();
  });
});
