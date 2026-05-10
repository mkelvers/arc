/**
 * Parse a space-separated class list string into an array, filtering empty entries.
 */
export const parseClassList = (value: string | null): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(' ')
    .map((entry: string): string => entry.trim())
    .filter((entry: string): boolean => entry.length > 0);
};
