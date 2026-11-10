/**
 * Internet checksum (RFC 1071): one's complement of the one's-complement sum of 16-bit words.
 * An odd trailing byte is padded with a zero on the right.
 */
export function inetChecksum(bytes: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 2) {
    sum += ((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0);
    sum = (sum & 0xffff) + (sum >>> 16);
  }
  sum = (sum & 0xffff) + (sum >>> 16);
  return ~sum & 0xffff;
}
