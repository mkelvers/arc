import {
  convertJstToLocalTime,
  isJstTimezone,
  normalizeWeekday,
  parseHHMM,
} from "./shared/broadcast";

export {};

interface ParsedBroadcast {
  day: string;
  hour: number;
  minute: number;
}

const parseFromStructuredAttrs = (node: Element): ParsedBroadcast | null => {
  const day = node.getAttribute("data-broadcast-day");
  const time = node.getAttribute("data-broadcast-time");
  const timezone = node.getAttribute("data-broadcast-timezone");

  if (!day || !time || !isJstTimezone(timezone)) {
    return null;
  }

  const parsedTime = parseHHMM(time);
  if (!parsedTime) {
    return null;
  }

  return { day: day.trim(), hour: parsedTime.hour, minute: parsedTime.minute };
};

const parseBroadcast = (text: string | null): ParsedBroadcast | null => {
  if (!text || typeof text !== "string") {
    return null;
  }

  // matches "Monday at 00:00 (JST)" format
  const match = text.match(/^(.*) at (\d{1,2}):(\d{2}) \(JST\)$/i);
  if (!match) {
    return null;
  }

  const day = match[1].trim();
  const hour = Number.parseInt(match[2], 10);
  const minute = Number.parseInt(match[3], 10);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return { day, hour, minute };
};

const convertToLocal = (parsed: ParsedBroadcast, localOffsetMinutes: number): string | null => {
  const sourceDayIndex = normalizeWeekday(parsed.day);
  if (sourceDayIndex === null) {
    return null;
  }

  const localTime = convertJstToLocalTime(
    sourceDayIndex,
    parsed.hour,
    parsed.minute,
    localOffsetMinutes,
  );
  const localDay = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
    localTime.dayIndex
  ];

  const time = `${localTime.hour.toString().padStart(2, "0")}:${localTime.minute.toString().padStart(2, "0")}`;
  return `${localDay} at ${time} (Local)`;
};

const nextAiringUTC = (parsed: ParsedBroadcast): Date | null => {
  const targetDay = normalizeWeekday(parsed.day);
  if (targetDay === null) {
    return null;
  }

  // convert local time to JST to compare against JST now
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  const currentDay = jstNow.getUTCDay();
  const currentMinuteOfDay = jstNow.getUTCHours() * 60 + jstNow.getUTCMinutes();
  const targetMinuteOfDay = parsed.hour * 60 + parsed.minute;

  let dayDelta = (targetDay - currentDay + 7) % 7;
  // if same day but time has passed, schedule for next week
  if (dayDelta === 0 && targetMinuteOfDay <= currentMinuteOfDay) {
    dayDelta = 7;
  }

  const minuteDelta = dayDelta * 1440 + (targetMinuteOfDay - currentMinuteOfDay);
  return new Date(now.getTime() + minuteDelta * 60 * 1000);
};

const formatRelative = (value: number, unit: Intl.RelativeTimeFormatUnit): string => {
  // Intl.RelativeTimeFormat not available in all environments
  if (typeof Intl !== "undefined" && typeof Intl.RelativeTimeFormat === "function") {
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    return formatter.format(value, unit);
  }

  // fallback: "in X minutes/hours/days"
  const suffix = value === 1 ? unit : `${unit}s`;
  return `in ${value} ${suffix}`;
};

const relativeText = (target: Date): string => {
  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) {
    return "soon";
  }

  const minutes = Math.ceil(diffMs / 60000);
  if (minutes < 60) {
    return formatRelative(minutes, "minute");
  }

  const hours = Math.ceil(minutes / 60);
  if (hours < 36) {
    return formatRelative(hours, "hour");
  }

  const days = Math.ceil(hours / 24);
  return formatRelative(days, "day");
};

const localDateTimeText = (date: Date): string => {
  const formatter = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return formatter.format(date);
};

const updateNextAiring = (node: Element, parsed: ParsedBroadcast): void => {
  const card = node.closest("[data-notification-content]");
  if (!card) {
    return;
  }

  const nextNode = card.querySelector("[data-next-airing]");
  if (!(nextNode instanceof HTMLElement)) {
    return;
  }

  const nextDate = nextAiringUTC(parsed);
  if (!nextDate) {
    nextNode.remove();
    return;
  }

  nextNode.textContent = `Next episode ${relativeText(nextDate)} (${localDateTimeText(nextDate)})`;
};

const updateNode = (node: Element, localOffsetMinutes: number): void => {
  const card = node.closest("[data-notification-content]");
  const nextNode = card ? card.querySelector("[data-next-airing]") : null;

  // try structured attrs first, fall back to text parsing
  const structured = parseFromStructuredAttrs(node);
  const source = node.getAttribute("data-jst-text");
  const parsed = structured || parseBroadcast(source);
  if (!parsed) {
    if (nextNode instanceof HTMLElement) {
      nextNode.remove();
    }
    return;
  }

  const converted = convertToLocal(parsed, localOffsetMinutes);
  if (!converted) {
    if (nextNode instanceof HTMLElement) {
      nextNode.remove();
    }
    return;
  }

  node.textContent = converted;
  updateNextAiring(node, parsed);
};

const updateAll = (): void => {
  const localOffsetMinutes = -new Date().getTimezoneOffset();
  const nodes = document.querySelectorAll("[data-jst-text]");
  nodes.forEach((node) => updateNode(node, localOffsetMinutes));
};

const initTimezoneConversion = (): void => {
  // run on initial load and after htmx swaps (content may change)
  document.addEventListener("DOMContentLoaded", updateAll);
  document.body.addEventListener("htmx:afterSwap", updateAll);
};

initTimezoneConversion();
