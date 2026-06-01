export interface ParsedClockTime {
  hour: number;
  minute: number;
}

export interface LocalClockTime {
  dayIndex: number;
  hour: number;
  minute: number;
  totalMinutes: number;
}

const jstOffsetMinutes = 9 * 60;

const weekdayIndexes: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

export const normalizeWeekday = (value: string | null): number | null => {
  if (!value) return null;
  const key = value.trim().toLowerCase().replace(/s$/, "");
  const dayIndex = weekdayIndexes[key];
  return typeof dayIndex === "number" ? dayIndex : null;
};

export const parseHHMM = (value: string | null): ParsedClockTime | null => {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return { hour, minute };
};

export const isJstTimezone = (value: string | null): boolean => {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return true;
  return normalized === "asia/tokyo" || normalized === "jst";
};

export const convertJstToLocalTime = (
  dayIndex: number,
  hour: number,
  minute: number,
  localOffsetMinutes: number,
): LocalClockTime => {
  const sourceMinutes = hour * 60 + minute;
  const diff = jstOffsetMinutes - localOffsetMinutes;
  const localTotal = sourceMinutes - diff;

  const dayShift = Math.floor(localTotal / 1440);
  const normalizedMinutes = ((localTotal % 1440) + 1440) % 1440;
  const localHour = Math.floor(normalizedMinutes / 60);
  const localMinute = normalizedMinutes % 60;

  return {
    dayIndex: (((dayIndex + dayShift) % 7) + 7) % 7,
    hour: localHour,
    minute: localMinute,
    totalMinutes: localHour * 60 + localMinute,
  };
};
