import { describe, expect, test } from 'bun:test';

import { clearance, createClearance, verifyClearance } from '$lib/server/clearance';

describe('human clearance', () => {
  const now = Date.UTC(2026, 7, 8);
  const secret = 'a sufficiently long test-only secret';

  test('accepts an untampered clearance before expiry', async () => {
    const value = await createClearance(secret, now);
    expect(await verifyClearance(value, secret, now + 1_000)).toBe(true);
  });

  test('rejects tampering and the wrong secret', async () => {
    const value = await createClearance(secret, now);
    expect(await verifyClearance(`${value}x`, secret, now)).toBe(false);
    expect(await verifyClearance(value, 'different secret', now)).toBe(false);
    expect(await verifyClearance(value, '', now)).toBe(false);
  });

  test('rejects expired and implausibly long clearances', async () => {
    const value = await createClearance(secret, now);
    expect(await verifyClearance(value, secret, now + clearance.maxAge * 1_000)).toBe(false);

    const future = await createClearance(secret, now + 60_000);
    expect(await verifyClearance(future, secret, now)).toBe(false);
  });
});
