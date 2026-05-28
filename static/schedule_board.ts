export {};

type WeekStart = "monday" | "sunday" | "saturday";
type TimeFormat = "24" | "12";
type SortBy = "time" | "alpha" | "score";

interface ScheduleSettings {
  weekStart: WeekStart;
  timeFormat: TimeFormat;
  showImages: boolean;
  sortBy: SortBy;
  weekOffset: number;
}

const settingsKey = "schedule_settings_v1";

const defaultSettings: ScheduleSettings = {
  weekStart: "monday",
  timeFormat: "24",
  showImages: true,
  sortBy: "time",
  weekOffset: 0,
};

const parseJSON = (value: string | null): unknown => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const isWeekStart = (value: unknown): value is WeekStart =>
  value === "monday" || value === "sunday" || value === "saturday";

const isTimeFormat = (value: unknown): value is TimeFormat => value === "24" || value === "12";

const isSortBy = (value: unknown): value is SortBy =>
  value === "time" || value === "alpha" || value === "score";

const loadSettings = (): ScheduleSettings => {
  const raw = parseJSON(localStorage.getItem(settingsKey));
  if (!raw || typeof raw !== "object") return { ...defaultSettings };
  const obj = raw as Record<string, unknown>;

  const weekStart = isWeekStart(obj.weekStart) ? obj.weekStart : defaultSettings.weekStart;
  const timeFormat = isTimeFormat(obj.timeFormat) ? obj.timeFormat : defaultSettings.timeFormat;
  const showImages =
    typeof obj.showImages === "boolean" ? obj.showImages : defaultSettings.showImages;
  const sortBy = isSortBy(obj.sortBy) ? obj.sortBy : defaultSettings.sortBy;
  const weekOffset = Number.isFinite(obj.weekOffset)
    ? Number(obj.weekOffset)
    : defaultSettings.weekOffset;

  return { weekStart, timeFormat, showImages, sortBy, weekOffset };
};

const saveSettings = (settings: ScheduleSettings): void => {
  localStorage.setItem(settingsKey, JSON.stringify(settings));
};

interface ParsedTime {
  hour: number;
  minute: number;
}

const parseHHMM = (value: string | null): ParsedTime | null => {
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

const normalizeWeekday = (value: string | null): number | null => {
  if (!value) return null;
  const key = value.trim().toLowerCase().replace(/s$/, "");
  const map: Record<string, number> = {
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
  return typeof map[key] === "number" ? map[key] : null;
};

const isJstTimezone = (tz: string | null): boolean => {
  const normalized = (tz ?? "").trim().toLowerCase();
  if (!normalized) return true;
  return normalized === "asia/tokyo" || normalized === "jst";
};

interface LocalSlot {
  localDayIndex: number;
  localMinutes: number;
  timeLabel: string;
}

const formatLocalTime = (hour: number, minute: number, format: TimeFormat): string => {
  const use12h = format === "12";
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: use12h,
  });
  return formatter.format(date);
};

const getLocalSlot = (
  broadcastDay: string | null,
  broadcastTime: string | null,
  broadcastTimezone: string | null,
  timeFormat: TimeFormat,
): LocalSlot | null => {
  const sourceDayIndex = normalizeWeekday(broadcastDay);
  const parsed = parseHHMM(broadcastTime);
  if (sourceDayIndex === null || !parsed) return null;
  if (!isJstTimezone(broadcastTimezone)) return null;

  // Treat the broadcast time as JST (UTC+9) and convert using the user's current local offset.
  const jstOffsetMinutes = 9 * 60;
  const localOffsetMinutes = -new Date().getTimezoneOffset();

  const sourceMinutes = parsed.hour * 60 + parsed.minute;
  const diff = jstOffsetMinutes - localOffsetMinutes; // JST ahead of local
  const localTotal = sourceMinutes - diff;

  const dayShift = Math.floor(localTotal / 1440);
  const normalizedMinutes = ((localTotal % 1440) + 1440) % 1440;
  const localHour = Math.floor(normalizedMinutes / 60);
  const localMinute = normalizedMinutes % 60;

  const localDayIndex = (((sourceDayIndex + dayShift) % 7) + 7) % 7;
  const localMinutes = localHour * 60 + localMinute;
  const timeLabel = formatLocalTime(localHour, localMinute, timeFormat);
  return { localDayIndex, localMinutes, timeLabel };
};

