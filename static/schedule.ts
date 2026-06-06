import { onReady } from "./utils";

const scheduleTimezone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const initScheduleLoader = (): void => {
  onReady(() => {
    const loader = document.querySelector<HTMLElement>("[data-schedule-loader]");
    if (!loader) return;
    loader.setAttribute("hx-vals", JSON.stringify({ timezone: scheduleTimezone() }));
  });
};

initScheduleLoader();
