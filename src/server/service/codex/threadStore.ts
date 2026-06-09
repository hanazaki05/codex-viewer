import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";
import { codexStateDbPath } from "../paths";

const execFileAsync = promisify(execFile);

const escapeSqlString = (value: string) => value.replaceAll("'", "''");

const normalizeTitle = (title: string) => {
  const normalized = title.trim();
  return normalized.length > 0 ? normalized : null;
};

const canUseDb = async (dbPath: string) => {
  try {
    await access(dbPath);
    return true;
  } catch {
    return false;
  }
};

type ThreadTitleRow = {
  id?: unknown;
  rollout_path?: unknown;
  title?: unknown;
};

export const getCodexThreadTitle = async ({
  sessionUuid,
  rolloutPath,
  dbPath = codexStateDbPath,
}: {
  sessionUuid: string | null;
  rolloutPath: string;
  dbPath?: string;
}): Promise<string | null> => {
  const predicates: string[] = [];

  if (sessionUuid && sessionUuid.trim().length > 0) {
    predicates.push(`id = '${escapeSqlString(sessionUuid.trim())}'`);
  }
  if (rolloutPath.trim().length > 0) {
    predicates.push(`rollout_path = '${escapeSqlString(rolloutPath.trim())}'`);
  }
  if (predicates.length === 0) {
    return null;
  }

  if (!(await canUseDb(dbPath))) {
    return null;
  }

  const sql = [
    "SELECT title FROM threads",
    `WHERE (${predicates.join(" OR ")})`,
    "AND trim(title) <> ''",
    "LIMIT 1;",
  ].join(" ");

  try {
    const { stdout } = await execFileAsync("sqlite3", [
      "-batch",
      "-noheader",
      dbPath,
      sql,
    ]);
    return normalizeTitle(stdout);
  } catch (error) {
    console.warn("Failed to read Codex thread title", { error, dbPath });
    return null;
  }
};

export const getCodexThreadTitles = async ({
  sessions,
  dbPath = codexStateDbPath,
}: {
  sessions: Array<{ sessionUuid: string | null; rolloutPath: string }>;
  dbPath?: string;
}): Promise<Map<string, string>> => {
  const ids = new Set<string>();
  const rolloutPaths = new Set<string>();

  for (const session of sessions) {
    if (session.sessionUuid && session.sessionUuid.trim().length > 0) {
      ids.add(session.sessionUuid.trim());
    }
    if (session.rolloutPath.trim().length > 0) {
      rolloutPaths.add(session.rolloutPath.trim());
    }
  }

  if (ids.size === 0 && rolloutPaths.size === 0) {
    return new Map();
  }

  if (!(await canUseDb(dbPath))) {
    return new Map();
  }

  const predicates: string[] = [];
  if (ids.size > 0) {
    predicates.push(
      `id IN (${[...ids].map((id) => `'${escapeSqlString(id)}'`).join(", ")})`,
    );
  }
  if (rolloutPaths.size > 0) {
    predicates.push(
      `rollout_path IN (${[...rolloutPaths]
        .map((rolloutPath) => `'${escapeSqlString(rolloutPath)}'`)
        .join(", ")})`,
    );
  }

  const sql = [
    "SELECT id, rollout_path, title FROM threads",
    `WHERE (${predicates.join(" OR ")})`,
    "AND trim(title) <> '';",
  ].join(" ");

  try {
    const { stdout } = await execFileAsync("sqlite3", [
      "-batch",
      "-json",
      dbPath,
      sql,
    ]);
    const rows = JSON.parse(stdout) as ThreadTitleRow[];
    const titles = new Map<string, string>();

    for (const row of rows) {
      if (typeof row.title !== "string") {
        continue;
      }
      const title = normalizeTitle(row.title);
      if (!title) {
        continue;
      }
      if (typeof row.id === "string" && !titles.has(row.id)) {
        titles.set(row.id, title);
      }
      if (
        typeof row.rollout_path === "string" &&
        !titles.has(row.rollout_path)
      ) {
        titles.set(row.rollout_path, title);
      }
    }

    return titles;
  } catch (error) {
    console.warn("Failed to read Codex thread titles", { error, dbPath });
    return new Map();
  }
};
