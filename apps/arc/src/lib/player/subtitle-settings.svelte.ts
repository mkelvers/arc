import { m } from '$lib/i18n.svelte';
import * as preferences from './preferences';
import {
    subtitleBackgroundOrder,
    subtitleBackgroundOpacities,
    subtitleBackgroundValues,
    subtitleSizeOrder,
    subtitleSizePixels,
    subtitleEdgeStyleOrder,
    subtitleTextColorOrder,
    subtitleTextColorValues,
    type SubtitleBackground,
    type SubtitleBackgroundOpacity,
    type SubtitleEdgeStyle,
    type SubtitleSize,
    type SubtitleTextColor,
} from './subtitle-settings';

export class SubtitleSettings {
    size = $state<SubtitleSize>('normal');
    textColor = $state<SubtitleTextColor>('white');
    background = $state<SubtitleBackground>('black');
    backgroundOpacity = $state<SubtitleBackgroundOpacity>(0.75);
    edgeStyle = $state<SubtitleEdgeStyle>('outline');

    load() {
        const saved = preferences.load({}, []);
        this.size = saved.subtitleSize ?? this.size;
        this.textColor = saved.subtitleTextColor ?? this.textColor;
        this.background = saved.subtitleBackground ?? this.background;
        this.backgroundOpacity = saved.subtitleBackgroundOpacity ?? this.backgroundOpacity;
        this.edgeStyle = saved.subtitleEdgeStyle ?? this.edgeStyle;
    }

    setSize(value: SubtitleSize) {
        this.size = value;
        preferences.save('subtitle-size', value);
    }

    setTextColor(value: SubtitleTextColor) {
        this.textColor = value;
        preferences.save('subtitle-text-color', value);
    }

    setBackground(value: SubtitleBackground) {
        this.background = value;
        preferences.save('subtitle-background', value);
    }

    setBackgroundOpacity(value: SubtitleBackgroundOpacity) {
        this.backgroundOpacity = value;
        preferences.save('subtitle-background-opacity', value);
    }

    setEdgeStyle(value: SubtitleEdgeStyle) {
        this.edgeStyle = value;
        preferences.save('subtitle-edge-style', value);
    }

    reset() {
        this.size = 'normal';
        this.textColor = 'white';
        this.background = 'black';
        this.backgroundOpacity = 0.75;
        this.edgeStyle = 'outline';
        preferences.save('subtitle-size', this.size);
        preferences.save('subtitle-text-color', this.textColor);
        preferences.save('subtitle-background', this.background);
        preferences.save('subtitle-background-opacity', this.backgroundOpacity);
        preferences.save('subtitle-edge-style', this.edgeStyle);
    }
}

export type {
    SubtitleBackground,
    SubtitleBackgroundOpacity,
    SubtitleEdgeStyle,
    SubtitleSize,
    SubtitleTextColor,
} from './subtitle-settings';

export const subtitleSizes = {
    small: {
        label: m.player_small(),
        px: subtitleSizePixels.small,
    },
    normal: {
        label: m.player_normal(),
        px: subtitleSizePixels.normal,
    },
    large: {
        label: m.player_large(),
        px: subtitleSizePixels.large,
    },
    'extra-large': {
        label: m.player_extra_large(),
        px: subtitleSizePixels['extra-large'],
    },
} as const satisfies Record<SubtitleSize, { label: string; px: number }>;

export const subtitleTextColors = {
    white: {
        label: m.player_white(),
        value: subtitleTextColorValues.white,
    },
    yellow: {
        label: m.player_yellow(),
        value: subtitleTextColorValues.yellow,
    },
    black: {
        label: m.player_black(),
        value: subtitleTextColorValues.black,
    },
} as const satisfies Record<SubtitleTextColor, { label: string; value: string }>;

export const subtitleEdgeStyles = {
    outline: {
        label: m.player_outline(),
    },
    none: {
        label: m.player_none(),
    },
} as const satisfies Record<SubtitleEdgeStyle, { label: string }>;

export const subtitleBackgrounds = {
    black: {
        label: m.player_black(),
        value: subtitleBackgroundValues.black,
    },
    white: {
        label: m.player_white(),
        value: subtitleBackgroundValues.white,
    },
    none: {
        label: m.player_none(),
        value: subtitleBackgroundValues.none,
    },
} as const satisfies Record<SubtitleBackground, { label: string; value: string | null }>;

export { subtitleBackgroundOpacities, subtitleSizeOrder };
export { subtitleBackgroundOrder, subtitleEdgeStyleOrder, subtitleTextColorOrder };