const orderedDayIndexes = (weekStart: WeekStart): number[] => {
  if (weekStart === "sunday") return [0, 1, 2, 3, 4, 5, 6];
  if (weekStart === "saturday") return [6, 0, 1, 2, 3, 4, 5];
  return [1, 2, 3, 4, 5, 6, 0];
};

const startOfWeek = (weekStart: WeekStart, weekOffset: number): Date => {
  const now = new Date();
  const start = new Date(now);
  start.setHours(12, 0, 0, 0);

  const startIndex = orderedDayIndexes(weekStart)[0];
  const diff = (start.getDay() - startIndex + 7) % 7;
  start.setDate(start.getDate() - diff + weekOffset * 7);
  return start;
};

const dayName = (index: number): string =>
  ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][index] ?? "Day";

const wireControls = (
  root: HTMLElement,
  settings: ScheduleSettings,
  rerender: () => void,
): void => {
  const sync = (): void => {
    const buttons = root.querySelectorAll<HTMLElement>(
      "[data-schedule-setting][data-schedule-value]",
    );
    for (const button of buttons) {
      const key = button.getAttribute("data-schedule-setting");
      const value = button.getAttribute("data-schedule-value");
      if (!key || value === null) continue;

      const isActive =
        (key === "timeFormat" && value === settings.timeFormat) ||
        (key === "showImages" && value === String(settings.showImages));

      button.classList.toggle("bg-background-button-hover", isActive);
    }

    const selects = root.querySelectorAll<HTMLSelectElement>("select[data-schedule-setting]");
    for (const select of selects) {
      const key = select.getAttribute("data-schedule-setting");
      if (!key) continue;
      if (key === "sortBy") select.value = settings.sortBy;
      if (key === "weekStart") select.value = settings.weekStart;
    }
  };

  root.addEventListener("click", (event) => {
    const target =
      event.target instanceof Element ? event.target.closest("[data-schedule-setting]") : null;
    if (!target) return;
    const key = target.getAttribute("data-schedule-setting");
    const value = target.getAttribute("data-schedule-value");
    if (!key || value === null) return;

    if (key === "timeFormat" && isTimeFormat(value)) settings.timeFormat = value;
    if (key === "showImages") settings.showImages = value === "true";

    saveSettings(settings);
    sync();
    rerender();
  });

  root.addEventListener("change", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!(target instanceof HTMLSelectElement)) return;
    const key = target.getAttribute("data-schedule-setting");
    if (!key) return;
    if (key === "sortBy" && isSortBy(target.value)) settings.sortBy = target.value;
    if (key === "weekStart" && isWeekStart(target.value)) settings.weekStart = target.value;
    saveSettings(settings);
    sync();
    rerender();
  });

  root.addEventListener("click", (event) => {
    const target =
      event.target instanceof Element ? event.target.closest("[data-schedule-week-nav]") : null;
    if (!target) return;
    const delta = Number.parseInt(target.getAttribute("data-schedule-week-nav") ?? "0", 10);
    if (!Number.isFinite(delta) || delta === 0) return;
    settings.weekOffset += delta;
    saveSettings(settings);
    rerender();
  });

  sync();
};

interface Item {
  node: HTMLElement;
  dayIndex: number;
  minutes: number;
  title: string;
  score: number;
  timeLabel: string;
}

