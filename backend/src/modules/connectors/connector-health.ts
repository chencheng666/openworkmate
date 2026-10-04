import { ConnectorDefinition, ConnectorHealthStatus } from './connector.schema';
import { connectorHttpHeaders, connectorHttpUrl, ConnectorHttpError } from './connector-http-config';

export async function probeConnector(connector: Pick<ConnectorDefinition, 'baseUrl' | 'authMode' | 'metadata' | 'systemName'>) {
  if (connector.metadata.transport !== 'http') {
    return { status: 'degraded' as ConnectorHealthStatus, message: '当前为演示连接器，尚未验证真实业务系统连通性。' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    // 只探测显式健康地址，避免意外请求具有业务副作用的接口。
    const path = typeof connector.metadata.healthPath === 'string' ? connector.metadata.healthPath : '/health';
    const url = connectorHttpUrl(connector.baseUrl, path);
    const headers = connectorHttpHeaders(connector);
    const response = await fetch(url, { method: 'GET', headers, signal: controller.signal, redirect: 'error' });
    await response.body?.cancel();
    return response.ok
      ? { status: 'healthy' as ConnectorHealthStatus, message: connector.systemName + ' HTTP 探测成功。' }
      : { status: 'degraded' as ConnectorHealthStatus, message: connector.systemName + ' 返回 HTTP ' + response.status + '。' };
  } catch (error) {
    if (error instanceof ConnectorHttpError) return { status: 'degraded' as ConnectorHealthStatus, message: error.message };
    return { status: 'down' as ConnectorHealthStatus, message: connector.systemName + ' HTTP 探测失败，请检查网络、超时、证书和重定向配置。' };
  } finally {
    clearTimeout(timer);
  }
}
