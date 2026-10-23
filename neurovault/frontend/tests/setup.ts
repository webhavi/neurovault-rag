import "@testing-library/jest-dom/vitest";

// jsdom lacks matchMedia — used by the settings store.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)" ? false : false,
    media: query,
    onchange: null,
    addEventListener: () => () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

// jsdom lacks WebGL — the 3D scene gracefully falls back in tests.
window.HTMLCanvasElement.prototype.getContext = () => null;

// jsdom lacks layout APIs used by the workspace.
Element.prototype.scrollIntoView = () => {};
