/**
 * Reflection and amplification as bandwidth arithmetic: a small request with a forged source
 * makes a reflector send a large reply to the victim. Sizes are illustrative orders of magnitude,
 * not measurements; nothing here builds or sends packets.
 */
export interface Reflector {
  proto: "dns" | "ntp";
  name: string;
  request: number;
  response: number;
}

export const REFLECTORS: Record<Reflector["proto"], Reflector> = {
  dns: { proto: "dns", name: "DNS aberto", request: 60, response: 3000 },
  ntp: { proto: "ntp", name: "NTP com comando de monitoramento antigo", request: 48, response: 26400 },
};

export const factor = (r: Reflector) => r.response / r.request;

export interface Flood {
  /** Mbit/s the attacker sends with forged sources. */
  sent: number;
  /** Mbit/s arriving at the victim. */
  arriving: number;
  /** arriving / victim link. */
  overload: number;
}

export function flood(r: Reflector, attackerMbps: number, victimMbps: number, spoofable = 1): Flood {
  const sent = attackerMbps * spoofable;
  const arriving = sent * factor(r);
  return { sent, arriving, overload: arriving / victimMbps };
}

/** Reflectors with response-rate limiting: each sends at most `perSecond` replies to one destination. */
export function rateLimited(r: Reflector, reflectors: number, perSecond: number): number {
  return (reflectors * perSecond * r.response * 8) / 1e6;
}

/** Requests per second the attacker needs to keep `reflectors` busy at full rate. */
export const requestsPerSecond = (r: Reflector, attackerMbps: number) =>
  (attackerMbps * 1e6) / (r.request * 8);
