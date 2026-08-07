import { describe, expect, test } from 'bun:test';

import { decodeChunk } from './bootstrap';

describe('AllAnime client bootstrap', () => {
  test('decodes the current rotated two-argument client format', () => {
    const chunk = [
      'const endpoint="/client-crypto/v1/bootstrap?buildId=";',
      'const responseKey="partB";',
      'function T(){const e=[',
      '"mDWzc=","nkCM5R","xmdTY=","aa-boo","web_cr",',
      '"un","defined","ywI+GG","WyMFA=","ww8pcw",',
      '"jGfeY=","8gjPB7"',
      '];return T=function(){return e},T()}',
      'function b(e,t){return e=e-10,T()[e]}',
      'function w(e,t){return b(t- -20)}',
      'const B=w(7,-10)+w(8,-9)!=="string"?"74":"";',
      'function unrelated(e){return e}',
      'const M=[',
      'w(0,-8)+w(0,-7),',
      'w(0,-6)+w(0,-5),',
      'w(0,-4)+w(0,-3),',
      'w(0,-2)+w(0,-1)',
      '];',
    ].join('');

    const decoded = decodeChunk(chunk);

    expect(decoded?.buildId).toBe('74');
    expect(decoded?.mask.toString('hex')).toBe(
      'e301466b2dd1a8c37ab3e0a391421496b825c93693468526653eebab47c0fa80'
    );
  });

  test('keeps support for the legacy inline client values', () => {
    const mask = 'ab'.repeat(32);
    const decoded = decodeChunk(`enabled?"${mask}":"",build=enabled?"legacy-17":""`);

    expect(decoded).toEqual({
      buildId: 'legacy-17',
      mask: Buffer.from(mask, 'hex'),
    });
  });
});
