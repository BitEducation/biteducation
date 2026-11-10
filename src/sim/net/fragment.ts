/**
 * IPv4 fragmentation (RFC 791, CN 5.5): a router splits a datagram whose total length exceeds the
 * next link's MTU. Every fragment but the last carries a multiple of 8 data bytes; the offset is
 * counted in 8-byte units and MF is set on all but the last. With DF set the router drops it.
 */

export interface Fragment {
  offset: number;
  data: number;
  total: number;
  mf: boolean;
}

export function fragment(total: number, header: number, mtu: number): Fragment[] {
  const data = total - header;
  const chunk = Math.floor((mtu - header) / 8) * 8;
  const out: Fragment[] = [];
  for (let at = 0; at < data; at += chunk) {
    const len = Math.min(chunk, data - at);
    out.push({ offset: at / 8, data: len, total: len + header, mf: at + len < data });
  }
  return out;
}

/** The datagram is lost if any fragment is: 1 - (1 - p)^n. */
export const lossAll = (p: number, n: number) => 1 - (1 - p) ** n;

/**
 * A fragment that meets an even smaller MTU is cut again. Offsets stay relative to the original
 * datagram, and every piece keeps MF = 1 unless it is the tail of the original last fragment.
 */
export function refragment(f: Fragment, header: number, mtu: number): Fragment[] {
  if (f.total <= mtu) return [f];
  return fragment(f.total, header, mtu).map((x) => ({
    ...x,
    offset: f.offset + x.offset,
    mf: x.mf || f.mf,
  }));
}
