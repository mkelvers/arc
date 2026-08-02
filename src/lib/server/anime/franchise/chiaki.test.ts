import { describe, expect, test } from 'bun:test';

import { parseOrder } from './chiaki';

describe('Chiaki franchise order parsing', () => {
    test('parses ordered television, movie, and OVA releases', () => {
        const order = parseOrder(`
            <div id="wo_type_filter">
                <label><input type="checkbox" value="1"> TV</label>
                <label><input type="checkbox" value="2"> OVA</label>
                <label><input type="checkbox" value="3"> Movie</label>
            </div>
            <table id="wo_list">
                <tr data-id="16498" data-anilist-id="16498" data-type="1">
                    <td class="wo_avatar_big" style="background-image: url('/images/aot.jpg')"></td>
                    <td><span class="wo_title">Attack on Titan</span></td>
                </tr>
                <tr class="wo_row_secondary" data-id="18397" data-anilist-id="18397" data-type="2">
                    <td class="wo_avatar_big" style="background-image: url('/images/ova.jpg')"></td>
                    <td>
                        <span class="wo_title">Attack on Titan OVA</span>
                        <small class="uk-text-small">Shingeki no Kyojin OVA</small>
                    </td>
                </tr>
                <tr data-id="23775" data-anilist-id="20691" data-type="3">
                    <td class="wo_avatar_big" style="background-image: url('/images/movie.jpg')"></td>
                    <td><span class="wo_title">Attack on Titan Movie</span></td>
                </tr>
            </table>
        `);

        expect(order.types).toEqual([
            { id: '1', label: 'TV' },
            { id: '2', label: 'OVA' },
            { id: '3', label: 'Movie' },
        ]);
        expect(
            order.entries.map(({ malId, secondary, typeId }) => ({
                malId,
                secondary,
                typeId,
            })),
        ).toEqual([
            { malId: 16498, secondary: false, typeId: '1' },
            { malId: 18397, secondary: true, typeId: '2' },
            { malId: 23775, secondary: false, typeId: '3' },
        ]);
        expect(order.entries[0]?.image).toBe(
            'https://chiaki.site/images/aot.jpg',
        );
    });

    test('rejects an upstream page without watch-order markup', () => {
        expect(() => parseOrder('<main>Not found</main>')).toThrow(
            'Chiaki watch-order markup was not found',
        );
    });
});