const buildBoard = (section: HTMLElement): void => {
  const board = section.querySelector<HTMLElement>("[data-schedule-board]");
  const source = section.querySelector<HTMLElement>("[data-schedule-items-source]");
  if (!board || !source) return;

  const settings = loadSettings();

  const render = (): void => {
    const dayOrder = orderedDayIndexes(settings.weekStart);

    const daySections = new Map<number, HTMLElement>();
    for (const dayIndex of dayOrder) {
      const day = dayName(dayIndex);
      const daySection = board.querySelector<HTMLElement>(`[data-schedule-day="${day}"]`);
      if (daySection) {
        daySections.set(dayIndex, daySection);
      }
    }

    // Reorder day columns to match week start
    const ordered = dayOrder
      .map((i) => daySections.get(i))
      .filter((n): n is HTMLElement => n instanceof HTMLElement);
    for (const node of ordered) board.appendChild(node);

    const weekStartDate = startOfWeek(settings.weekStart, settings.weekOffset);
    const dateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
    for (const dayIndex of dayOrder) {
      const daySection = daySections.get(dayIndex);
      if (!daySection) continue;
      const labelNode = daySection.querySelector<HTMLElement>("[data-schedule-day-label]");
      if (labelNode) labelNode.textContent = dayName(dayIndex);
      const dateNode = daySection.querySelector<HTMLElement>("[data-schedule-date-label]");
      if (dateNode) {
        const date = new Date(weekStartDate);
        const dayOffset = (dayIndex - dayOrder[0] + 7) % 7;
        date.setDate(date.getDate() + dayOffset);
        dateNode.textContent = dateFormatter.format(date);
      }
      const itemsNode = daySection.querySelector<HTMLElement>("[data-schedule-day-items]");
      if (itemsNode) itemsNode.textContent = "";
      const countNode = daySection.querySelector<HTMLElement>("[data-schedule-count]");
      if (countNode) countNode.textContent = "0";
    }

    const rawItems = Array.from(source.querySelectorAll<HTMLElement>("[data-schedule-item]"));
    const parsed: Item[] = [];

    for (const node of rawItems) {
      const title = node.getAttribute("data-title") ?? "";
      const score = Number(node.getAttribute("data-score") ?? "0");
      const slot = getLocalSlot(
        node.getAttribute("data-broadcast-day"),
        node.getAttribute("data-broadcast-time"),
        node.getAttribute("data-broadcast-timezone"),
        settings.timeFormat,
      );
      if (!slot) continue;

      const timeNode = node.querySelector<HTMLElement>("[data-schedule-time]");
      if (timeNode) timeNode.textContent = slot.timeLabel;

      const poster = node.querySelector<HTMLElement>("[data-schedule-poster]");
      if (poster) poster.classList.toggle("hidden", !settings.showImages);

      parsed.push({
        node,
        dayIndex: slot.localDayIndex,
        minutes: slot.localMinutes,
        title,
        score: Number.isFinite(score) ? score : 0,
        timeLabel: slot.timeLabel,
      });
    }

    const sorter = (a: Item, b: Item): number => {
      if (settings.sortBy === "alpha") return a.title.localeCompare(b.title);
      if (settings.sortBy === "score")
        return (b.score || 0) - (a.score || 0) || a.title.localeCompare(b.title);
      return a.minutes - b.minutes || a.title.localeCompare(b.title);
    };

    parsed.sort((a, b) => a.dayIndex - b.dayIndex || sorter(a, b));

    for (const dayIndex of dayOrder) {
      const daySection = daySections.get(dayIndex);
      if (!daySection) continue;
      const itemsNode = daySection.querySelector<HTMLElement>("[data-schedule-day-items]");
      if (!itemsNode) continue;

      const items = parsed.filter((i) => i.dayIndex === dayIndex).sort(sorter);
      for (const item of items) itemsNode.appendChild(item.node);

      const countNode = daySection.querySelector<HTMLElement>("[data-schedule-count]");
      if (countNode) countNode.textContent = String(items.length);
    }
  };

  wireControls(section, settings, render);
  render();
};

const initScheduleBoard = (): void => {
  const run = (): void => {
    const sections = document.querySelectorAll<HTMLElement>("[data-schedule-section]");
    sections.forEach(buildBoard);
  };

  document.addEventListener("DOMContentLoaded", run);
  document.body.addEventListener("htmx:afterSwap", run);
};

initScheduleBoard();
