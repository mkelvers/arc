import assert from "node:assert/strict";
import { before, beforeEach, describe, test } from "node:test";

/* eslint-disable max-classes-per-file */

class FakeElement extends EventTarget {
  readonly dataset: Record<string, string> = {};
  className = "";
  classList = fakeClassList();
  disabled = false;
  parentElement: FakeElement | null = null;
  style: Record<string, string> = {};
  textContent = "";
  tabIndex = 0;
  private readonly children: FakeElement[] = [];
  private readonly queries = new Map<string, FakeElement | null>();

  append(child: FakeElement): void {
    child.parentElement = this;
    this.children.push(child);
  }

  closest(_selector: string): FakeElement | null {
    return null;
  }

  focus(options?: FocusOptions): void {
    void options;
  }

  querySelector(selector: string): FakeElement | null {
    return this.queries.get(selector) ?? null;
  }

  querySelectorAll(_selector: string): FakeElement[] {
    return [];
  }

  removeAttribute(name: string): void {
    void name;
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.length = 0;
    children.forEach((child) => {
      this.append(child);
    });
  }

  setQuery(selector: string, element: FakeElement | null): void {
    this.queries.set(selector, element);
  }

  setAttribute(name: string, value: string): void {
    void name;
    void value;
  }

  scrollIntoView(options?: ScrollIntoViewOptions): void {
    void options;
  }
}

class FakeAnchorElement extends FakeElement {
  href = "";
  target = "";

  override closest(selector: string): FakeAnchorElement | null {
    return selector === "a[data-episode-id]" ? this : null;
  }
}

class FakeMouseEvent {
  readonly altKey: boolean;
  readonly button: number;
  readonly ctrlKey: boolean;
  defaultPrevented = false;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly target: FakeElement;

