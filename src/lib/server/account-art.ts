import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Avatar, Style } from '@dicebear/core';

const styleNames = [
  'adventurer',
  'adventurer-neutral',
  'avataaars',
  'avataaars-neutral',
  'big-ears',
  'big-ears-neutral',
  'big-smile',
  'blobs',
  'bottts',
  'bottts-neutral',
  'clay',
  'constellation',
  'critters',
  'croodles',
  'croodles-neutral',
  'disco',
  'dylan',
  'fun-emoji',
  'glass',
  'glyphs',
  'icons',
  'identicon',
  'initial-face',
  'initials',
  'landscape',
  'loops',
  'lorelei',
  'lorelei-neutral',
  'micah',
  'miniavs',
  'moods',
  'notionists',
  'notionists-neutral',
  'open-peeps',
  'personas',
  'pixel-art',
  'pixel-art-neutral',
  'pixelbot',
  'planets',
  'rings',
  'shape-grid',
  'shapes',
  'sprouts',
  'squircles',
  'stripes',
  'thumbs',
  'toon-head',
  'triangles',
  'waves',
  'weave',
] as const;

const styles = new Map<string, Style>();
const resolvePackage = createRequire(import.meta.url).resolve;

export async function accountArtStyle(userId: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
  const index = new DataView(digest).getUint32(0) % styleNames.length;
  return styleNames[index];
}

export async function renderAccountArt(userId: string) {
  const styleName = await accountArtStyle(userId);
  let style = styles.get(styleName);

  if (!style) {
    const path = resolvePackage(`@dicebear/styles/${styleName}.json`);
    const definition: unknown = JSON.parse(await readFile(path, 'utf8'));
    style = new Style(definition);
    styles.set(styleName, style);
  }

  return new Avatar(style, { seed: userId, size: 512 }).toString();
}
