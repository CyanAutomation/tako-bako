import { afterEach, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { restoreStubbedGlobals, stubGlobal } from "../test-utils.js";

import { mountApp } from "./app";
import { PROGRESS_STORAGE_KEY } from "./progress";

afterEach(restoreStubbedGlobals);

interface FakeButton {
  id: string;
  disabled: boolean;
  dataset: Record<string, string>;
}

const puzzleResponse = (id: string, token: string, clues: { id: string; text: string; constraint?: { kind: string } }[] = [], additionalCategories: { id: string; label: string; values: string[] }[] = []) => ({
  id,
  seed: id,
  puzzleToken: token,
  clues,
  difficulty: { level: 1, label: "Very easy", modelVersion: "test" },
  spec: {
    id: "tournament-order-v2",
    title: "Tournament Order",
    baseCategory: "judoka",
    categories: [
      { id: "judoka", label: "Judoka", values: ["Aki", "Ben"] },
      { id: "club", label: "Club", values: ["Lions", "Wolves"] },
      ...additionalCategories,
    ],
  },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function mountTestPuzzle(seed: string, fetchImplementation: (input: string | URL | Request, init?: RequestInit) => Promise<unknown>) {
  const listeners = new Map<string, (event: never) => void>();
  let href = `https://example.test/?seed=${seed}&mode=challenge&tier=beginner&level=1`;
  const root = {
    innerHTML: "",
    addEventListener: (name: string, listener: (event: never) => void) => listeners.set(name, listener),
    querySelector: () => null,
  };
  const storage = new Map<string, string>();
  const storageApi = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) };
  stubGlobal("document", { querySelector: () => root, activeElement: null });
  stubGlobal("window", {
    get location() { return new URL(href); },
    matchMedia: () => ({ matches: false }),
    addEventListener: () => undefined,
    history: { pushState: (_state: unknown, _unused: string, url: URL | string) => { href = String(url); }, replaceState: (_state: unknown, _unused: string, url: URL | string) => { href = String(url); } },
  });
  stubGlobal("localStorage", storageApi);
  stubGlobal("sessionStorage", storageApi);
  stubGlobal("CSS", { escape: (value: string) => value });
  stubGlobal("requestAnimationFrame", (callback: () => void) => callback());
  const fetchMock = mock.fn(fetchImplementation);
  stubGlobal("fetch", fetchMock);
  mountApp({ mascotUrl: "/mascot.png", markUrl: "/mark.png" });

  const click = (button: Partial<FakeButton>) => listeners.get("click")!({
    target: { closest: () => ({ id: "", disabled: false, dataset: {}, ...button }) },
  } as never);
  return { root, listeners, storage, fetchMock, click };
}

describe("answer verification navigation", () => {
  beforeEach(() => {
    mock.restoreAll();
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
    stubGlobal("document", { querySelector: () => root, activeElement: null });
    stubGlobal("window", {
      get location() { return new URL(href); },
      matchMedia: () => ({ matches: false }),
      addEventListener: (name: string, listener: () => void) => windowListeners.set(name, listener),
      history: {
        pushState: (_state: unknown, _unused: string, url: URL | string) => { href = String(url); },
        replaceState: (_state: unknown, _unused: string, url: URL | string) => { href = String(url); },
      },
    });
    stubGlobal("localStorage", storageApi);
    stubGlobal("sessionStorage", storageApi);
    stubGlobal("CSS", { escape: (value: string) => value });
    stubGlobal("requestAnimationFrame", (callback: () => void) => callback());

    const verification = deferred<{ ok: boolean; json: () => Promise<{ correct: boolean }> }>();
    const fetchMock = mock.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/events") return { ok: true, json: async () => ({}) };
      if (url === "/api/puzzle" && init?.method === "POST") return verification.promise;
      const seed = new URL(url, "https://example.test").searchParams.get("seed")!;
      return { ok: true, status: 200, json: async () => puzzleResponse(seed, `${seed}-token`) };
    });
    stubGlobal("fetch", fetchMock);

    mountApp({ mascotUrl: "/mascot.png", markUrl: "/mark.png" });
    await flush();

    const click = (button: Partial<FakeButton>) => listeners.get("click")!({
      target: { closest: () => ({ id: "", disabled: false, dataset: {}, ...button }) },
    });
    click({ dataset: { square: "club|Aki|Lions" } });
    click({ dataset: { square: "club|Ben|Wolves" } });
    click({ id: "check-solution" });
    await flush();
    assert.ok((root.innerHTML).includes("Tako is checking your solution"));

    click({ dataset: { course: "beginner-2" } });
    await flush();
    assert.ok((root.innerHTML).includes("Beginner Level 2"));
    const newCourseUi = root.innerHTML;

    verification.resolve({ ok: true, json: async () => ({ correct: true }) });
    await flush();
    await flush();

    assert.strictEqual(storage.get(PROGRESS_STORAGE_KEY), undefined);
    assert.strictEqual(root.innerHTML, newCourseUi);
    assert.ok(!(root.innerHTML).includes("Level complete!"));
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
    stubGlobal("document", { querySelector: () => root, activeElement: null });
    stubGlobal("window", {
      get location() { return new URL(href); },
      matchMedia: () => ({ matches: false }),
      addEventListener: () => undefined,
      history: {
        pushState: (_state: unknown, _unused: string, url: URL | string) => { href = String(url); },
        replaceState: (_state: unknown, _unused: string, url: URL | string) => { href = String(url); },
      },
    });
    stubGlobal("localStorage", storageApi);
    stubGlobal("sessionStorage", storageApi);
    stubGlobal("CSS", { escape: (value: string) => value });
    stubGlobal("requestAnimationFrame", (callback: () => void) => callback());
    stubGlobal("crypto", { randomUUID: () => "puzzle-b" });

    const hint = deferred<{ ok: boolean; json: () => Promise<{ kind: string; clue: { id: string; text: string } }> }>();
    const fetchMock = mock.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      void init;
      if (url === "/api/events") return { ok: true, json: async () => ({}) };
      if (url === "/api/hint") return hint.promise;
      if (url === "/api/clue-strategies") return { ok: true, json: async () => ({ strategies: [{ clueId: "adjacent", strategy: "adjacency", confidence: 0.91 }] }) };
      const seed = new URL(url, "https://example.test").searchParams.get("seed")!;
      const clues = seed === "puzzle-a" ? [
        { id: "direct", text: "Aki trains at Lions.", constraint: { kind: "matches" } },
        { id: "adjacent", text: "Hana lives next to the fish keeper." },
      ] : [];
      return { ok: true, status: 200, json: async () => puzzleResponse(seed, `${seed}-token`, clues) };
    });
    stubGlobal("fetch", fetchMock);

    mountApp({ mascotUrl: "/mascot.png", markUrl: "/mark.png" });
    await flush();
    assert.ok((root.innerHTML).includes('class="clue-strategy" title="Reasoning strategy">Neighbours</span>'));

    const click = (button: Partial<FakeButton>) => listeners.get("click")!({
      target: { closest: () => ({ id: "", disabled: false, dataset: {}, ...button }) },
    });
    click({ dataset: { square: "club|Aki|Lions" } });
    click({ id: "hint" });
    await flush();
    assert.ok((root.innerHTML).includes("Tako is finding the next helpful nudge"));
    const hintRequest = fetchMock.mock.calls.find(({ arguments: [input] }) => String(input) === "/api/hint");
    assert.ok(hintRequest);
    const hintBody = JSON.parse(String(hintRequest.arguments[1]?.body));
    assert.deepStrictEqual(hintBody.clues, [
      { id: "direct", text: "Aki trains at Lions.", strategy: "direct_match" },
      { id: "adjacent", text: "Hana lives next to the fish keeper.", strategy: "adjacency" },
    ]);
    assert.deepStrictEqual(hintBody.board, [{ category: "Club", subject: "Aki", value: "Lions", mark: "yes" }]);

    click({ dataset: { course: "beginner-2" } });
    await flush();
    assert.ok((root.innerHTML).includes("Beginner Level 2"));
    const puzzleBUi = root.innerHTML;

    hint.resolve({ ok: true, json: async () => ({ kind: "clue", clue: { id: "old-clue", text: "An old hint" } }) });
    await flush();
    await flush();

    assert.strictEqual(root.innerHTML, puzzleBUi);
    assert.strictEqual(storage.get("tako-bako.board.puzzle-b"), undefined);
    assert.strictEqual(storage.get("tako-bako.clues.puzzle-b"), undefined);
    assert.ok(!(root.innerHTML).includes("An old hint"));
  });

  it("returns to the seedless landing page when navigating Back from a started puzzle", async () => {
    const listeners = new Map<string, (event: { target: { closest: () => FakeButton | null } }) => void>();
    const windowListeners = new Map<string, () => void>();
    const seedInput = { value: "https://example.test/?seed=shared-seed&template=tournament-order-v2&difficulty=2", focus: () => undefined };
    const root = {
      innerHTML: "",
      addEventListener: (name: string, listener: (event: { target: { closest: () => FakeButton | null } }) => void) => listeners.set(name, listener),
      querySelector: (selector: string) => selector === "#landing-seed-input" ? seedInput : null,
    };
    let href = "https://example.test/";
    const storage = new Map<string, string>();
    const storageApi = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) };
    stubGlobal("document", { querySelector: () => root, activeElement: null });
    stubGlobal("window", {
      get location() { return new URL(href); },
      matchMedia: () => ({ matches: false }),
      addEventListener: (name: string, listener: () => void) => windowListeners.set(name, listener),
      history: {
        pushState: (_state: unknown, _unused: string, url: URL | string) => { href = String(url); },
        replaceState: (_state: unknown, _unused: string, url: URL | string) => { href = String(url); },
      },
    });
    stubGlobal("localStorage", storageApi);
    stubGlobal("sessionStorage", storageApi);
    stubGlobal("CSS", { escape: (value: string) => value });
    stubGlobal("requestAnimationFrame", (callback: () => void) => callback());
    stubGlobal("crypto", { randomUUID: () => "reproducible-seed" });
    const fetchMock = mock.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "/api/events") return { ok: true, json: async () => ({}) };
      const seed = new URL(url, "https://example.test").searchParams.get("seed")!;
      return { ok: true, status: 200, json: async () => puzzleResponse(seed, `${seed}-token`) };
    });
    stubGlobal("fetch", fetchMock);

    mountApp({ mascotUrl: "/mascot.png", markUrl: "/mark.png" });
    const click = (button: Partial<FakeButton>) => listeners.get("click")!({
      target: { closest: () => ({ id: "", disabled: false, dataset: {}, ...button }) },
    });
    click({ id: "start-puzzle" });
    await flush();

    assert.ok((href).includes("seed=reproducible-seed"));
    assert.ok((root.innerHTML).includes('id="share-puzzle"'));

    href = "https://example.test/";
    windowListeners.get("popstate")!();
    await flush();

    assert.strictEqual(href, "https://example.test/");
    assert.ok((root.innerHTML).includes('class="landing-state"'));
    assert.ok((root.innerHTML).includes('id="start-puzzle"'));
    assert.ok((root.innerHTML).includes('class="progress-management" aria-labelledby="progress-summary"'));
    assert.ok((root.innerHTML).includes('class="progress-management__summary"'));
    assert.ok((root.innerHTML).includes('class="disclosure progress-settings"'));
    assert.ok(!(root.innerHTML).includes('id="share-puzzle"'));
    assert.strictEqual(fetchMock.mock.calls.filter(({ arguments: [input] }) => String(input).startsWith("/api/puzzle?")).length, 1);

    click({ id: "open-shared-puzzle" });
    assert.ok((root.innerHTML).includes('id="shared-puzzle"'));
    click({ id: "open-landing-seed" });
    await flush();

    const sharedRequest = fetchMock.mock.calls.find(({ arguments: [input] }) => String(input).includes("seed=shared-seed"));
    assert.ok(sharedRequest);
    const sharedUrl = new URL(String(sharedRequest.arguments[0]), "https://example.test");
    assert.strictEqual(sharedUrl.searchParams.get("templateId"), "tournament-order-v2");
    assert.strictEqual(sharedUrl.searchParams.get("difficultyLevel"), "2");
    assert.ok((href).includes("mode=shared"));
  });

  it("records an incorrect answer without completing course progress", async () => {
    const app = mountTestPuzzle("incorrect-answer", async (input, init) => {
      const url = String(input);
      if (url === "/api/events") return new Response("{}", { status: 202 });
      if (url === "/api/puzzle" && init?.method === "POST") return new Response(JSON.stringify({ correct: false }), { status: 200 });
      return new Response(JSON.stringify(puzzleResponse("incorrect-answer", "signed-token")), { status: 200, headers: { "content-type": "application/json" } });
    });
    await flush();

    app.click({ dataset: { square: "club|Aki|Lions" } });
    app.click({ dataset: { square: "club|Ben|Wolves" } });
    app.click({ id: "check-solution" });
    await flush();

    assert.ok(app.root.innerHTML.includes("Not quite yet. Your notes are saved"));
    assert.strictEqual(app.storage.get(PROGRESS_STORAGE_KEY), undefined);
  });

  it("shows verification failures as errors", async () => {
    const app = mountTestPuzzle("verification-error", async (input, init) => {
      const url = String(input);
      if (url === "/api/events") return new Response("{}", { status: 202 });
      if (url === "/api/puzzle" && init?.method === "POST") return new Response("{}", { status: 502 });
      return new Response(JSON.stringify(puzzleResponse("verification-error", "signed-token")), { status: 200, headers: { "content-type": "application/json" } });
    });
    await flush();

    app.click({ dataset: { square: "club|Aki|Lions" } });
    app.click({ dataset: { square: "club|Ben|Wolves" } });
    app.click({ id: "check-solution" });
    await flush();

    assert.ok(app.root.innerHTML.includes('class="status status--error"'));
    assert.ok(app.root.innerHTML.includes("Tako can’t check your solution just now"));
  });

  it("resets one grid or the full board with Undo restoring the previous marks", async () => {
    const app = mountTestPuzzle("board-reset", async (input) => {
      const url = String(input);
      if (url === "/api/events") return new Response("{}", { status: 202 });
      return new Response(JSON.stringify(puzzleResponse("board-reset", "signed-token", [], [{ id: "weight", label: "Weight", values: ["light", "heavy"] }])), { status: 200, headers: { "content-type": "application/json" } });
    });
    await flush();
    const key = "tako-bako.board.board-reset";
    const savedBoard = () => JSON.parse(app.storage.get(key) ?? "{}");

    app.click({ dataset: { square: "club|Aki|Lions" } });
    app.click({ dataset: { square: "weight|Aki|light" } });
    app.click({ dataset: { gridReset: "club" } });
    app.click({ id: "confirm-grid-reset" });

    assert.deepStrictEqual(savedBoard(), { "weight|Aki|light": "yes" });
    app.click({ id: "undo" });
    assert.deepStrictEqual(savedBoard(), { "club|Aki|Lions": "yes", "weight|Aki|light": "yes" });

    app.click({ id: "reset-board" });
    app.click({ id: "confirm-board-reset" });
    assert.deepStrictEqual(savedBoard(), {});
    app.click({ id: "undo" });
    assert.deepStrictEqual(savedBoard(), { "club|Aki|Lions": "yes", "weight|Aki|light": "yes" });
  });

  it("applies a successful clue hint and persists the used clue ID", async () => {
    const app = mountTestPuzzle("hint-success", async (input) => {
      const url = String(input);
      if (url === "/api/events") return new Response("{}", { status: 202 });
      if (url === "/api/clue-strategies") return new Response(JSON.stringify({ strategies: [] }), { status: 200 });
      if (url === "/api/hint") return new Response(JSON.stringify({ kind: "clue", clue: { id: "first", text: "Start with the order clue." } }), { status: 200 });
      return new Response(JSON.stringify(puzzleResponse("hint-success", "signed-token", [{ id: "first", text: "Start with the order clue." }])), { status: 200, headers: { "content-type": "application/json" } });
    });
    await flush();

    app.click({ id: "hint" });
    await flush();

    assert.ok(app.root.innerHTML.includes("Hint: Start with the order clue."));
    assert.strictEqual(app.storage.get("tako-bako.clues.hint-success"), JSON.stringify(["first"]));
  });
});

