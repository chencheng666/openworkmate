import assert from 'node:assert/strict';

const baseUrl = process.env.WORKMATE_BACKEND_URL || 'http://127.0.0.1:18790/api';
const marker = `LDKB-${Date.now()}`;

const adminHeaders = {
  'x-tenant-id': 'workmate',
  'x-user-id': 'knowledge-smoke-admin',
  'x-user-name': encodeURIComponent('知识库联调管理员'),
  'x-org-id': 'headquarters',
  'x-role-ids': 'platform-admin,business-owner',
  'x-park-ids': 'park-smoke-001',
};

const parkReaderHeaders = {
  ...adminHeaders,
  'x-user-id': 'knowledge-smoke-reader',
  'x-user-name': encodeURIComponent('园区知识读者'),
  'x-role-ids': 'park-operator',
};

const unrelatedReaderHeaders = {
  ...parkReaderHeaders,
  'x-user-id': 'knowledge-smoke-outsider',
  'x-park-ids': 'park-other-999',
};

async function request(path, init = {}) {
  const contentHeaders = init.body === undefined ? {} : { 'content-type': 'application/json' };
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...adminHeaders,
      ...contentHeaders,
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = Array.isArray(payload?.message) ? payload.message.join('；') : payload?.message;
    throw new Error(`${init.method || 'GET'} ${path} 失败（${response.status}）：${detail || '未知错误'}`);
  }
  return payload;
}

function documentId(document) {
  return document?._id || document?.id || '';
}

async function waitUntilReady(id, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const detail = await request(`/knowledge/documents/${id}`);
    if (detail.status === 'ready') return detail;
    if (detail.status === 'failed') {
      throw new Error(`知识索引失败：${detail.ingestionRuns?.[0]?.errorMessage || '未知原因'}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`等待知识索引超时：${id}`);
}

async function search(query, headers) {
  return request('/knowledge/search', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, categories: ['联调验证'], topK: 8 }),
  });
}

let createdId = '';
let deleted = false;

try {
  const health = await request('/health');
  assert.equal(health.status, 'ok');
  assert.equal(health.database.readyState, 1);

  const sourceText = [
    '# 企业知识库全链路联调规范',
    '',
    `${marker} 是本次联调的唯一业务标识。`,
    '园区报修超过 24 小时后，必须升级给园区运营负责人并通知客服中心。',
    '本规则仅允许 park-smoke-001 园区成员访问。',
  ].join('\n');

  const created = await request('/knowledge/documents/import', {
    method: 'POST',
    body: JSON.stringify({
      filename: `${marker}.md`,
      mimeType: 'text/markdown',
      fileBase64: Buffer.from(sourceText, 'utf8').toString('base64'),
      title: `${marker} 园区服务规范`,
      category: '联调验证',
      ownerDepartment: '平台研发与测试组',
      summary: '知识库真实 API 全生命周期验证文档。',
      visibility: { scopeType: 'park', parkIds: ['park-smoke-001'] },
    }),
  });
  createdId = documentId(created);
  assert.ok(createdId, '创建结果必须返回文档 ID');
  assert.equal(created.status, 'indexing');

  const ready = await waitUntilReady(createdId);
  assert.ok(ready.chunksCount > 0, '索引完成后必须产生知识片段');
  assert.match(ready.content, new RegExp(marker));

  const authorizedSearch = await search(`${marker} 报修超过多久升级`, parkReaderHeaders);
  assert.ok(
    authorizedSearch.citations.some((citation) => citation.documentId === createdId),
    '授权园区员工必须能检索到测试知识',
  );

  const unauthorizedSearch = await search(`${marker} 报修超过多久升级`, unrelatedReaderHeaders);
  assert.ok(
    unauthorizedSearch.citations.every((citation) => citation.documentId !== createdId),
    '非授权园区员工不能检索到测试知识',
  );

  const runtimeResult = await request('/knowledge/runtime/execute', {
    method: 'POST',
    headers: parkReaderHeaders,
    body: JSON.stringify({
      toolName: 'workmate_knowledge_search',
      requestId: `smoke-${marker}`,
      input: { query: `${marker} 的升级规则是什么`, categories: ['联调验证'], topK: 6 },
    }),
  });
  assert.equal(runtimeResult.status, 'executed');
  assert.ok(runtimeResult.result.citations.some((citation) => citation.documentId === createdId));
  assert.equal(runtimeResult.audit.recorded, true);

  const updated = await request(`/knowledge/documents/${createdId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: `${marker} 园区服务规范（已更新）`,
      summary: '已验证元数据更新与正文重新索引。',
      content: `${sourceText}\n\n更新补充：升级后 30 分钟内必须完成首次反馈。`,
      visibility: { scopeType: 'park', parkIds: ['park-smoke-001'] },
    }),
  });
  assert.equal(updated.status, 'indexing');
  const updatedReady = await waitUntilReady(createdId);
  assert.match(updatedReady.content, /30 分钟内必须完成首次反馈/);

  await request(`/knowledge/documents/${createdId}/archive`, { method: 'POST' });
  const archivedSearch = await search(`${marker} 首次反馈`, parkReaderHeaders);
  assert.ok(archivedSearch.citations.every((citation) => citation.documentId !== createdId));

  const restored = await request(`/knowledge/documents/${createdId}/restore`, { method: 'POST' });
  assert.equal(restored.status, 'ready');
  const restoredSearch = await search(`${marker} 首次反馈`, parkReaderHeaders);
  assert.ok(restoredSearch.citations.some((citation) => citation.documentId === createdId));

  await request(`/knowledge/documents/${createdId}`, { method: 'DELETE' });
  deleted = true;

  const auditEvents = await request(`/audit/events?resourceType=knowledge_document&limit=200`);
  const documentActions = auditEvents
    .filter((event) => event.resourceId === createdId)
    .map((event) => event.action);
  for (const action of [
    'knowledge.document.create',
    'knowledge.document.import.queued',
    'knowledge.ingestion.completed',
    'knowledge.document.update',
    'knowledge.document.archive',
    'knowledge.document.restore',
    'knowledge.document.delete',
  ]) {
    assert.ok(documentActions.includes(action), `审计记录缺少 ${action}`);
  }

  console.log(JSON.stringify({
    status: 'passed',
    marker,
    documentId: createdId,
    chunks: updatedReady.chunksCount,
    authorizedCitations: authorizedSearch.citations.length,
    unauthorizedCitations: unauthorizedSearch.citations.length,
    auditActions: documentActions.length,
  }, null, 2));
} finally {
  if (createdId && !deleted) {
    await request(`/knowledge/documents/${createdId}`, { method: 'DELETE' }).catch(() => undefined);
  }
}
