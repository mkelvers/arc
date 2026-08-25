import { describe, expect, test } from 'bun:test';

import { decodeChunk } from './bootstrap';

describe('AllAnime client bootstrap', () => {
    test('evaluates the current fragment crypto config', () => {
        const chunk = [
            'function q(){const e=["build-7","AQIDBAUGBwg=","CQoLDA0ODxA=","ERITFBUWFxg=","GRobHB0eHyA="];return q=function(){return e},q()}',
            '(function(a,b){return a})(q,0);',
            'const build=r(0),n=Number(1),m=Number(2),parts=[r(1),r(2),r(3),r(4)],params={saltMul:250,saltAdd:54,fragMul:16,fragAdd:217,join:".",bootPrefix:"boot:",parts:["buildId","group","host","epoch","lane"],omitEmptyLane:false};',
            'function r(a,b){return q()[a]}',
            'const endpoint="/client-crypto/v1/bootstrap?buildId="; const partB="partB";',
        ].join('');

        const decoded = decodeChunk(chunk);

        expect(decoded?.buildId).toBe('build-7');
        expect(decoded?.bootPrefix).toBe('boot:');
        expect(decoded?.join).toBe('.');
        expect(decoded?.parts).toEqual(['buildId', 'group', 'host', 'epoch', 'lane']);
        expect(decoded?.mask.toString('hex')).toBe(
            '559ef2c71b0e34896a8a5f07ba9ca9468e576f561891e6d2e3d74e04658eb22f'
        );
    });

    test('handles semicolons inside the rotated string table initializer', () => {
        const chunk = [
            'function q(){const e=["build-8","AQIDBAUGBwg=","CQoLDA0ODxA=","ERITFBUWFxg=","GRobHB0eHyA="];return q=function(){return e},q()}',
            '(function(e,t){const r=e();for(;;){try{if(r.length===5)break; r.push(r.shift())}catch{r.push(r.shift())}}})(q,1);',
            'function r(a,b){return q()[a]}',
            'const build=r(0),n=Number(1),m=Number(2),parts=[r(1),r(2),r(3),r(4)],params={saltMul:250,saltAdd:54,fragMul:16,fragAdd:217,join:".",bootPrefix:"boot:",parts:["buildId","group","host","epoch","lane"],omitEmptyLane:false};',
            'function noop(){}',
            'const endpoint="/client-crypto/v1/bootstrap?buildId="; const partB="partB";',
        ].join('');

        expect(decodeChunk(chunk)?.buildId).toBe('build-8');
    });

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