describe("dialog keyboard navigation", () => {
  it("routes Tab and Shift+Tab through the active dialog focus trap", () => {
    const listeners = new Map<string, (event: { target: { closest: () => FakeButton | null } }) => void>();
    let activeElement: HTMLElement | null = null;
    const first = { focus: () => { activeElement = first; } } as HTMLElement;
    const last = { focus: () => { activeElement = last; } } as HTMLElement;
    const dialog = { querySelectorAll: () => [first, last] };
    const root = {
      innerHTML: "",
      addEventListener: (name: string, listener: (event: { target: { closest: () => FakeButton | null } }) => void) => listeners.set(name, listener),
      querySelector: (selector: string) => selector === "#challenge-menu-dialog" ? dialog : null,
    };
    stubGlobal("document", { querySelector: () => root, get activeElement() { return activeElement; } });
    stubGlobal("window", {
      location: new URL("https://example.test/"),
      matchMedia: () => ({ matches: false }),
      addEventListener: () => undefined,
      history: { pushState: () => undefined, replaceState: () => undefined },
    });
    const storage = new Map<string, string>();
    const storageApi = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) };
    stubGlobal("localStorage", storageApi);
    stubGlobal("sessionStorage", storageApi);
    stubGlobal("CSS", { escape: (value: string) => value });
    stubGlobal("requestAnimationFrame", (callback: () => void) => callback());

    mountApp({ mascotUrl: "/mascot.png", markUrl: "/mark.png" });
    listeners.get("click")!({ target: { closest: () => ({ id: "challenge-menu", disabled: false, dataset: {} }) } });
    activeElement = first;
    let prevented = false;
    const keydown = (shiftKey: boolean) => listeners.get("keydown")!({
      target: { closest: () => null },
      key: "Tab",
      shiftKey,
      preventDefault: () => { prevented = true; },
    } as never);

    keydown(false);
    assert.strictEqual(activeElement, last);
    keydown(true);
    assert.strictEqual(activeElement, first);
    assert.strictEqual(prevented, true);
  });

  it("moves focus through grid cells and tabs, then closes the challenge dialog with Escape", async () => {
    const listeners = new Map<string, (event: never) => void>();
    let activeElement: unknown = null;
    let href = "https://example.test/?seed=keyboard&mode=challenge&tier=beginner&level=1";
    const symbols = new Map<string, { textContent: string }>();
    const cells = new Map<string, { dataset: Record<string, string>; disabled: boolean; className: string; focus: () => void; setAttribute: (name: string, value: string) => void; querySelector: () => { textContent: string } }>();
    const tabs = new Map<string, { dataset: Record<string, string>; focus: () => void }>();
    const getCell = (key: string) => {
      if (!cells.has(key)) {
        const symbol = { textContent: "" };
        symbols.set(key, symbol);
        const cell = { dataset: { square: key }, disabled: false, className: "mark mark-unknown", focus: () => { activeElement = cell; }, setAttribute: () => undefined, querySelector: () => symbol };
        cells.set(key, cell);
      }
      return cells.get(key)!;
    };
    const getTab = (id: string) => {
      if (!tabs.has(id)) {
        const tab = { dataset: { gridTab: id }, focus: () => { activeElement = tab; } };
        tabs.set(id, tab);
      }
      return tabs.get(id)!;
    };
    const returnFocusButton = { focus: () => { activeElement = returnFocusButton; } };
    const root = {
      innerHTML: "",
      addEventListener: (name: string, listener: (event: never) => void) => listeners.set(name, listener),
      querySelector: (selector: string) => {
        const cellMatch = /^\[data-square="(.*)"\]$/.exec(selector);
        if (cellMatch) return getCell(cellMatch[1]!);
        const tabMatch = /^\[data-grid-tab="(.*)"\]$/.exec(selector);
        if (tabMatch) return getTab(tabMatch[1]!);
        if (selector === "#challenge-menu") return returnFocusButton;
        return null;
      },
    };
    const storage = new Map<string, string>();
    const storageApi = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) };
    stubGlobal("document", { querySelector: () => root, get activeElement() { return activeElement; } });
    stubGlobal("window", {
      get location() { return new URL(href); },
      matchMedia: () => ({ matches: false }),
      addEventListener: () => undefined,
      history: { pushState: (_state: unknown, _unused: string, url: URL | string) => { href = String(url); }, replaceState: (_state: unknown, _unused: string, url: URL | string) => { href = String(url); } },
    });
    stubGlobal("localStorage", storageApi);
    stubGlobal("sessionStorage", storageApi);
    stubGlobal("CSS", { escape: (value: string) => value });
    stubGlobal("requestAnimationFrame", (callback: () => void) => callback());
    stubGlobal("fetch", mock.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "/api/events") return new Response("{}", { status: 202 });
      const seed = new URL(url, "https://example.test").searchParams.get("seed")!;
      const data = puzzleResponse(seed, `${seed}-token`);
      data.spec.categories.push({ id: "weight", label: "Weight", values: ["-60 kg", "-66 kg"] });
      return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
    }));

    mountApp({ mascotUrl: "/mascot.png", markUrl: "/mark.png" });
    await flush();
    const click = (button: Partial<FakeButton>) => listeners.get("click")!({ target: { closest: () => ({ id: "", disabled: false, dataset: {}, ...button }) } } as never);
    let prevented = false;
    const keydown = (target: { closest: (selector: string) => unknown }, key: string) => listeners.get("keydown")!({ target, key, shiftKey: false, preventDefault: () => { prevented = true; } } as never);

    const firstCell = getCell("club|Aki|Lions");
    keydown({ closest: selector => selector === "button[data-square]" ? firstCell : null }, "ArrowRight");
    assert.strictEqual(activeElement, getCell("club|Aki|Wolves"));
    assert.strictEqual(prevented, true);

    const firstTab = getTab("club");
    keydown({ closest: selector => selector === "button[data-grid-tab]" ? firstTab : null }, "ArrowRight");
    assert.strictEqual(activeElement, getTab("weight"));

    click({ id: "challenge-menu" });
    keydown({ closest: () => null }, "Escape");
    assert.ok(!root.innerHTML.includes("challenge-menu-dialog"));
    assert.strictEqual(activeElement, returnFocusButton);
    assert.strictEqual(symbols.get("club|Aki|Lions")?.textContent, "");
  });
});
