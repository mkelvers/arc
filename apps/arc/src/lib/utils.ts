import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function record(value: unknown): Record<string, unknown> | null {
    return isRecord(value) ? value : null;
}

export function positiveInteger(value: unknown) {
    const number =
        typeof value === 'number'
            ? value
            : typeof value === 'string' && /^\d+$/.test(value.trim())
              ? Number(value)
              : Number.NaN;

    return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

export function nonEmptyText(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
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
