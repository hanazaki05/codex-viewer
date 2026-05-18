import { describe, expect, it } from "vitest";
import { decodeProjectId, encodeProjectId } from "./id";

describe("project id codec", () => {
  it("round-trips workspace path", () => {
    const workspacePath = "/Users/tester/workspaces/codex-viewer";
    const encoded = encodeProjectId(workspacePath);

    expect(decodeProjectId(encoded)).toBe(workspacePath);
  });

  it("produces URL-safe base64 strings", () => {
    const workspacePath = "/tmp/workspace+with=special/chars?";
    const encoded = encodeProjectId(workspacePath);

    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
  });
});
