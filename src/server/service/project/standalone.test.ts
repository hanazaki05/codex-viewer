import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getProjectDisplayName, isStandaloneProjectPath } from "./standalone";

describe("standalone project paths", () => {
  it("detects Codex Desktop projectless workspace directories", () => {
    const rootPath = join("/", "Users", "tester", "Documents", "Codex");
    const workspacePath = join(rootPath, "2026-05-15", "example-prompt");

    expect(isStandaloneProjectPath(workspacePath, rootPath)).toBe(true);
  });

  it("rejects ordinary workspaces and partial Codex directories", () => {
    const rootPath = join("/", "Users", "tester", "Documents", "Codex");

    expect(
      isStandaloneProjectPath(
        join("/", "Users", "tester", "Projects", "example"),
        rootPath,
      ),
    ).toBe(false);
    expect(
      isStandaloneProjectPath(join(rootPath, "2026-05-15"), rootPath),
    ).toBe(false);
    expect(
      isStandaloneProjectPath(
        join(rootPath, "2026-05-15", "example", "nested"),
        rootPath,
      ),
    ).toBe(false);
  });

  it("prefixes standalone project display names", () => {
    const rootPath = join("/", "Users", "tester", "Documents", "Codex");
    const workspacePath = join(rootPath, "2026-05-15", "example-prompt");

    expect(getProjectDisplayName(workspacePath, rootPath)).toBe(
      "[standalone] example-prompt",
    );
  });
});
