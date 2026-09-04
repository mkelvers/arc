import { describe, expect, test } from 'bun:test';

import { present } from '@arc/core/utils/array';

describe('shared array utilities', () => {
    test('removes null values from nullable arrays', () => {
        expect(present(['anime', null, 'catalog'])).toEqual(['anime', 'catalog']);
        expect(present(null)).toEqual([]);
    });
});
