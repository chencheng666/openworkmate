import { describe, expect, it } from 'vitest';
import { contextFromHeaders } from '../../backend/src/common/request-context';
import { signAuthToken } from '../../backend/src/common/auth-token';

describe('企业请求身份上下文', () => {
  it('解析组织、角色、园区和编码后的中文姓名', () => {
    const context = contextFromHeaders({
      'x-tenant-id': 'workmate',
      'x-user-id': 'user-001',
      'x-user-name': encodeURIComponent('张三'),
      'x-org-id': 'north-region',
      'x-role-ids': 'park-operator,business-owner',
      'x-park-ids': 'park-beijing-001,park-tianjin-002',
    });

    expect(context).toEqual({
      tenantId: 'workmate',
      userId: 'user-001',
      userName: '张三',
      orgId: 'north-region',
      roleIds: ['park-operator', 'business-owner'],
      parkIds: ['park-beijing-001', 'park-tianjin-002'],
    });
  });

  it('为本地演示提供安全可运行的默认上下文', () => {
    expect(contextFromHeaders({})).toMatchObject({
      tenantId: 'workmate',
      userId: 'demo-user',
      roleIds: ['platform-admin'],
      parkIds: [],
    });
  });

  it('在 jwt 模式下只信任签名令牌中的身份', () => {
    const previousMode = process.env.AUTH_MODE;
    const previousSecret = process.env.JWT_SECRET;
    process.env.AUTH_MODE = 'jwt';
    process.env.JWT_SECRET = 'test-secret-that-is-longer-than-32-characters';
    try {
      const token = signAuthToken({
        sub: 'user-002',
        name: '李四',
        tenantId: 'workmate',
        orgId: 'east-region',
        roles: ['employee'],
        parks: ['park-001'],
      });
      expect(contextFromHeaders({ authorization: `Bearer ${token}`, 'x-user-id': 'forged-user' })).toEqual({
        tenantId: 'workmate',
        userId: 'user-002',
        userName: '李四',
        orgId: 'east-region',
        roleIds: ['employee'],
        parkIds: ['park-001'],
      });
    } finally {
      if (previousMode === undefined) delete process.env.AUTH_MODE;
      else process.env.AUTH_MODE = previousMode;
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    }
  });

  it('在 jwt 模式下支持 HttpOnly 会话 Cookie', () => {
    const previousMode = process.env.AUTH_MODE;
    const previousSecret = process.env.JWT_SECRET;
    process.env.AUTH_MODE = 'jwt';
    process.env.JWT_SECRET = 'test-secret-that-is-longer-than-32-characters';
    try {
      const token = signAuthToken({
        sub: 'user-cookie',
        name: '王五',
        tenantId: 'workmate',
        orgId: 'south-region',
        roles: ['employee'],
        parks: ['park-002'],
      });
      expect(contextFromHeaders({
        cookie: `workmate_session=${token}`,
        'x-user-id': 'forged-user',
      })).toMatchObject({
        tenantId: 'workmate',
        userId: 'user-cookie',
        userName: '王五',
        orgId: 'south-region',
        roleIds: ['employee'],
        parkIds: ['park-002'],
      });
    } finally {
      if (previousMode === undefined) delete process.env.AUTH_MODE;
      else process.env.AUTH_MODE = previousMode;
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    }
  });

  it('生产环境禁止未显式放行的开发身份 Header', () => {
    const previousMode = process.env.AUTH_MODE;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousAllow = process.env.AUTH_ALLOW_DEV_AUTH;
    process.env.AUTH_MODE = 'development';
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_ALLOW_DEV_AUTH;
    try {
      expect(() => contextFromHeaders({ 'x-user-id': 'forged-user' })).toThrow('生产环境禁止使用开发身份');
    } finally {
      if (previousMode === undefined) delete process.env.AUTH_MODE;
      else process.env.AUTH_MODE = previousMode;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousAllow === undefined) delete process.env.AUTH_ALLOW_DEV_AUTH;
      else process.env.AUTH_ALLOW_DEV_AUTH = previousAllow;
    }
  });
});
