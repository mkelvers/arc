import assert from "node:assert/strict";
import { before, beforeEach, describe, test } from "node:test";

class FakeElement extends EventTarget {
  className = "";
  classList = fakeClassList();
  disabled = false;
  parentElement: FakeElement | null = null;
  style: Record<string, string> = {};
  textContent = "";
  private readonly children: FakeElement[] = [];
  private readonly queries = new Map<string, FakeElement | null>();

  append(child: FakeElement): void {
    child.parentElement = this;
    this.children.push(child);
  }

  querySelector(selector: string): FakeElement | null {
    return this.queries.get(selector) ?? null;
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
  refreshCurrentModeSource: (signal?: AbortSignal) => Promise<boolean>;
  saveProgress: (force?: boolean, progressSeconds?: number) => Promise<void>;
  setupProgress: () => void;
  state: typeof import("./state").state;
  streamUrlForMode: (mode: string, quality?: string) => string;
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
const windowStub = Object.assign(new EventTarget(), {
  clearTimeout: (_handle: number | undefined): void => {
    void _handle;
  },
  setTimeout: (_callback: () => void, _delay: number): number => {
    void _callback;
    void _delay;
    return 1;
  },
});
let modules: PlayerModules;
let fetchCalls: Array<{ body?: string; url: string }>;
let timeoutCallbacks: Array<() => void>;
const originalConsoleError = console.error;

const installBrowserGlobals = (): void => {
  Object.assign(globalThis, {
    document: documentStub,
    HTMLElement: FakeElement,
    HTMLVideoElement: FakeElement,
    HTMLMediaElement: { HAVE_METADATA: 1, HAVE_CURRENT_DATA: 2 },
    window: windowStub,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { sendBeacon: () => true },
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
  state.episode.malID = 42;
  state.episode.transitionEpisode = null;
  state.episode.completionSent = false;
  state.episode.completionAttempts = 0;
  state.episode.endedProgressSaved = false;
  state.episode.lastSavedProgress = { episode: "3", seconds: -1 };
  state.playback.currentMode = "sub";
  state.playback.streamURL = "/watch/proxy/stream";
  state.playback.modeSources = {};
  state.timers.progressSaveTimer = undefined;
  documentStub.setDropdownTrigger(null);
};

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const loadPlayerModules = async (): Promise<PlayerModules> => {
  const completeModule = await import("./episodes/complete");
  const progressModule = await import("./progress");
  const stateModule = await import("./state");
  const sourceModule = await import("./source");

  return {
    completeAnime: completeModule.completeAnime,
    refreshCurrentModeSource: sourceModule.refreshCurrentModeSource,
    saveProgress: progressModule.saveProgress,
    setupProgress: progressModule.setupProgress,
    state: stateModule.state,
    streamUrlForMode: sourceModule.streamUrlForMode,
  };
};

before(async () => {
  installBrowserGlobals();
  modules = await loadPlayerModules();
});

beforeEach(() => {
  console.error = originalConsoleError;
  fetchCalls = [];
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
});

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
});
