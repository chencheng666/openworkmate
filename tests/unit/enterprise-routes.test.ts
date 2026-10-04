import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

const parseJsonBodyMock = vi.fn();
const sendJsonMock = vi.fn();

vi.mock('@electron/api/route-utils', () => ({
  parseJsonBody: (...args: unknown[]) => parseJsonBodyMock(...args),
  sendJson: (...args: unknown[]) => sendJsonMock(...args),
}));

describe('handleEnterpriseRoutes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('forwards enterprise API calls to the WorkMate backend', async () => {
    parseJsonBodyMock.mockResolvedValueOnce({ query: 'SLA' });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ citations: [] }), { status: 200 }));
    const { handleEnterpriseRoutes } = await import('@electron/api/routes/enterprise');

    const handled = await handleEnterpriseRoutes(
      {
        method: 'POST',
        headers: { 'x-user-id': 'u-001' },
      } as IncomingMessage,
      {} as ServerResponse,
      new URL('http://127.0.0.1:13210/api/enterprise/knowledge/search?topK=3'),
    );

    expect(handled).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:18790/api/knowledge/search?topK=3',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ query: 'SLA' }),
        headers: expect.objectContaining({
          'x-user-id': 'u-001',
          'x-tenant-id': 'workmate',
          'x-role-ids': 'platform-admin,business-owner',
        }),
      }),
    );
    expect(sendJsonMock).toHaveBeenCalledWith(expect.anything(), 200, { citations: [] });
  });

  it('returns false for non-enterprise routes', async () => {
    const { handleEnterpriseRoutes } = await import('@electron/api/routes/enterprise');

    const handled = await handleEnterpriseRoutes(
      { method: 'GET', headers: {} } as IncomingMessage,
      {} as ServerResponse,
      new URL('http://127.0.0.1:13210/api/settings'),
    );

    expect(handled).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
