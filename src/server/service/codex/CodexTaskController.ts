import { spawn } from "node:child_process";
import readline from "node:readline";
import prexit from "prexit";
import { ulid } from "ulid";

import { type EventBus, getEventBus } from "../events/EventBus";
import { encodeSessionId } from "../session/id";
import {
  findLatestSessionForWorkspace,
  findSessionRecordByUuid,
} from "./sessionFiles";
import type {
  CodexTask,
  CodexTaskStatus,
  SerializableAliveTask,
} from "./types";

type StartSessionOptions = {
  cwd: string;
  projectId: string;
  sessionUuid?: string;
  sessionPathId?: string;
};

type LaunchOptions = {
  message: string;
  requestId: string;
  cwd: string;
  projectId: string;
  sessionUuid?: string;
  sessionPathId?: string;
};

export class CodexTaskController {
  private tasks: CodexTask[] = [];
  private eventBus: EventBus;

  constructor() {
    this.eventBus = getEventBus();

    prexit(() => {
      for (const task of this.tasks) {
        if (task.process) {
          try {
            task.process.kill("SIGTERM");
          } catch (error) {
            console.warn("Failed to terminate Codex task", error);
          }
        }
      }
    });
  }

  public get aliveTasks(): CodexTask[] {
    return this.tasks.filter(
      (task) => task.status === "running" || task.status === "waiting",
    );
  }

  public getSerializableAliveTasks(): SerializableAliveTask[] {
    return this.aliveTasks.map((task) => this.serializeTask(task));
  }

  private findTask(
    sessionUuid?: string,
    sessionPathId?: string,
  ): CodexTask | null {
    if (sessionUuid) {
      const match = this.tasks.find((task) => task.sessionUuid === sessionUuid);
      if (match) {
        return match;
      }
    }
    if (sessionPathId) {
      const match = this.tasks.find(
        (task) => task.sessionPathId === sessionPathId,
      );
      if (match) {
        return match;
      }
    }
    return null;
  }

  public async startOrContinueTask(
    currentSession: StartSessionOptions,
    message: string,
  ): Promise<SerializableAliveTask> {
    const requestId = ulid();
    const existing = this.findTask(
      currentSession.sessionUuid,
      currentSession.sessionPathId,
    );

    if (!existing) {
      const task: CodexTask = {
        id: ulid(),
        projectId: currentSession.projectId,
        cwd: currentSession.cwd,
        status: "running",
        sessionUuid: currentSession.sessionUuid ?? null,
        sessionPathId: currentSession.sessionPathId ?? null,
        userMessageId: requestId,
        process: null,
        queue: [],
      };
      this.tasks.push(task);
      return await this.launchProcess(task, {
        message,
        requestId,
        cwd: currentSession.cwd,
        projectId: currentSession.projectId,
        sessionUuid: currentSession.sessionUuid,
        sessionPathId: currentSession.sessionPathId,
      });
    }

    if (existing.status === "running") {
      return await new Promise<SerializableAliveTask>((resolve, reject) => {
        existing.queue.push({ message, requestId, resolve, reject });
        this.emitTaskChange();
      });
    }

    return await this.launchProcess(existing, {
      message,
      requestId,
      cwd: existing.cwd,
      projectId: existing.projectId,
      sessionUuid: existing.sessionUuid ?? currentSession.sessionUuid,
      sessionPathId: existing.sessionPathId ?? currentSession.sessionPathId,
    });
  }

  public abortTask(sessionPathId: string) {
    const task = this.findTask(undefined, sessionPathId);
    if (!task) {
      throw new Error("Alive Codex task not found");
    }

    if (task.process) {
      try {
        task.process.kill("SIGTERM");
      } catch (error) {
        console.warn("Failed to abort Codex task", error);
      }
    }

    task.process = null;
    task.status = "failed";
    this.rejectQueuedMessages(task, new Error("Task aborted"));
    this.emitTaskChange();
    this.pruneTaskIfInactive(task);
  }

