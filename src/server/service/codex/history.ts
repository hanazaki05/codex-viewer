import { createReadStream, existsSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";

import { codexHistoryFilePath } from "../paths";

export type CodexHistoryEntry = {
  sessionId: string;
  timestamp: Date | null;
  text: string | null;
};

const toMillis = (timestamp: number) => {
  return timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
};

let cachedHistoryMtime = 0;
let cachedHistoryMap: Map<string, Date> | null = null;

const clearHistoryCache = () => {
  cachedHistoryMtime = 0;
  cachedHistoryMap = null;
};

const parseHistoryLine = (
  line: string,
): {
  session_id?: unknown;
  ts?: unknown;
  text?: unknown;
} | null => {
  try {
    return JSON.parse(line) as {
      session_id?: unknown;
      ts?: unknown;
      text?: unknown;
    };
  } catch {
    return null;
  }
};

export const getHistoryTimestamps = async (): Promise<Map<string, Date>> => {
  if (!existsSync(codexHistoryFilePath)) {
    clearHistoryCache();
    return new Map();
  }

  const stats = await stat(codexHistoryFilePath);
  if (cachedHistoryMap && stats.mtimeMs === cachedHistoryMtime) {
    return new Map(cachedHistoryMap);
  }

  const map = new Map<string, Date>();
  const stream = createReadStream(codexHistoryFilePath, { encoding: "utf-8" });
  const reader = createInterface({
    input: stream,
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  for await (const line of reader) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const parsed = parseHistoryLine(trimmed);
    if (!parsed) {
      continue;
    }

    if (typeof parsed.session_id !== "string") {
      continue;
    }

    if (typeof parsed.ts !== "number") {
      continue;
    }

    const timestamp = new Date(toMillis(parsed.ts));
    const current = map.get(parsed.session_id);
    if (!current || timestamp > current) {
      map.set(parsed.session_id, timestamp);
    }
  }

  cachedHistoryMap = map;
  cachedHistoryMtime = stats.mtimeMs;

  return new Map(map);
};

export const readLatestHistoryEntry =
  async (): Promise<CodexHistoryEntry | null> => {
    if (!existsSync(codexHistoryFilePath)) {
      return null;
    }

    const stream = createReadStream(codexHistoryFilePath, {
      encoding: "utf-8",
    });
    const reader = createInterface({
      input: stream,
      crlfDelay: Number.POSITIVE_INFINITY,
    });

    let latestEntry: CodexHistoryEntry | null = null;
    for await (const line of reader) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }

      const parsed = parseHistoryLine(trimmed);
      if (!parsed) {
        continue;
      }

      if (typeof parsed.session_id !== "string") {
        continue;
      }

      let timestamp: Date | null = null;
      if (typeof parsed.ts === "number") {
        timestamp = new Date(toMillis(parsed.ts));
      }

      latestEntry = {
        sessionId: parsed.session_id,
        timestamp,
        text: typeof parsed.text === "string" ? parsed.text : null,
      } satisfies CodexHistoryEntry;
    }

    return latestEntry;
  };

export const removeHistoryEntriesBySessionUuid = async (
  sessionUuid: string,
  options?: {
    historyFilePath?: string;
  },
): Promise<{ removedCount: number }> => {
  const historyFilePath = options?.historyFilePath ?? codexHistoryFilePath;
  if (!existsSync(historyFilePath)) {
    return { removedCount: 0 };
  }

  const raw = await readFile(historyFilePath, "utf-8");
  const lines = raw.split(/\r?\n/);
  const keptLines: string[] = [];
  let removedCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      keptLines.push(line);
      continue;
    }

    try {
      const parsed = JSON.parse(trimmed) as {
        session_id?: unknown;
      };
      if (parsed.session_id === sessionUuid) {
        removedCount += 1;
        continue;
      }
    } catch {
      // Keep malformed lines as-is to avoid accidental data loss.
    }

    keptLines.push(line);
  }

  if (removedCount === 0) {
    return { removedCount: 0 };
  }

  const normalized = keptLines.join("\n").replace(/\n+$/, "");
  const output = normalized.length > 0 ? `${normalized}\n` : "";
  await writeFile(historyFilePath, output, "utf-8");
  clearHistoryCache();
  return { removedCount };
};
