type Schema = Record<string, unknown>;

/** 校验 Skill manifest 中声明的轻量 JSON Schema 子集，避免引入完整 JSON Schema 运行时。 */
export function validateSkillOutput(schema: Schema | undefined, value: unknown, path = '$'): string[] {
  if (!schema) return [];
  const errors: string[] = [];
  const type = schema.type;
  if (typeof type === 'string' && !matchesType(type, value)) {
    return [`${path} 类型应为 ${type}`];
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => Object.is(item, value))) {
    errors.push(`${path} 不在允许枚举值中`);
  }
  if (type === 'object' && isRecord(value)) {
    const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === 'string') : [];
    for (const key of required) if (!(key in value)) errors.push(`${path}.${key} 为必填字段`);
    const properties = isRecord(schema.properties) ? schema.properties : {};
    for (const [key, childSchema] of Object.entries(properties)) {
      if (key in value && isRecord(childSchema)) errors.push(...validateSkillOutput(childSchema, value[key], `${path}.${key}`));
    }
  }
  if (type === 'array' && Array.isArray(value) && isRecord(schema.items)) {
    value.forEach((item, index) => errors.push(...validateSkillOutput(schema.items as Schema, item, `${path}[${index}]`)));
  }
  return errors;
}

function matchesType(type: string, value: unknown) {
  if (type === 'object') return isRecord(value);
  if (type === 'array') return Array.isArray(value);
  if (type === 'string') return typeof value === 'string';
  if (type === 'number' || type === 'integer') return typeof value === 'number' && Number.isFinite(value) && (type !== 'integer' || Number.isInteger(value));
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'null') return value === null;
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
