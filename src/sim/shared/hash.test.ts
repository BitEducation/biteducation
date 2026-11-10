import { describe, expect, it } from "vitest";
import { base64, sha1, textBytes } from "./hash.ts";

const hex = (b: number[]) => b.map((x) => x.toString(16).padStart(2, "0")).join("");

describe("sha1 and base64", () => {
  it("matches the FIPS examples", () => {
    expect(hex(sha1(textBytes("abc")))).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    expect(hex(sha1([]))).toBe("da39a3ee5e6b4b0d3255bfef95601890afd80709");
    expect(hex(sha1(textBytes("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")))).toBe(
      "84983e441c3bd26ebaae4aa1f95129e5e54670f1",
    );
  });
  it("base64 pads correctly", () => {
    expect(base64(textBytes("Ma"))).toBe("TWE=");
    expect(base64(textBytes("M"))).toBe("TQ==");
    expect(base64(textBytes("Man"))).toBe("TWFu");
  });
  it("reproduces the WebSocket accept example of RFC 6455", () => {
    const key = "dGhlIHNhbXBsZSBub25jZQ==";
    expect(base64(sha1(textBytes(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)))).toBe(
      "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=",
    );
  });
});
