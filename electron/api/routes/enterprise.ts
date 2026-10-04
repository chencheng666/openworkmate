import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'http';
import { parseJsonBody, RequestBodyTooLargeError, sendJson } from '../route-utils';

const ENTERPRISE_PREFIX = '/api/enterprise';
const DEFAULT_BACKEND_URL = 'http://127.0.0.1:18790/api';
const MAX_ENTERPRISE_REQUEST_BYTES = 12 * 1024 * 1024;

function getBackendBaseUrl(): string {
  return (process.env.WORKMATE_BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/$/, '');
}

function getSingleHeader(headers: IncomingHttpHeaders, name: string, fallback: string): string {
  const value = headers[name];
  if (Array.isArray(value)) return value[0] || fallback;
  return value || fallback;
}

function buildForwardHeaders(headers: IncomingHttpHeaders): HeadersInit {
  return {
    'content-type': 'application/json',
    'x-tenant-id': getSingleHeader(headers, 'x-tenant-id', 'workmate'),
    'x-user-id': getSingleHeader(headers, 'x-user-id', 'demo-user'),
    'x-user-name': getSingleHeader(headers, 'x-user-name', '企业员工'),
    'x-org-id': getSingleHeader(headers, 'x-org-id', 'headquarters'),
    'x-role-ids': getSingleHeader(headers, 'x-role-ids', 'platform-admin,business-owner'),
  };
}

function buildTargetUrl(url: URL): string {
  const upstreamPath = url.pathname.slice(ENTERPRISE_PREFIX.length) || '/';
  return `${getBackendBaseUrl()}${upstreamPath}${url.search}`;
}

export async function handleEnterpriseRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (!url.pathname.startsWith(ENTERPRISE_PREFIX)) return false;

  try {
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const body = hasBody ? await parseJsonBody<unknown>(req, MAX_ENTERPRISE_REQUEST_BYTES) : undefined;
    const response = await fetch(buildTargetUrl(url), {
      method: req.method,
      headers: buildForwardHeaders(req.headers),
      body: hasBody ? JSON.stringify(body ?? {}) : undefined,
    });

    const text = await response.text();
    if (!text) {
      sendJson(res, response.status, {});
      return true;
    }

    try {
      sendJson(res, response.status, JSON.parse(text));
    } catch {
      sendJson(res, response.status, {
        success: response.ok,
        text,
      });
    }
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      sendJson(res, 413, {
        success: false,
        error: '上传内容过大，单个知识文件不能超过 8 MB。',
      });
      return true;
    }
    sendJson(res, 502, {
      success: false,
      error: `WorkMate backend is not reachable: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  return true;
}
