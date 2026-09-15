import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROGRESS_STORAGE_KEY } from "./progress";

interface FakeButton {
  id: string;
  disabled: boolean;
  dataset: Record<string, string>;
}

const puzzleResponse = (id: string, token: string) => ({
  id,
  seed: id,
  puzzleToken: token,
  clues: [],
  difficulty: { level: 1, label: "Very easy", modelVersion: "test" },
  spec: {
    id: "tournament-order-v2",
    title: "Tournament Order",
    baseCategory: "judoka",
    categories: [
      { id: "judoka", label: "Judoka", values: ["Aki", "Ben"] },
      { id: "club", label: "Club", values: ["Lions", "Wolves"] },
    ],
  },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe("answer verification navigation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("does not let a response from the previous course complete or alter the new course UI", async () => {
    const listeners = new Map<string, (event: { target: { closest: () => FakeButton | null } }) => void>();
    const windowListeners = new Map<string, () => void>();
    const root = {
      innerHTML: "",
      addEventListener: (name: string, listener: (event: { target: { closest: () => FakeButton | null } }) => void) => listeners.set(name, listener),
      querySelector: () => null,
    };
    let href = "https://example.test/?seed=course-one&mode=challenge&tier=beginner&level=1";
    const storage = new Map<string, string>();
    const storageApi = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) };
    vi.stubGlobal("document", { querySelector: () => root, activeElement: null });
    vi.stubGlobal("window", {
      get location() { return new URL(href); },
      matchMedia: () => ({ matches: false }),
      addEventListener: (name: string, listener: () => void) => windowListeners.set(name, listener),
      history: {
        pushState: (_state: unknown, _unused: string, url: URL | string) => { href = String(url); },
        replaceState: (_state: unknown, _unused: string, url: URL | string) => { href = String(url); },
      },
    });
    vi.stubGlobal("localStorage", storageApi);
    vi.stubGlobal("sessionStorage", storageApi);
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => callback());

    const verification = deferred<{ ok: boolean; json: () => Promise<{ correct: boolean }> }>();
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/events") return { ok: true, json: async () => ({}) };
      if (url === "/api/puzzle" && init?.method === "POST") return verification.promise;
      const seed = new URL(url, "https://example.test").searchParams.get("seed")!;
      return { ok: true, status: 200, json: async () => puzzleResponse(seed, `${seed}-token`) };
    });
    vi.stubGlobal("fetch", fetchMock);

    await import("./main");
    await flush();

    const click = (button: Partial<FakeButton>) => listeners.get("click")!({
      target: { closest: () => ({ id: "", disabled: false, dataset: {}, ...button }) },
    });
    click({ dataset: { square: "club|Aki|Lions" } });
    click({ dataset: { square: "club|Ben|Wolves" } });
    click({ id: "check-solution" });
    await flush();
    expect(root.innerHTML).toContain("Tako is checking your solution");

    click({ dataset: { course: "beginner-2" } });
    await flush();
    expect(root.innerHTML).toContain("Beginner Level 2");
    const newCourseUi = root.innerHTML;

    verification.resolve({ ok: true, json: async () => ({ correct: true }) });
    await flush();
    await flush();

    expect(storage.get(PROGRESS_STORAGE_KEY)).toBeUndefined();
    expect(root.innerHTML).toBe(newCourseUi);
    expect(root.innerHTML).not.toContain("Level complete!");
  });

  it("discards a hint response after navigating to another puzzle", async () => {
    const listeners = new Map<string, (event: { target: { closest: () => FakeButton | null } }) => void>();
    const root = {
      innerHTML: "",
      addEventListener: (name: string, listener: (event: { target: { closest: () => FakeButton | null } }) => void) => listeners.set(name, listener),
      querySelector: () => null,
    };
    let href = "https://example.test/?seed=puzzle-a&mode=challenge&tier=beginner&level=1";
    const storage = new Map<string, string>();
    const storageApi = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) };
    vi.stubGlobal("document", { querySelector: () => root, activeElement: null });
    vi.stubGlobal("window", {
      get location() { return new URL(href); },
      matchMedia: () => ({ matches: false }),
      addEventListener: () => undefined,
      history: {
        pushState: (_state: unknown, _unused: string, url: URL | string) => { href = String(url); },
        replaceState: (_state: unknown, _unused: string, url: URL | string) => { href = String(url); },
      },
    });
    vi.stubGlobal("localStorage", storageApi);
    vi.stubGlobal("sessionStorage", storageApi);
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => callback());
    vi.stubGlobal("crypto", { randomUUID: () => "puzzle-b" });

    const hint = deferred<{ ok: boolean; json: () => Promise<{ kind: string; clue: { id: string; text: string } }> }>();
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "/api/events") return { ok: true, json: async () => ({}) };
      if (url === "/api/hint") return hint.promise;
      const seed = new URL(url, "https://example.test").searchParams.get("seed")!;
      return { ok: true, status: 200, json: async () => puzzleResponse(seed, `${seed}-token`) };
    });
    vi.stubGlobal("fetch", fetchMock);

    await import("./main");
    await flush();

    const click = (button: Partial<FakeButton>) => listeners.get("click")!({
      target: { closest: () => ({ id: "", disabled: false, dataset: {}, ...button }) },
    });
    click({ id: "hint" });
    await flush();
    expect(root.innerHTML).toContain("Tako is finding the next helpful nudge");

    click({ dataset: { course: "beginner-2" } });
    await flush();
    expect(root.innerHTML).toContain("Beginner Level 2");
    const puzzleBUi = root.innerHTML;

    hint.resolve({ ok: true, json: async () => ({ kind: "clue", clue: { id: "old-clue", text: "An old hint" } }) });
    await flush();
    await flush();

    expect(root.innerHTML).toBe(puzzleBUi);
    expect(storage.get("tako-bako.board.puzzle-b")).toBeUndefined();
    expect(storage.get("tako-bako.clues.puzzle-b")).toBeUndefined();
    expect(root.innerHTML).not.toContain("An old hint");
  });

  it("returns to the seedless landing page when navigating Back from a started puzzle", async () => {
    const listeners = new Map<string, (event: { target: { closest: () => FakeButton | null } }) => void>();
    const windowListeners = new Map<string, () => void>();
    const root = {
      innerHTML: "",
      addEventListener: (name: string, listener: (event: { target: { closest: () => FakeButton | null } }) => void) => listeners.set(name, listener),
      querySelector: () => null,
    };
    let href = "https://example.test/";
    const storage = new Map<string, string>();
    const storageApi = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) };
    vi.stubGlobal("document", { querySelector: () => root, activeElement: null });
    vi.stubGlobal("window", {
      get location() { return new URL(href); },
      matchMedia: () => ({ matches: false }),
      addEventListener: (name: string, listener: () => void) => windowListeners.set(name, listener),
      history: {
        pushState: (_state: unknown, _unused: string, url: URL | string) => { href = String(url); },
        replaceState: (_state: unknown, _unused: string, url: URL | string) => { href = String(url); },
      },
    });
    vi.stubGlobal("localStorage", storageApi);
    vi.stubGlobal("sessionStorage", storageApi);
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => callback());
    vi.stubGlobal("crypto", { randomUUID: () => "reproducible-seed" });
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "/api/events") return { ok: true, json: async () => ({}) };
      const seed = new URL(url, "https://example.test").searchParams.get("seed")!;
      return { ok: true, status: 200, json: async () => puzzleResponse(seed, `${seed}-token`) };
    });
    vi.stubGlobal("fetch", fetchMock);

    await import("./main");
    const click = (button: Partial<FakeButton>) => listeners.get("click")!({
      target: { closest: () => ({ id: "", disabled: false, dataset: {}, ...button }) },
    });
    click({ id: "start-puzzle" });
    await flush();

    expect(href).toContain("seed=reproducible-seed");
    expect(root.innerHTML).toContain('id="share-puzzle"');

    href = "https://example.test/";
    windowListeners.get("popstate")!();
    await flush();

    expect(href).toBe("https://example.test/");
    expect(root.innerHTML).toContain('class="landing-state"');
    expect(root.innerHTML).toContain('id="start-puzzle"');
    expect(root.innerHTML).not.toContain('id="share-puzzle"');
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/puzzle?")).length).toBe(1);
  });
});
