import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { z } from 'zod';

export type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue };

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function record(value: JsonValue | undefined): Record<string, JsonValue> | null {
    const parsed = z.record(z.string(), z.json()).safeParse(value);
    return parsed.success ? parsed.data : null;
}

export function positiveInteger(value: JsonValue | undefined) {
    const parsed = z.union([z.number(), z.string().regex(/^\d+$/)]).safeParse(value);
    const number = parsed.success ? Number(parsed.data) : Number.NaN;

    return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

export function text(value: JsonValue | undefined) {
    const parsed = z.string().trim().min(1).safeParse(value);
    return parsed.success ? parsed.data : undefined;
}

export function batches<T>(values: readonly T[], size: number) {
    if (!Number.isSafeInteger(size) || size <= 0) {
        throw new RangeError('Batch size must be a positive integer');
    }

    const result: T[][] = [];
    for (let index = 0; index < values.length; index += size) {
        result.push(values.slice(index, index + size));
    }

    return result;
}

export function formatDuration(minutes: number | null | undefined) {
    if (!minutes || minutes <= 0) {
        return '';
    }

    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;

    if (!hours) {
        return `${remainder}m`;
    }

    return remainder ? `${hours}h, ${remainder}m` : `${hours}h`;
}
