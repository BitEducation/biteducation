/**
 * E2E hook: tests run `window.__PD_FAST__ = true` through Playwright's
 * addInitScript to make every animation and pause instant. The app never sets it.
 */
export function fastMode(): boolean {
  return (globalThis as { __PD_FAST__?: unknown }).__PD_FAST__ === true;
}
