import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { z } from 'zod';

const jsonValue = z.json();
const jsonObject = z.record(z.string(), jsonValue);
const positiveIntegerInput = z.union([z.number(), z.string().regex(/^\d+$/)]);
const nonEmptyTextInput = z.string().trim().min(1);

export type JsonObject = z.infer<typeof jsonObject>;
export type JsonValue = z.infer<typeof jsonValue>;
export const JsonValueSchema = jsonValue;
type UtilityInput = JsonValue | undefined;

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function isRecord(value: UtilityInput): value is JsonObject {
    return jsonObject.safeParse(value).success;
}

export function record(value: UtilityInput): JsonObject | null {
    return isRecord(value) ? value : null;
}

export function positiveInteger(value: UtilityInput) {
    const parsed = positiveIntegerInput.safeParse(value);
    const number = parsed.success ? Number(parsed.data) : Number.NaN;

    return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

export function nonEmptyText(value: UtilityInput) {
    const parsed = nonEmptyTextInput.safeParse(value);
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