  constructor(
    target: FakeElement,
    options: Partial<
      Pick<MouseEvent, "altKey" | "button" | "ctrlKey" | "metaKey" | "shiftKey">
    > = {},
  ) {
    this.target = target;
    this.altKey = options.altKey ?? false;
    this.button = options.button ?? 0;
    this.ctrlKey = options.ctrlKey ?? false;
    this.metaKey = options.metaKey ?? false;
    this.shiftKey = options.shiftKey ?? false;
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

type FakeVideoElement = FakeElement & {
  buffered: TimeRanges;
  currentTime: number;
  duration: number;
  load: () => void;
  pause: () => void;
  paused: boolean;
  play: () => Promise<void>;
  readyState: number;
  removeAttribute: (name: string) => void;
  seekable: TimeRanges;
  src: string;
};

type PlayerModules = {
  completeAnime: (episodeNumber: number) => Promise<void>;
  handleEpisodeNavigationClick: (event: MouseEvent) => boolean;
  prefetchNextEpisode: () => void;
  refreshCurrentModeSource: (signal?: AbortSignal) => Promise<boolean>;
  saveProgress: (force?: boolean, progressSeconds?: number) => Promise<void>;
  setupProgress: () => void;
  state: typeof import("./state").state;
  streamUrlForMode: (mode: string, quality?: string) => string;
  setupEpisodeNavigation: (signal: AbortSignal) => void;
  transitionToEpisode: (
    episode: number,
    options?: { fallbackHref?: string; history?: "none" | "push" | "replace" },
  ) => Promise<boolean>;
};

const emptyRanges = (): TimeRanges => ({ length: 0, end: () => 0, start: () => 0 });

const fakeClassList = (): DOMTokenList => {
  const values = new Set<string>();
  return {
    add: (...tokens: string[]): void => {
      tokens.forEach((token) => {
        values.add(token);
      });
    },
    remove: (...tokens: string[]): void => {
      tokens.forEach((token) => {
        values.delete(token);
      });
    },
    toggle: (token: string, force?: boolean): boolean => {
      const shouldAdd = force ?? !values.has(token);
      if (shouldAdd) {
        values.add(token);
      } else {
        values.delete(token);
      }
      return shouldAdd;
    },
  } as DOMTokenList;
};

const fakeVideoElement = (): FakeVideoElement => {
  const video = Object.assign(new FakeElement(), {
    buffered: emptyRanges(),
    currentTime: 0,
    duration: 0,
    paused: true,
    readyState: 0,
    seekable: emptyRanges(),
    src: "",
    load: (): void => {
      void video.src;
    },
    pause: (): void => {
      video.paused = true;
    },
    play: (): Promise<void> => {
      video.paused = false;
      return Promise.resolve();
    },
    removeAttribute: (name: string): void => {
      if (name === "src") {
        video.src = "";
      }
    },
  });
  return video;
};

const fakeDocument = (): Document & {
  setDropdownTrigger: (trigger: FakeElement | null) => void;
} => {
  let trigger: FakeElement | null = null;
  return {
    body: new FakeElement(),
    createElement: (tag: string): FakeElement =>
      tag === "video" ? fakeVideoElement() : new FakeElement(),
    querySelector: (selector: string): FakeElement | null =>
      selector === "[data-dropdown-trigger]" ? trigger : null,
    setDropdownTrigger: (nextTrigger: FakeElement | null): void => {
      trigger = nextTrigger;
    },
  } as unknown as Document & { setDropdownTrigger: (trigger: FakeElement | null) => void };
};

const documentStub = fakeDocument();
const storage = (): Storage => {
  const values = new Map<string, string>();
  return {
    clear: (): void => {
      values.clear();
    },
    getItem: (key: string): string | null => values.get(key) ?? null,
    key: (index: number): string | null => [...values.keys()][index] ?? null,
    get length(): number {
      return values.size;
    },
    removeItem: (key: string): void => {
      values.delete(key);
    },
    setItem: (key: string, value: string): void => {
      values.set(key, value);
    },
  };
};
const historyCalls: string[] = [];
const localStorageStub = storage();
const sessionStorageStub = storage();
const windowStub = Object.assign(new EventTarget(), {
  clearTimeout: (_handle: number | undefined): void => {
    void _handle;
  },
  setTimeout: (_callback: () => void, _delay: number): number => {
    void _callback;
    void _delay;
    return 1;
  },
  localStorage: localStorageStub,
  location: { href: "http://localhost/anime/42/watch?ep=3", origin: "http://localhost" },
  showToast: (options: { message: string }): void => {
    void options;
  },
});
let modules: PlayerModules;
let beaconCalls: string[];
let fetchCalls: Array<{ body?: string; url: string }>;
let timeoutCallbacks: Array<() => void>;
const originalConsoleError = console.error;

const installBrowserGlobals = (): void => {
  Object.assign(globalThis, {
    document: documentStub,
    Element: FakeElement,
    HTMLAnchorElement: FakeAnchorElement,
    HTMLElement: FakeElement,
    HTMLVideoElement: FakeElement,
    HTMLMediaElement: { HAVE_METADATA: 1, HAVE_CURRENT_DATA: 2 },
    MouseEvent: FakeMouseEvent,
    window: windowStub,
  });
  Object.assign(globalThis, {
    history: {
      pushState: (_data: unknown, _unused: string, url?: string | URL | null): void => {
        const href = String(url);
        historyCalls.push(href);
        windowStub.location.href = href;
      },
      replaceState: (_data: unknown, _unused: string, url?: string | URL | null): void => {
        const href = String(url);
        historyCalls.push(href);
        windowStub.location.href = href;
      },
    },
    sessionStorage: sessionStorageStub,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      sendBeacon: (_url: string, data: Blob): boolean => {
        void data.text().then((value) => {
          beaconCalls.push(value);
        });
        return true;
      },
    },
  });
};

const asHTMLElement = (element: FakeElement): HTMLElement => element as unknown as HTMLElement;

const resetPlayerState = (): void => {
  const { state } = modules;
  const video = fakeVideoElement();
  video.duration = 120;
  state.elements.container = asHTMLElement(new FakeElement());
  state.elements.video = video as unknown as HTMLVideoElement;
  state.elements.progress = asHTMLElement(new FakeElement());
  state.elements.scrubber = asHTMLElement(new FakeElement());
  state.elements.buffered = asHTMLElement(new FakeElement());
  state.elements.timeDisplay = asHTMLElement(new FakeElement());
  state.elements.durationDisplay = asHTMLElement(new FakeElement());
  state.episode.current = "3";
  state.episode.total = 10;
  state.episode.malID = 42;
  state.episode.transitionEpisode = null;
  state.episode.completionSent = false;
  state.episode.completionAttempts = 0;
  state.episode.endedProgressSaved = false;
  state.episode.lastSavedProgress = { episode: "3", seconds: -1 };
  state.playback.currentMode = "sub";
  state.playback.modeSwitchedFrom = "";
  state.playback.startTimeSeconds = 0;
  state.playback.streamURL = "/watch/proxy/stream";
  state.playback.modeSources = {};
  state.elements.episodeGrid = null;
  state.elements.episodeList = null;
  state.elements.videoOverlay = null;
  state.timers.progressSaveTimer = undefined;
  documentStub.setDropdownTrigger(null);
};

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const loadPlayerModules = async (): Promise<PlayerModules> => {
  const completeModule = await import("./episodes/complete");
  const navModule = await import("./episodes/nav");
  const progressModule = await import("./progress");
  const stateModule = await import("./state");
  const sourceModule = await import("./source");

  return {
    completeAnime: completeModule.completeAnime,
    handleEpisodeNavigationClick: navModule.handleEpisodeNavigationClick,
    prefetchNextEpisode: navModule.prefetchNextEpisode,
    refreshCurrentModeSource: sourceModule.refreshCurrentModeSource,
    saveProgress: progressModule.saveProgress,
    setupProgress: progressModule.setupProgress,
    state: stateModule.state,
    streamUrlForMode: sourceModule.streamUrlForMode,
    setupEpisodeNavigation: navModule.setupEpisodeNavigation,
    transitionToEpisode: navModule.transitionToEpisode,
  };
};

before(async () => {
  installBrowserGlobals();
  modules = await loadPlayerModules();
});

beforeEach(() => {
  console.error = originalConsoleError;
  fetchCalls = [];
  beaconCalls = [];
  historyCalls.length = 0;
  localStorageStub.clear();
  sessionStorageStub.clear();
  windowStub.location.href = "http://localhost/anime/42/watch?ep=3";
  windowStub.showToast = (options: { message: string }): void => {
    void options;
  };
  timeoutCallbacks = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    fetchCalls.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
    return Promise.resolve({ ok: true, status: 200 } as Response);
  }) as typeof fetch;
  windowStub.setTimeout = (callback: () => void, _delay: number): number => {
    timeoutCallbacks.push(callback);
    return timeoutCallbacks.length;
  };
  globalThis.setTimeout = windowStub.setTimeout.bind(windowStub) as typeof setTimeout;
  resetPlayerState();
  delete (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
});

