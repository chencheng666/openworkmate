export const KNOWLEDGE_OBJECT_STORAGE = Symbol('KNOWLEDGE_OBJECT_STORAGE');

export type PutKnowledgeObjectInput = {
  tenantId: string;
  filename: string;
  data: Buffer;
};

export interface KnowledgeObjectStorage {
  put(input: PutKnowledgeObjectInput): Promise<{ key: string; size: number }>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}
