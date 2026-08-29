import { m } from '$lib/i18n.svelte';
import {
    subtitleBackgroundOpacities,
    subtitleBackgroundValues,
    subtitleSizeOrder,
    subtitleSizePixels,
    subtitleTextColorValues,
    type SubtitleBackground,
    type SubtitleEdgeStyle,
    type SubtitleSize,
    type SubtitleTextColor,
} from './subtitle-settings';

export type {
    SubtitleBackground,
    SubtitleBackgroundOpacity,
    SubtitleEdgeStyle,
    SubtitleSize,
    SubtitleTextColor,
} from './subtitle-settings';

export const subtitleSizes = {
    small: { label: m.player_small(), px: subtitleSizePixels.small },
    normal: { label: m.player_normal(), px: subtitleSizePixels.normal },
    large: { label: m.player_large(), px: subtitleSizePixels.large },
    'extra-large': { label: m.player_extra_large(), px: subtitleSizePixels['extra-large'] },
} as const satisfies Record<SubtitleSize, { label: string; px: number }>;

export const subtitleTextColors = {
    white: { label: m.player_white(), value: subtitleTextColorValues.white },
    yellow: { label: m.player_yellow(), value: subtitleTextColorValues.yellow },
    black: { label: m.player_black(), value: subtitleTextColorValues.black },
} as const satisfies Record<SubtitleTextColor, { label: string; value: string }>;

export const subtitleEdgeStyles = {
    outline: { label: m.player_outline() },
    none: { label: m.player_none() },
} as const satisfies Record<SubtitleEdgeStyle, { label: string }>;

export const subtitleBackgrounds = {
    black: { label: m.player_black(), value: subtitleBackgroundValues.black },
    white: { label: m.player_white(), value: subtitleBackgroundValues.white },
    none: { label: m.player_none(), value: subtitleBackgroundValues.none },
} as const satisfies Record<SubtitleBackground, { label: string; value: string | null }>;

export { subtitleBackgroundOpacities, subtitleSizeOrder };