const episodePayload = (
  episode: number,
  modes?: Record<string, { subtitles: never[]; token: string; type: string }>,
): Record<string, unknown> => {
  const modeSources = modes ?? {
    dub: { subtitles: [], token: `dub-${episode}`, type: "mp4" },
    sub: { subtitles: [], token: `sub-${episode}`, type: "mp4" },
  };
  return {
    episode_title: `Episode ${episode}`,
    initial_mode: "sub",
    mode_sources: modeSources,
    mode_switched_from: "",
    segments: [],
    start_time_seconds: 12,
  };
};

const episodeResponse = (episode: number): Response =>
  ({ json: () => Promise.resolve(episodePayload(episode)), ok: true, status: 200 }) as Response;

describe("browser player flow", () => {
  test("builds initial stream URLs from mode token, HLS type, and preferred quality", () => {
    modules.state.playback.modeSources = {
      sub: { token: "sub token", type: "m3u8", qualities: ["1080p"], subtitles: [] },
    };

    assert.equal(
      modules.streamUrlForMode("sub", "720p"),
      "/watch/proxy/stream?mode=sub&token=sub%20token&hls=1&quality=720p",
    );
  });

  test("returns no stream URL when the selected mode has no playable token", () => {
    modules.state.playback.modeSources = { sub: { token: "", subtitles: [] } };

    assert.equal(modules.streamUrlForMode("sub", "best"), "");
  });

  test("refreshes stale current stream token from episode data", async () => {
    modules.state.elements.video.currentTime = 64;
    modules.state.playback.modeSources = {
      sub: { token: "stale-token", type: "m3u8", qualities: ["720p"], subtitles: [] },
    };
    globalThis.fetch = ((url: string) => {
      fetchCalls.push({ url });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            mode_sources: {
              sub: { token: "fresh-token", type: "m3u8", qualities: ["720p"], subtitles: [] },
            },
          }),
      } as Response);
    }) as typeof fetch;

    const refreshed = await modules.refreshCurrentModeSource();

    assert.equal(refreshed, true);
    assert.deepEqual(
      fetchCalls.map((call) => call.url),
      ["/api/watch/episode/42/3?mode=sub&refresh=1"],
    );
    assert.equal(modules.state.playback.modeSources.sub?.token, "fresh-token");
    assert.equal(
      modules.state.elements.video.src,
      "/watch/proxy/stream?mode=sub&token=fresh-token&hls=1",
    );
    assert.equal(modules.state.playback.pendingSeekTime, 64);
  });

  test("saves progress on pause and after scrub mouseup", async () => {
    modules.setupProgress();
    modules.state.elements.video.currentTime = 30;

    modules.state.elements.video.dispatchEvent(new Event("pause"));
    await flushPromises();
    modules.state.elements.video.currentTime = 47;
    window.dispatchEvent(new Event("mouseup"));
    await flushPromises();

    assert.deepEqual(
      fetchCalls.map((call) => JSON.parse(call.body ?? "{}")),
      [
        { mal_id: 42, episode: 3, time_seconds: 30 },
        { mal_id: 42, episode: 3, time_seconds: 47 },
      ],
    );
  });

  test("retries failed completion and updates completion trigger after success", async () => {
    const errors: unknown[][] = [];
    console.error = (...args: unknown[]): void => {
      errors.push(args);
    };
    const trigger = new FakeElement();
    documentStub.setDropdownTrigger(trigger);
    globalThis.fetch = ((url: string, init?: RequestInit) => {
      fetchCalls.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
      return Promise.resolve({ ok: fetchCalls.length > 1, status: 500 } as Response);
    }) as typeof fetch;

    await modules.completeAnime(3);
    assert.equal(modules.state.episode.completionSent, false);
    assert.equal(modules.state.episode.completionAttempts, 1);
    assert.equal(timeoutCallbacks.length, 1);

    timeoutCallbacks[0]?.();
    await flushPromises();

    assert.equal(fetchCalls.length, 2);
    assert.deepEqual(JSON.parse(fetchCalls[1]?.body ?? "{}"), { mal_id: 42, episode: 3 });
    assert.equal(modules.state.episode.completionSent, true);
    assert.equal(trigger.textContent, "Completed ");
    assert.equal(errors.length, 1);
  });

  test("transitions episodes in place and saves progress for the episode being left", async () => {
    const loading = new FakeElement();
    (modules.state.elements.container as unknown as FakeElement).setQuery(
      "[data-loading]",
      loading,
    );
    modules.state.elements.video.currentTime = 30;
    globalThis.fetch = ((url: string) => {
      fetchCalls.push({ url });
      return Promise.resolve(episodeResponse(4));
    }) as typeof fetch;

    const transitioned = await modules.transitionToEpisode(4);
    await flushPromises();

    assert.equal(transitioned, true);
    assert.deepEqual(
      fetchCalls.map((call) => call.url),
      ["/api/watch/episode/42/4?mode=sub"],
    );
    assert.equal(modules.state.episode.current, "4");
    assert.equal(modules.state.playback.startTimeSeconds, 12);
    assert.equal(modules.state.elements.video.src, "/watch/proxy/stream?mode=sub&token=sub-4");
    assert.equal(loading.style.display, "flex");
    assert.match(historyCalls[0] ?? "", /[?&]ep=4(?:&|$)/);
    assert.deepEqual(JSON.parse(beaconCalls[0] ?? "{}"), {
      mal_id: 42,
      episode: 3,
      time_seconds: 30,
    });

    modules.state.elements.video.dispatchEvent(new Event("loadedmetadata"));
    assert.equal(modules.state.episode.transitionEpisode, null);
  });

  test("uses a prefetched next-episode payload for the transition", async () => {
    const controller = new AbortController();
    modules.setupEpisodeNavigation(controller.signal);
    globalThis.fetch = ((url: string) => {
      fetchCalls.push({ url });
      return Promise.resolve(episodeResponse(4));
    }) as typeof fetch;

    modules.prefetchNextEpisode();
    await flushPromises();
    assert.equal(await modules.transitionToEpisode(4), true);

    assert.deepEqual(
      fetchCalls.map((call) => call.url),
      ["/api/watch/episode/42/4?mode=sub"],
    );
    controller.abort();
  });

  test("does not automatically prefetch when Save-Data is enabled", () => {
    const controller = new AbortController();
    modules.setupEpisodeNavigation(controller.signal);
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection = {
      saveData: true,
    };

    modules.prefetchNextEpisode();

    assert.equal(fetchCalls.length, 0);
    controller.abort();
  });

  test("uses the same async path for episode links and leaves modified clicks native", async () => {
    const modifiedLink = new FakeAnchorElement();
    modifiedLink.href = "http://localhost/anime/42/watch?ep=2";
    modifiedLink.dataset.episodeId = "2";
    const modifiedClick = new FakeMouseEvent(modifiedLink, { metaKey: true });

    assert.equal(
      modules.handleEpisodeNavigationClick(modifiedClick as unknown as MouseEvent),
      false,
    );
    assert.equal(modifiedClick.defaultPrevented, false);
    assert.equal(fetchCalls.length, 0);

    globalThis.fetch = ((url: string) => {
      fetchCalls.push({ url });
      const episode = Number.parseInt(
        new URL(url, "http://localhost").pathname.split("/").at(-1) ?? "",
        10,
      );
      return Promise.resolve(episodeResponse(episode));
    }) as typeof fetch;
    const previousLink = new FakeAnchorElement();
    previousLink.href = "http://localhost/anime/42/watch?ep=2";
    previousLink.dataset.episodeId = "2";
    const previousClick = new FakeMouseEvent(previousLink);

    assert.equal(
      modules.handleEpisodeNavigationClick(previousClick as unknown as MouseEvent),
      true,
    );
    assert.equal(previousClick.defaultPrevented, true);
    await flushPromises();
    assert.equal(modules.state.episode.current, "2");
    modules.state.elements.video.dispatchEvent(new Event("loadedmetadata"));

    const nextLink = new FakeAnchorElement();
    nextLink.href = "http://localhost/anime/42/watch?ep=4";
    nextLink.dataset.episodeId = "4";
    assert.equal(
      modules.handleEpisodeNavigationClick(new FakeMouseEvent(nextLink) as unknown as MouseEvent),
      true,
    );
    await flushPromises();
    assert.equal(modules.state.episode.current, "4");
    modules.state.elements.video.dispatchEvent(new Event("loadedmetadata"));
  });

  test("aborts a stale episode request and commits only the latest selection", async () => {
    modules.state.episode.current = "1";
    windowStub.location.href = "http://localhost/anime/42/watch?ep=1";
    const pending = new Map<
      number,
      { reject: (reason: unknown) => void; resolve: (response: Response) => void }
    >();
    globalThis.fetch = ((url: string, init?: RequestInit) => {
      fetchCalls.push({ url });
      const episode = Number.parseInt(
        new URL(url, "http://localhost").pathname.split("/").at(-1) ?? "",
        10,
      );
      return new Promise<Response>((resolve, reject) => {
        pending.set(episode, { reject, resolve });
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    }) as typeof fetch;

    const episode2 = modules.transitionToEpisode(2);
    const episode3 = modules.transitionToEpisode(3);
    pending.get(3)?.resolve(episodeResponse(3));

    assert.equal(await episode3, true);
    assert.equal(await episode2, false);
    assert.equal(modules.state.episode.current, "3");
    assert.equal(modules.state.elements.video.src, "/watch/proxy/stream?mode=sub&token=sub-3");
    assert.equal(historyCalls.length, 1);
    assert.match(historyCalls[0] ?? "", /[?&]ep=3(?:&|$)/);
    modules.state.elements.video.dispatchEvent(new Event("loadedmetadata"));
  });

  test("falls back to the original link when the episode payload fails", async () => {
    console.error = (): void => {
      void 0;
    };
    globalThis.fetch = ((url: string) => {
      fetchCalls.push({ url });
      return Promise.resolve({ ok: false, status: 503 } as Response);
    }) as typeof fetch;
    const fallbackHref = "http://localhost/anime/42/watch?ep=5";

    assert.equal(await modules.transitionToEpisode(5, { fallbackHref }), false);
    assert.equal(windowStub.location.href, fallbackHref);
    assert.equal(modules.state.episode.current, "3");
  });

  test("retries one failed media source before falling back to navigation", async () => {
    console.error = (): void => {
      void 0;
    };
    let request = 0;
    globalThis.fetch = ((url: string) => {
      fetchCalls.push({ url });
      request += 1;
      const payload = episodePayload(4);
      payload.mode_sources = {
        dub: { subtitles: [], token: `dub-${request}`, type: "mp4" },
        sub: { subtitles: [], token: `sub-${request}`, type: "mp4" },
      };
      return Promise.resolve({
        json: () => Promise.resolve(payload),
        ok: true,
        status: 200,
      } as Response);
    }) as typeof fetch;
    const fallbackHref = "http://localhost/anime/42/watch?ep=4";

    assert.equal(await modules.transitionToEpisode(4, { fallbackHref }), true);
    assert.equal(modules.state.elements.video.src, "/watch/proxy/stream?mode=sub&token=sub-1");
    modules.state.elements.video.dispatchEvent(new Event("error"));
    await flushPromises();
    assert.equal(modules.state.elements.video.src, "/watch/proxy/stream?mode=sub&token=sub-2");
    assert.equal(fetchCalls[1]?.url, "/api/watch/episode/42/4?mode=sub&refresh=1");

    modules.state.elements.video.dispatchEvent(new Event("error"));
    assert.equal(windowStub.location.href, fallbackHref);
  });

  test("uses the returned fallback mode and restores episodes on popstate", async () => {
    const notices: string[] = [];
    windowStub.showToast = ({ message }: { message: string }): void => {
      notices.push(message);
    };
    modules.state.playback.currentMode = "dub";
    globalThis.fetch = ((url: string) => {
      fetchCalls.push({ url });
      const episode = Number.parseInt(
        new URL(url, "http://localhost").pathname.split("/").at(-1) ?? "",
        10,
      );
      const payload = episodePayload(episode, {
        sub: { subtitles: [], token: `sub-${episode}`, type: "mp4" },
      });
      payload.mode_switched_from = "dub";
      return Promise.resolve({
        json: () => Promise.resolve(payload),
        ok: true,
        status: 200,
      } as Response);
    }) as typeof fetch;

    assert.equal(await modules.transitionToEpisode(4), true);
    assert.equal(modules.state.playback.currentMode, "sub");
    assert.deepEqual(notices, ["Episode 4 is only available in sub, switched from dub."]);
    modules.state.elements.video.dispatchEvent(new Event("loadedmetadata"));

    const controller = new AbortController();
    modules.setupEpisodeNavigation(controller.signal);
    windowStub.location.href = "http://localhost/anime/42/watch?ep=2";
    windowStub.dispatchEvent(new Event("popstate"));
    await flushPromises();
    assert.equal(modules.state.episode.current, "2");
    assert.equal(historyCalls.length, 1);
    modules.state.elements.video.dispatchEvent(new Event("loadedmetadata"));
    controller.abort();
  });
});
