import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalKnowledgeObjectStorage } from '../../backend/src/modules/knowledge/storage/local-knowledge-object-storage';

describe('LocalKnowledgeObjectStorage', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it('按租户保存、读取并删除知识原文件', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workmate-knowledge-storage-'));
    temporaryDirectories.push(root);
    const storage = new LocalKnowledgeObjectStorage(new ConfigService({ KNOWLEDGE_STORAGE_DIR: root }));
    const source = Buffer.from('企业园区运营制度');

    const stored = await storage.put({ tenantId: 'workmate', filename: '运营制度.md', data: source });

    expect(stored.key).toMatch(/^workmate\/\d{4}-\d{2}\/[a-f0-9-]+\.md$/);
    expect(await storage.get(stored.key)).toEqual(source);
    await storage.delete(stored.key);
    await expect(storage.get(stored.key)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('拒绝读取存储根目录之外的路径', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workmate-knowledge-storage-'));
    temporaryDirectories.push(root);
    const storage = new LocalKnowledgeObjectStorage(new ConfigService({ KNOWLEDGE_STORAGE_DIR: root }));

    await expect(storage.get('../outside.txt')).rejects.toThrow('Invalid knowledge object key');
  });
});
