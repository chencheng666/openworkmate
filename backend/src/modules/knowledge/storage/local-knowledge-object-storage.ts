import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { KnowledgeObjectStorage, PutKnowledgeObjectInput } from './knowledge-object-storage';

@Injectable()
export class LocalKnowledgeObjectStorage implements KnowledgeObjectStorage {
  private readonly rootDirectory: string;

  constructor(config: ConfigService) {
    this.rootDirectory = resolve(
      config.get<string>('KNOWLEDGE_STORAGE_DIR') || resolve(process.cwd(), 'data', 'knowledge-objects'),
    );
  }

  async put(input: PutKnowledgeObjectInput) {
    const tenant = input.tenantId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const date = new Date().toISOString().slice(0, 7);
    const extension = extname(input.filename).toLowerCase().replace(/[^a-z0-9.]/g, '');
    const key = `${tenant}/${date}/${randomUUID()}${extension}`;
    const filePath = this.resolveKey(key);
    await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
    await writeFile(filePath, input.data, { flag: 'wx', mode: 0o600 });
    return { key, size: input.data.length };
  }

  async get(key: string) {
    return readFile(this.resolveKey(key));
  }

  async delete(key: string) {
    try {
      await unlink(this.resolveKey(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private resolveKey(key: string) {
    const target = resolve(this.rootDirectory, key);
    const pathFromRoot = relative(this.rootDirectory, target);
    if (!pathFromRoot || pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === '..' || isAbsolute(pathFromRoot)) {
      throw new Error('Invalid knowledge object key');
    }
    return target;
  }
}
