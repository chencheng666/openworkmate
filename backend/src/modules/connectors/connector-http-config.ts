import { ConnectorDefinition } from './connector.schema';

export type HttpOperation = {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  queryMapping?: Record<string, string>;
  bodyMapping?: Record<string, string>;
  response?: {
    recordsPath?: string;
    totalPath?: string;
    successPath?: string;
    successValues?: Array<string | number | boolean>;
  };
};

export class ConnectorHttpError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validFieldPath(path: unknown): path is string {
  return typeof path === 'string' && path.length > 0 && path.split('.').every(
    (part) => /^[a-zA-Z0-9_-]+$/.test(part) && !['__proto__', 'constructor', 'prototype'].includes(part),
  );
}

export function readField(value: unknown, path: string): unknown {
  if (!validFieldPath(path)) return undefined;
  return path.split('.').reduce<unknown>((current, key) => (
    isRecord(current) && Object.hasOwn(current, key) ? current[key] : undefined
  ), value);
}

export function connectorHttpUrl(baseUrl: string | undefined, path: string): URL {
  try {
    const base = new URL(baseUrl || '');
    const url = new URL(path, base);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password
      || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')
      || Array.from(path).some((char) => char.charCodeAt(0) <= 32) || url.origin !== base.origin || url.hash) throw new Error();
    return url;
  } catch {
    throw new ConnectorHttpError('invalid_config', 'HTTP 连接器需要有效的 HTTP(S) baseUrl 和同源绝对路径。');
  }
}

export function connectorHttpHeaders(connector: Pick<ConnectorDefinition, 'authMode' | 'metadata'>) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (connector.authMode === 'none') return headers;
  if (!['apiKey', 'jwt'].includes(connector.authMode)) {
    throw new ConnectorHttpError('invalid_config', `HTTP 连接器暂不支持 ${connector.authMode} 认证方式。`);
  }
  const env = connector.metadata.apiKeyEnv;
  const token = typeof env === 'string' ? process.env[env]?.trim() : undefined;
  if (!token) throw new ConnectorHttpError('missing_credentials', 'HTTP 连接器未配置服务端凭证环境变量。');
  headers[connector.authMode === 'apiKey' ? 'x-api-key' : 'Authorization'] = connector.authMode === 'apiKey' ? token : `Bearer ${token}`;
  return headers;
}

export function validateHttpConfig(connector: Pick<ConnectorDefinition, 'baseUrl' | 'metadata' | 'authMode'> & {
  capabilities: Array<{ name: string; actionKind: string }>;
}) {
  const metadata = connector.metadata;
  if (metadata.transport !== 'http') return;
  connectorHttpUrl(connector.baseUrl, '/');
  if (!['none', 'apiKey', 'jwt'].includes(connector.authMode)) {
    throw new ConnectorHttpError('invalid_config', 'HTTP 连接器仅支持 none、apiKey、jwt 认证。');
  }
  if (connector.authMode !== 'none' && (typeof metadata.apiKeyEnv !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(metadata.apiKeyEnv))) {
    throw new ConnectorHttpError('invalid_config', '请配置凭证环境变量名称 apiKeyEnv，不要填写密钥本身。');
  }
  if (metadata.timeoutMs !== undefined && (!Number.isInteger(metadata.timeoutMs) || Number(metadata.timeoutMs) < 1 || Number(metadata.timeoutMs) > 60_000)) {
    throw new ConnectorHttpError('invalid_config', 'timeoutMs 必须是 1～60000 的整数。');
  }
  for (const key of ['path', 'searchPath', 'healthPath']) {
    if (metadata[key] !== undefined) {
      if (typeof metadata[key] !== 'string') throw new ConnectorHttpError('invalid_config', `${key} 必须为字符串。`);
      connectorHttpUrl(connector.baseUrl, metadata[key]);
    }
  }
  const checkOperation = (operation: unknown) => {
    if (!isRecord(operation) || typeof operation.path !== 'string') throw new ConnectorHttpError('invalid_config', '每项 HTTP 能力必须配置 path。');
    connectorHttpUrl(connector.baseUrl, operation.path);
    if (operation.method !== undefined && !['GET', 'POST', 'PUT', 'PATCH'].includes(String(operation.method))) {
      throw new ConnectorHttpError('invalid_config', 'HTTP method 必须为 GET、POST、PUT 或 PATCH。');
    }
    for (const key of ['queryMapping', 'bodyMapping']) {
      const mapping = operation[key];
      if (mapping === undefined) continue;
      if (!isRecord(mapping) || Object.entries(mapping).some(([target, source]) => !validFieldPath(target)
        || !validFieldPath(source) || !/^(filters|payload|context)\./.test(source))) {
        throw new ConnectorHttpError('invalid_config', `${key} 必须将目标字段映射到 filters、payload 或 context 中的字段。`);
      }
      const targets = Object.keys(mapping);
      if (targets.some((target) => targets.some((other) => other.startsWith(`${target}.`)))) {
        throw new ConnectorHttpError('invalid_config', `${key} 中不能同时映射父字段和子字段。`);
      }
    }
    if (operation.method === 'GET' && operation.bodyMapping !== undefined) throw new ConnectorHttpError('invalid_config', 'GET 能力不能配置 bodyMapping。');
    if (operation.response !== undefined) {
      const response = operation.response;
      if (!isRecord(response)) throw new ConnectorHttpError('invalid_config', 'response 必须为对象。');
      for (const key of ['recordsPath', 'totalPath', 'successPath']) {
        if (response[key] !== undefined && !validFieldPath(response[key])) throw new ConnectorHttpError('invalid_config', `${key} 必须为有效字段路径。`);
      }
      if (response.successPath !== undefined || response.successValues !== undefined) {
        if (!response.successPath || !Array.isArray(response.successValues) || !response.successValues.length
          || response.successValues.some((value) => !['string', 'number', 'boolean'].includes(typeof value))) {
          throw new ConnectorHttpError('invalid_config', '业务成功判断需要同时配置 successPath 和非空 successValues。');
        }
      }
    }
  };
  checkOperation({ path: metadata.path ?? '/', method: metadata.method });
  if (metadata.operations !== undefined) {
    if (!isRecord(metadata.operations) || !Object.keys(metadata.operations).length) throw new ConnectorHttpError('invalid_config', 'operations 必须为非空能力配置对象。');
    for (const [name, operation] of Object.entries(metadata.operations)) {
      const capability = connector.capabilities.find((item) => item.name === name);
      if (!capability) throw new ConnectorHttpError('invalid_config', 'operations 包含未声明的能力。');
      checkOperation(operation);
      const op = operation as HttpOperation;
      if (capability.actionKind === 'read' && op.method && !['GET', 'POST'].includes(op.method)) {
        throw new ConnectorHttpError('invalid_config', '只读能力仅允许 GET 或 POST 查询。');
      }
      if (capability.actionKind !== 'read' && (!op.method || op.method === 'GET')) {
        throw new ConnectorHttpError('invalid_config', '写入、审批和通知能力必须显式配置 POST、PUT 或 PATCH。');
      }
      if (!op.method && op.bodyMapping !== undefined) throw new ConnectorHttpError('invalid_config', 'bodyMapping 需要显式配置请求方法。');
    }
  }
}
