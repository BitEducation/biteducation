/**
 * Whether a downgrade from HTTPS to HTTP is possible for a man in the middle, given what the
 * browser already knows. A model of the decision only; no traffic is produced.
 */
export interface BrowserState {
  /** The site sends Strict-Transport-Security. */
  hsts: boolean;
  /** The browser completed a secure visit before and stored the HSTS policy. */
  visited: boolean;
  /** The domain is on the browser's built-in preload list. */
  preload: boolean;
}

export interface FirstHop {
  /** Scheme of the first request that leaves the machine. */
  scheme: "http" | "https";
  /** Whether the browser upgraded internally, before any network traffic. */
  internalUpgrade: boolean;
  strippable: boolean;
  /** With HSTS active, certificate errors cannot be clicked through. */
  hardFail: boolean;
}

export function firstHop(s: BrowserState): FirstHop {
  const known = s.preload || (s.hsts && s.visited);
  return { scheme: known ? "https" : "http", internalUpgrade: known, strippable: !known, hardFail: known };
}

export const daysOf = (maxAgeSeconds: number) => Math.floor(maxAgeSeconds / 86400);