  private async launchProcess(
    task: CodexTask,
    options: LaunchOptions,
  ): Promise<SerializableAliveTask> {
    task.status = "running";
    task.userMessageId = options.requestId;
    if (options.sessionUuid) {
      task.sessionUuid = options.sessionUuid;
    }
    if (options.sessionPathId) {
      task.sessionPathId = options.sessionPathId;
    }
    this.emitTaskChange();

    return await new Promise<SerializableAliveTask>((resolve, reject) => {
      let resolved = false;
      const processStart = Date.now();

      const resolveIfPossible = () => {
        if (!resolved && task.sessionUuid && task.sessionPathId) {
          resolved = true;
          resolve(this.serializeTask(task));
        }
      };

      const rejectOnce = (error: unknown) => {
        if (!resolved) {
          resolved = true;
          reject(error);
        }
      };

      const args = [
        "exec",
        "--experimental-json",
        "--full-auto",
        "-c",
        'sandbox_workspace_write={network_access=true,writable_roots=["~/.cache","~/.uv"]}',
        "--cd",
        options.cwd,
      ];

      if (options.sessionUuid) {
        args.push("resume", options.sessionUuid);
      }

      const childEnv = {
        ...process.env,
        CODEX_ORIGINATOR: "codex_viewer",
      } as NodeJS.ProcessEnv & { RUST_LOG?: string; CODEX_ORIGINATOR?: string };
      if (!childEnv.RUST_LOG) {
        childEnv.RUST_LOG = "warn,codex_core::mcp_connection_manager=off";
      }

      const child = spawn("codex", args, {
        cwd: options.cwd,
        env: childEnv,
        stdio: ["pipe", "pipe", "pipe"],
      });

      task.process = child;

      // stdin経由でメッセージを送信（SDK方式）
      if (child.stdin) {
        child.stdin.write(options.message);
        child.stdin.end();
        child.stdin.on("error", (error) => {
          console.error("Codex stdin error:", error);
        });
      } else {
        child.kill();
        rejectOnce(new Error("Child process has no stdin"));
        return;
      }

      const rl = readline.createInterface({ input: child.stdout });

      const updateStatus = (status: CodexTaskStatus) => {
        if (task.status !== status) {
          task.status = status;
          this.emitTaskChange();
        }
      };

      const ensureSessionPath = (attempt = 0) => {
        if (task.sessionPathId && task.sessionUuid) {
          resolveIfPossible();
          return;
        }

        const assignRecord = (
          record:
            | Awaited<ReturnType<typeof findSessionRecordByUuid>>
            | Awaited<ReturnType<typeof findLatestSessionForWorkspace>>
            | null,
        ) => {
          if (!record) {
            if (task.process && attempt < 10) {
              setTimeout(() => ensureSessionPath(attempt + 1), 500);
            }
            return;
          }
          if (!task.sessionPathId) {
            task.sessionPathId = encodeSessionId(record.filePath);
          }
          if (!task.sessionUuid && record.sessionUuid) {
            task.sessionUuid = record.sessionUuid;
          }
          this.emitTaskChange();
          resolveIfPossible();
        };

        if (task.sessionUuid) {
          void findSessionRecordByUuid(task.sessionUuid).then((record) => {
            if (record) {
              assignRecord(record);
              return;
            }
            void findLatestSessionForWorkspace(task.cwd, processStart).then(
              assignRecord,
            );
          });
        } else {
          void findLatestSessionForWorkspace(task.cwd, processStart).then(
            assignRecord,
          );
        }
      };

      if (options.sessionUuid) {
        task.sessionUuid = options.sessionUuid;
        ensureSessionPath();
      }

      rl.on("line", (line) => {
        const trimmed = line.trim();
        if (trimmed.length === 0) {
          return;
        }
        try {
          const parsed = JSON.parse(trimmed) as {
            type?: string;
            thread_id?: string;
            payload?: unknown;
          };

          // thread.started から即座にセッションIDを取得
          if (parsed.type === "thread.started" && parsed.thread_id) {
            task.sessionUuid = parsed.thread_id;
            this.emitTaskChange();
            ensureSessionPath();
          }

          // session_meta からのフォールバック（互換性のため維持）
          if (
            parsed.type === "session_meta" &&
            parsed.payload &&
            typeof parsed.payload === "object" &&
            parsed.payload !== null &&
            "id" in parsed.payload
          ) {
            const sessionIdValue = (parsed.payload as { id?: unknown }).id;
            if (typeof sessionIdValue === "string" && !task.sessionUuid) {
              task.sessionUuid = sessionIdValue;
              this.emitTaskChange();
              ensureSessionPath();
            }
          }

          if (parsed.type === "event_msg" && parsed.payload) {
            const payload = parsed.payload as { type?: string };
            if (payload.type === "turn_aborted") {
              updateStatus("waiting");
            }
          }
        } catch (error) {
          console.warn("Failed to parse Codex exec output", { error, line });
        }
      });

      child.stderr.on("data", (data) => {
        console.error("Codex exec error:", data.toString());
      });

      child.on("exit", (code) => {
        rl.close();
        child.removeAllListeners();
        task.process = null;
        if (task.status === "running") {
          updateStatus(code === 0 ? "completed" : "failed");
        }
        if (task.status === "failed") {
          this.rejectQueuedMessages(task, new Error("Codex task failed"));
        }

        ensureSessionPath();

        if (task.queue.length > 0) {
          const next = task.queue.shift();
          if (!next) {
            this.emitTaskChange();
            this.pruneTaskIfInactive(task);
            resolveIfPossible();
            return;
          }
          this.launchProcess(task, {
            message: next.message,
            requestId: next.requestId,
            cwd: task.cwd,
            projectId: task.projectId,
            sessionUuid: task.sessionUuid ?? options.sessionUuid,
            sessionPathId: task.sessionPathId ?? options.sessionPathId,
          })
            .then(next.resolve)
            .catch(next.reject);
          return;
        }

        if (task.status === "waiting") {
          this.emitTaskChange();
          resolveIfPossible();
          return;
        }

        this.emitTaskChange();
        this.pruneTaskIfInactive(task);
        resolveIfPossible();
      });

      child.on("error", (error) => {
        rl.close();
        child.removeAllListeners();
        task.process = null;
        updateStatus("failed");
        this.emitTaskChange();
        this.pruneTaskIfInactive(task);
        rejectOnce(error);
      });

      rl.on("close", () => {
        resolveIfPossible();
      });
    });
  }

  private pruneTaskIfInactive(task: CodexTask) {
    if (task.status === "waiting") {
      return;
    }
    if (task.queue.length > 0) {
      return;
    }
    this.tasks = this.tasks.filter((candidate) => candidate.id !== task.id);
  }

  private rejectQueuedMessages(task: CodexTask, reason: Error) {
    while (task.queue.length > 0) {
      const queued = task.queue.shift();
      if (queued) {
        queued.reject(reason);
      }
    }
  }

  private serializeTask(task: CodexTask): SerializableAliveTask {
    return {
      id: task.id,
      status: task.status,
      sessionId: task.sessionPathId,
      sessionUuid: task.sessionUuid,
      userMessageId: task.userMessageId,
    };
  }

  private emitTaskChange() {
    this.eventBus.emit("task_changed", {
      type: "task_changed",
      data: this.getSerializableAliveTasks(),
    });
  }
}
