import { connectorHttpHeaders, connectorHttpUrl, ConnectorHttpError, HttpOperation, isRecord, readField, validateHttpConfig } from '../../connectors/connector-http-config';
import { ConnectorRuntimeAdapterInput, ConnectorRuntimeAdapterResult } from './connector-adapter.types';

function mapFields(mapping: Record<string, string>, source: unknown, nested: boolean) {
  const output: Record<string, unknown> = {};
  for (const [target, path] of Object.entries(mapping)) {
    const value = readField(source, path);
    if (value === undefined) continue;
    const parts = nested ? target.split('.') : [target];
    let parent = output;
    for (const part of parts.slice(0, -1)) {
      parent[part] ??= {};
      parent = parent[part] as Record<string, unknown>;
    }
    parent[parts[parts.length - 1]] = value;
  }
  return output;
}

export async function executeConnectorHttp(input: ConnectorRuntimeAdapterInput): Promise<ConnectorRuntimeAdapterResult> {
  const { connector, declaration, runtimeInput } = input;
  validateHttpConfig(connector);
  const metadata = connector.metadata;
  const capabilityName = declaration.execution.capabilityName;
  const operations = metadata.operations as Record<string, HttpOperation> | undefined;
  const configured = operations && Object.hasOwn(operations, capabilityName) ? operations[capabilityName] : undefined;
  const legacyTicketing = connector.type === 'ticketing' && !operations;
  if ((operations && !configured) || (declaration.governance.actionKind !== 'read' && !configured)) {
    throw new ConnectorHttpError('operation_not_configured', '该能力尚未配置 HTTP 接口，不能执行真实调用。');
  }
  const operation: HttpOperation = configured ?? {
    path: String(legacyTicketing ? metadata.searchPath ?? '/api/tickets/search' : metadata.path ?? '/api/query'),
    method: legacyTicketing ? 'GET' : (metadata.method as HttpOperation['method']) ?? 'GET',
  };
  const method = operation.method ?? 'GET';
  if (declaration.governance.actionKind === 'read' && !['GET', 'POST'].includes(method)) {
    throw new ConnectorHttpError('invalid_config', '只读能力不能执行 PUT 或 PATCH。');
  }
  const filters = runtimeInput.filters ?? {};
  // 身份字段来自后端认证上下文，模型传入的同名字段不会覆盖它。
  const source = { filters, payload: runtimeInput.payload ?? {}, context: input.ctx };
  const query = operation.queryMapping ? mapFields(operation.queryMapping, source, false)
    : method === 'GET' ? legacyTicketing
      ? {
        parkId: filters.parkId, enterpriseId: filters.enterpriseId, ticketId: filters.ticketId,
        category: filters.category, status: filters.status, keyword: filters.keyword,
        page: filters.page ?? 1, pageSize: filters.pageSize ?? 20,
      } : filters : {};
  const url = connectorHttpUrl(connector.baseUrl, operation.path);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.delete(key);
    for (const item of Array.isArray(value) ? value : [value]) {
      if (!['string', 'number', 'boolean'].includes(typeof item)) throw new ConnectorHttpError('invalid_input', '查询参数只支持基本类型或基本类型数组。');
      url.searchParams.append(key, String(item));
    }
  }
  const headers = connectorHttpHeaders(connector);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(metadata.timeoutMs ?? 10_000));
  try {
    const init: RequestInit = { method, headers, signal: controller.signal, redirect: 'error' };
    if (method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(operation.bodyMapping ? mapFields(operation.bodyMapping, source, true)
        : { businessGoal: runtimeInput.businessGoal, filters, payload: runtimeInput.payload ?? {} });
    }
    const response = await fetch(url, init);
    if (!response.ok) {
      await response.body?.cancel();
      throw new ConnectorHttpError('upstream_http_error', `业务系统请求失败（HTTP ${response.status}）。`);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ConnectorHttpError('invalid_response', '业务系统未返回有效 JSON。');
    }
    const rule = operation.response;
    if (rule?.successPath && !rule.successValues?.some((value) => value === readField(body, rule.successPath!))) {
      throw new ConnectorHttpError('upstream_business_error', '业务系统返回失败状态，请通过业务系统日志核查。');
    }
    if (isRecord(body) && body.success === false) throw new ConnectorHttpError('upstream_business_error', '业务系统返回失败状态。');
    const rawRecords = rule?.recordsPath ? readField(body, rule.recordsPath)
      : Array.isArray(body) ? body : isRecord(body) ? body.items ?? body.records ?? body.data : undefined;
    const records = isRecord(rawRecords) && rule?.recordsPath ? [rawRecords] : rawRecords;
    if (!Array.isArray(records) || !records.every(isRecord)) {
      throw new ConnectorHttpError('invalid_response', '业务系统返回格式不符合记录契约，请检查 recordsPath 配置。');
    }
    const total = rule?.totalPath ? readField(body, rule.totalPath) : isRecord(body) ? body.total : undefined;
    if ((rule?.totalPath || total !== undefined) && (typeof total !== 'number' || !Number.isInteger(total) || total < 0)) {
      throw new ConnectorHttpError('invalid_response', '业务系统返回的 total 必须为非负整数。');
    }
    return {
      mode: 'live', adapter: connector.type === 'ticketing' ? 'ticketing-http' : 'generic-http',
      targetSystem: declaration.execution.targetSystem, connectorKey: declaration.execution.connectorKey,
      capabilityName, summary: `已从 ${connector.systemName} 返回 ${records.length} 条记录。`,
      businessGoal: runtimeInput.businessGoal ?? '未提供业务目标', filters,
      payload: runtimeInput.payload ?? {}, records, total: (total as number | undefined) ?? records.length,
      nextActions: [], generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (controller.signal.aborted) throw new ConnectorHttpError('upstream_timeout', '业务系统请求超时；写入操作请先核查业务系统结果，不要直接重试。');
    if (error instanceof ConnectorHttpError) throw error;
    // 不回传上游原始异常，避免地址、凭证和响应正文进入对话或审计。
    throw new ConnectorHttpError('upstream_unavailable', '业务系统连接失败，请检查网络、证书和重定向配置。');
  } finally {
    clearTimeout(timer);
  }
}
