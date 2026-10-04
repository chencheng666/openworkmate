import { describe, expect, it } from 'vitest';
import { validateSkillOutput } from '../../backend/src/modules/skill-factory/skill-output-validator';

describe('Skill 输出契约校验', () => {
  it('校验对象必填字段、类型和数组项', () => {
    const errors = validateSkillOutput({
      type: 'object',
      required: ['records'],
      properties: {
        records: { type: 'array', items: { type: 'object' } },
      },
    }, { records: [{ ticketId: 'TK-1' }] });
    expect(errors).toEqual([]);
  });

  it('返回可定位的字段错误', () => {
    const errors = validateSkillOutput({
      type: 'object',
      required: ['total'],
      properties: { total: { type: 'number' } },
    }, { total: '1' });
    expect(errors).toEqual(['$.total 类型应为 number']);
  });
});
