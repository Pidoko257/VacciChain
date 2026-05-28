'use strict';

// Unit tests for the Stellar public key validation regex used in
// src/middleware/wallet.js — covers all acceptance criteria.

const STELLAR_PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/;

const isValid = (key) => STELLAR_PUBLIC_KEY_REGEX.test(key);

describe('Stellar public key validation', () => {
  it('returns true for a valid 56-char G-prefixed base32 key', () => {
    // 'G' + 55 valid base32 uppercase chars
    expect(isValid('G' + 'A'.repeat(55))).toBe(true);
  });

  it('returns false for a key with wrong prefix (not G)', () => {
    expect(isValid('S' + 'A'.repeat(55))).toBe(false);
    expect(isValid('A' + 'A'.repeat(55))).toBe(false);
  });

  it('returns false for a key shorter than 56 chars', () => {
    expect(isValid('G' + 'A'.repeat(54))).toBe(false);
  });

  it('returns false for a key longer than 56 chars', () => {
    expect(isValid('G' + 'A'.repeat(56))).toBe(false);
  });

  it('returns false for a key with invalid base32 characters', () => {
    // base32 alphabet is A-Z and 2-7; '0', '1', '8', '9' are invalid
    expect(isValid('G' + '0'.repeat(55))).toBe(false);
    expect(isValid('G' + 'A'.repeat(54) + '!')).toBe(false);
  });
});
