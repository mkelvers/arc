interface Box {
    type: string;
    contentStart: number;
    end: number;
}

function boxType(data: Uint8Array, offset: number) {
    return String.fromCharCode(
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    );
}

function boxes(data: Uint8Array, start: number, end: number) {
    const view = new DataView(
        data.buffer,
        data.byteOffset,
        data.byteLength,
    );
    const result: Box[] = [];
    let offset = start;

    while (offset + 8 <= end) {
        let size = view.getUint32(offset);
        const type = boxType(data, offset + 4);
        let headerSize = 8;

        if (size === 1) {
            if (offset + 16 > end) {
                break;
            }
            const extendedSize = view.getBigUint64(offset + 8);
            if (extendedSize > BigInt(Number.MAX_SAFE_INTEGER)) {
                break;
            }
            size = Number(extendedSize);
            headerSize = 16;
        } else if (size === 0) {
            size = end - offset;
        }

        const boxEnd = offset + size;
        if (size < headerSize || boxEnd > end) {
            break;
        }

        result.push({
            type,
            contentStart: offset + headerSize,
            end: boxEnd,
        });
        offset = boxEnd;
    }

    return result;
}

function child(data: Uint8Array, parent: Box, type: string) {
    return boxes(data, parent.contentStart, parent.end).find(
        (box) => box.type === type,
    );
}

function movieTimescale(data: Uint8Array, moov: Box) {
    const mvhd = child(data, moov, 'mvhd');
    if (!mvhd) {
        return null;
    }

    const view = new DataView(
        data.buffer,
        data.byteOffset,
        data.byteLength,
    );
    const version = view.getUint8(mvhd.contentStart);
    const offset = mvhd.contentStart + (version === 1 ? 20 : 12);
    if (offset + 4 > mvhd.end) {
        return null;
    }

    const timescale = view.getUint32(offset);
    return timescale > 0 ? timescale : null;
}

function trackType(data: Uint8Array, trak: Box) {
    const mdia = child(data, trak, 'mdia');
    const hdlr = mdia && child(data, mdia, 'hdlr');
    if (!hdlr || hdlr.contentStart + 12 > hdlr.end) {
        return null;
    }

    return boxType(data, hdlr.contentStart + 8);
}

function trackStart(data: Uint8Array, trak: Box, timescale: number) {
    const edts = child(data, trak, 'edts');
    const elst = edts && child(data, edts, 'elst');
    if (!elst) {
        return 0;
    }

    const view = new DataView(
        data.buffer,
        data.byteOffset,
        data.byteLength,
    );
    const version = view.getUint8(elst.contentStart);
    const entryCountOffset = elst.contentStart + 4;
    if (entryCountOffset + 4 > elst.end) {
        return 0;
    }

    const entryCount = view.getUint32(entryCountOffset);
    const entrySize = version === 1 ? 20 : 12;
    let offset = entryCountOffset + 4;
    let emptyDuration = 0;

    for (let index = 0; index < entryCount; index++) {
        if (offset + entrySize > elst.end) {
            return 0;
        }

        const segmentDuration =
            version === 1
                ? Number(view.getBigUint64(offset))
                : view.getUint32(offset);
        const mediaTime =
            version === 1
                ? view.getBigInt64(offset + 8)
                : BigInt(view.getInt32(offset + 4));

        if (mediaTime !== -1n) {
            break;
        }
        emptyDuration += segmentDuration;
        offset += entrySize;
    }

    return emptyDuration / timescale;
}

export function audioDelayFromMp4(data: Uint8Array) {
    const moov = boxes(data, 0, data.byteLength).find(
        (box) => box.type === 'moov',
    );
    if (!moov) {
        return 0;
    }

    const timescale = movieTimescale(data, moov);
    if (!timescale) {
        return 0;
    }

    const starts = boxes(data, moov.contentStart, moov.end).reduce(
        (tracks, box) => {
            if (box.type !== 'trak') {
                return tracks;
            }

            const type = trackType(data, box);
            if (type === 'vide' || type === 'soun') {
                tracks[type].push(trackStart(data, box, timescale));
            }

            return tracks;
        },
        { vide: [] as number[], soun: [] as number[] },
    );
    if (!starts.vide.length || !starts.soun.length) {
        return 0;
    }

    const delay = Math.min(...starts.soun) - Math.min(...starts.vide);
    return delay > 0.02 && delay <= 10 ? delay : 0;
}
