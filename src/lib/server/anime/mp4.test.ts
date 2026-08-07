import { describe, expect, test } from 'bun:test';

import { audioDelayFromMp4 } from './mp4';

const text = (value: string) =>
  Uint8Array.from([...value].map((character) => character.charCodeAt(0)));

function uint32(value: number) {
  const data = new Uint8Array(4);
  new DataView(data.buffer).setUint32(0, value);
  return data;
}

function int32(value: number) {
  const data = new Uint8Array(4);
  new DataView(data.buffer).setInt32(0, value);
  return data;
}

function join(...parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;

  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

function box(type: string, ...payload: Uint8Array[]) {
  const content = join(...payload);
  return join(uint32(content.length + 8), text(type), content);
}

function edit(duration: number, mediaTime: number) {
  return join(uint32(duration), int32(mediaTime), uint32(0x0001_0000));
}

function track(type: 'vide' | 'soun', ...edits: Uint8Array[]) {
  return box(
    'trak',
    box('edts', box('elst', uint32(0), uint32(edits.length), ...edits)),
    box('mdia', box('hdlr', uint32(0), uint32(0), text(type)))
  );
}

function media(audioStart: number) {
  return box(
    'moov',
    box('mvhd', uint32(0), uint32(0), uint32(0), uint32(1_000)),
    track('vide', edit(10_000, 0)),
    track('soun', ...(audioStart ? [edit(audioStart, -1)] : []), edit(10_000 - audioStart, 0))
  );
}

describe('audioDelayFromMp4', () => {
  test('reads a leading empty audio edit as a playback delay', () => {
    expect(audioDelayFromMp4(media(977))).toBeCloseTo(0.977);
  });

  test('does not delay tracks that start together', () => {
    expect(audioDelayFromMp4(media(0))).toBe(0);
  });
});
