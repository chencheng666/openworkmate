import { describe, expect, it } from 'vitest';
import {
  buildKnowledgeSearchToolDeclaration,
  KNOWLEDGE_SEARCH_TOOL_NAME,
} from '../../backend/src/modules/knowledge/knowledge-tool-declaration';

describe('企业知识库 Skill 工具声明', () => {
  it('声明为受权限控制的只读、可审计工具', () => {
    const declaration = buildKnowledgeSearchToolDeclaration();

    expect(declaration.name).toBe(KNOWLEDGE_SEARCH_TOOL_NAME);
    expect(declaration.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(declaration.inputSchema.required).toEqual(['query']);
    expect(declaration.governance.requiredScopes).toContain('knowledge:read');
    expect(declaration.governance.permissionStrategy).toBe('request-context');
    expect(declaration.governance.humanConfirmationRequired).toBe(false);
    expect(declaration.execution.endpoint).toBe('/api/knowledge/runtime/execute');
  });
});
