export const subtitleSizePixels = {
    small: 24,
    normal: 32,
    large: 40,
    'extra-large': 48,
} as const;

export type SubtitleSize = keyof typeof subtitleSizePixels;

export type SubtitleTextColor = 'white' | 'yellow' | 'black';
export type SubtitleEdgeStyle = 'outline' | 'none';
export type SubtitleBackground = 'black' | 'white' | 'none';

export const subtitleSizeOrder = [
    'small',
    'normal',
    'large',
    'extra-large',
] as const satisfies readonly SubtitleSize[];

export const subtitleTextColorValues = {
    white: '#ffffff',
    yellow: '#fff36b',
    black: '#111111',
} as const satisfies Record<SubtitleTextColor, string>;

export const subtitleBackgroundValues = {
    black: '0 0 0',
    white: '255 255 255',
    none: null,
} as const satisfies Record<SubtitleBackground, string | null>;

export const subtitleBackgroundOpacities = [0, 0.25, 0.5, 0.75, 1] as const;
export type SubtitleBackgroundOpacity = (typeof subtitleBackgroundOpacities)[number];
