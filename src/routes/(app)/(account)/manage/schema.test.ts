import { describe, expect, test } from 'bun:test';

import { accountSchema } from './schema';

describe('accountSchema', () => {
  test('accepts and trims an account name', () => {
    const result = accountSchema.parse({
      accountName: '  Isekai nights  ',
    });

    expect(result.accountName).toBe('Isekai nights');
  });

  test('rejects an empty account name', () => {
    expect(() =>
      accountSchema.parse({
        accountName: '  ',
      })
    ).toThrow();
  });
});
