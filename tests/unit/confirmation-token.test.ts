import { describe, expect, it } from 'vitest';
import { createConfirmationToken, hashConfirmationToken } from '../../backend/src/modules/connector-runtime/confirmation-token';

describe('connector confirmation token', () => {
  it('generates non-empty one-time token values', () => {
    const first = createConfirmationToken();
    const second = createConfirmationToken();

    expect(first).toMatch(/^cnf_/);
    expect(second).toMatch(/^cnf_/);
    expect(first).not.toBe(second);
  });

  it('hashes the same token consistently without exposing the raw token', () => {
    const token = 'cnf_demo_token';
    const hash = hashConfirmationToken(token);

    expect(hash).toBe(hashConfirmationToken(token));
    expect(hash).not.toContain(token);
    expect(hash).toHaveLength(64);
  });
});
