import { describe, expect, it } from "vitest";
import { decodeSessionId, encodeSessionId } from "./id";

describe("session id codec", () => {
  it("round-trips file paths with spaces", () => {
    const filePath =
      "/Users/tester/Projects/my repo/.codex/sessions/2026/04/07/abc-session.jsonl";
    const encoded = encodeSessionId(filePath);
    const decoded = decodeSessionId(encoded);

    expect(decoded).toBe(filePath);
  });

  it("produces URL-safe base64 strings", () => {
    const filePath = "/tmp/demo+path/with=special/chars?.jsonl";
    const encoded = encodeSessionId(filePath);

    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
  });
});
