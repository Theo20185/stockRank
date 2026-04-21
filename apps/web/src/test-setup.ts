import "@testing-library/jest-dom/vitest";

// jsdom in this Node 25 / vitest 3 combo ships a `localStorage` global
// whose methods are all undefined. Replace with a minimal in-memory
// implementation so anything reaching for setItem/getItem/removeItem
// just works in tests.
function createMemoryStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(store).length;
    },
    clear: () => {
      store = {};
    },
    getItem: (key: string) => (key in store ? store[key]! : null),
    key: (i: number) => Object.keys(store)[i] ?? null,
    removeItem: (key: string) => {
      delete store[key];
    },
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
  };
}

Object.defineProperty(globalThis, "localStorage", {
  value: createMemoryStorage(),
  writable: true,
  configurable: true,
});
