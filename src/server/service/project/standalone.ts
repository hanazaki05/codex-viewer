import { homedir } from "node:os";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";

export const standaloneProjectsRootPath = resolve(
  homedir(),
  "Documents",
  "Codex",
);

const standaloneDateSegmentPattern = /^\d{4}-\d{2}-\d{2}$/;

const isPathInside = (targetPath: string, rootPath: string) => {
  const rel = relative(rootPath, targetPath);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

export const isStandaloneProjectPath = (
  workspacePath: string,
  rootPath = standaloneProjectsRootPath,
) => {
  const resolvedWorkspacePath = resolve(workspacePath);
  const resolvedRootPath = resolve(rootPath);

  if (!isPathInside(resolvedWorkspacePath, resolvedRootPath)) {
    return false;
  }

  const segments = relative(resolvedRootPath, resolvedWorkspacePath)
    .split(sep)
    .filter(Boolean);

  return (
    segments.length === 2 &&
    standaloneDateSegmentPattern.test(segments[0] ?? "") &&
    (segments[1]?.length ?? 0) > 0
  );
};

export const getProjectDisplayName = (
  workspacePath: string,
  rootPath = standaloneProjectsRootPath,
) => {
  const workspaceName = basename(workspacePath);
  return isStandaloneProjectPath(workspacePath, rootPath)
    ? `[standalone] ${workspaceName}`
    : workspaceName;
};
