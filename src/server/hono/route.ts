import { zValidator } from "@hono/zod-validator";
import { setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { sessionToTitle } from "../../lib/sessionTitle";
import { configSchema } from "../config/config";
import { CodexTaskController } from "../service/codex/CodexTaskController";
import {
  listSessionsForWorkspace,
  readSessionHeader,
} from "../service/codex/sessionFiles";
import { getEventBus } from "../service/events/EventBus";
import { getFileWatcher } from "../service/events/fileWatcher";
import { sseEventResponse } from "../service/events/sseEventResponse";
import { getFileCompletion } from "../service/file-completion/getFileCompletion";
import { getBranches } from "../service/git/getBranches";
import { getCommits } from "../service/git/getCommits";
import { getDiff } from "../service/git/getDiff";
import { getMcpList } from "../service/mcp/getMcpList";
import { getProject } from "../service/project/getProject";
import { getProjectMetaFromSessionRecords } from "../service/project/getProjectMeta";
import { getProjects } from "../service/project/getProjects";
import { decodeProjectId } from "../service/project/id";
import {
  DeleteSessionError,
  deleteSession,
} from "../service/session/deleteSession";
import { getSession } from "../service/session/getSession";
import { getSessionsFromRecords } from "../service/session/getSessions";
import { decodeSessionId } from "../service/session/id";
import type { HonoAppType } from "./app";
import { configMiddleware } from "./middleware/config.middleware";

export const routes = (app: HonoAppType) => {
  const taskController = new CodexTaskController();

  return (
    app
      // middleware
      .use(configMiddleware)

      // routes
      .get("/config", async (c) => {
        return c.json({
          config: c.get("config"),
        });
      })

      .put("/config", zValidator("json", configSchema), async (c) => {
        const { ...config } = c.req.valid("json");

        setCookie(c, "ccv-config", JSON.stringify(config));

        return c.json({
          config,
        });
      })

      .get("/projects", async (c) => {
        const { projects } = await getProjects();
        return c.json({ projects });
      })

      .get("/projects/:projectId", async (c) => {
        const { projectId } = c.req.param();
        const workspacePath = decodeProjectId(projectId);
        const sessionRecords = await listSessionsForWorkspace(workspacePath);
        const projectMeta = getProjectMetaFromSessionRecords(
          workspacePath,
          sessionRecords,
        );

        if (sessionRecords.length === 0) {
          const { project } = await getProject(projectId);
          return c.json({ project, sessions: [] });
        }

        const { sessions } = await getSessionsFromRecords(sessionRecords).then(
          ({ sessions }) => {
            let filteredSessions = sessions;

            // Filter sessions based on hideNoUserMessageSession setting
            if (c.get("config").hideNoUserMessageSession) {
              filteredSessions = filteredSessions.filter((session) => {
                return session.meta.firstCommand !== null;
              });
            }

            // Unify sessions with same title if unifySameTitleSession is enabled
            if (c.get("config").unifySameTitleSession) {
              const sessionMap = new Map<
                string,
                (typeof filteredSessions)[0]
              >();

              for (const session of filteredSessions) {
                // Generate title for comparison
                const title = sessionToTitle(session, session.id);

                const existingSession = sessionMap.get(title);
                if (existingSession) {
                  // Keep the session with the latest modification date
                  if (
                    session.meta.lastModifiedAt &&
                    existingSession.meta.lastModifiedAt
                  ) {
                    if (
                      new Date(session.meta.lastModifiedAt) >
                      new Date(existingSession.meta.lastModifiedAt)
                    ) {
                      sessionMap.set(title, session);
                    }
                  } else if (
                    session.meta.lastModifiedAt &&
                    !existingSession.meta.lastModifiedAt
                  ) {
                    sessionMap.set(title, session);
                  }
                  // If no modification dates, keep the existing one
                } else {
                  sessionMap.set(title, session);
                }
              }

              filteredSessions = Array.from(sessionMap.values());
            }

            return {
              sessions: filteredSessions,
            };
          },
        );

        const project = {
          id: projectId,
          workspacePath,
          meta: projectMeta,
        };

        return c.json({ project, sessions });
      })

      .get("/projects/:projectId/sessions/:sessionId", async (c) => {
        const { projectId, sessionId } = c.req.param();
        const { session } = await getSession(projectId, sessionId);
        return c.json({ session });
      })

      .delete("/projects/:projectId/sessions/:sessionId", async (c) => {
        const { projectId, sessionId } = c.req.param();

        try {
          const body = await c.req.json().catch(() => ({}));
          const parsedBody = z
            .object({
              deleteProject: z.boolean().optional().default(false),
            })
            .safeParse(body);

          if (!parsedBody.success) {
            return c.json({ error: "Invalid delete session request" }, 400);
          }

          const result = await deleteSession(
            projectId,
            sessionId,
            {
              taskController,
            },
            {
              deleteProject: parsedBody.data.deleteProject,
            },
          );
          return c.json(result);
        } catch (error) {
          if (error instanceof DeleteSessionError) {
            return c.json({ error: error.message }, error.status);
          }

          console.error("Delete session error:", error);
          return c.json({ error: "Failed to delete session" }, 500);
        }
      })

      .get(
        "/projects/:projectId/file-completion",
        zValidator(
          "query",
          z.object({
            basePath: z.string().optional().default("/"),
          }),
        ),
        async (c) => {
          const { projectId } = c.req.param();
          const { basePath } = c.req.valid("query");

          const { project } = await getProject(projectId);

          if (!project.meta.workspacePath) {
            return c.json({ error: "Project path not found" }, 400);
          }

          try {
            const result = await getFileCompletion(
              project.meta.workspacePath,
              basePath,
            );
            return c.json(result);
          } catch (error) {
            console.error("File completion error:", error);
            return c.json({ error: "Failed to get file completion" }, 500);
          }
        },
      )

      .get("/projects/:projectId/git/branches", async (c) => {
        const { projectId } = c.req.param();
        const { project } = await getProject(projectId);

        if (!project.meta.workspacePath) {
          return c.json({ error: "Project path not found" }, 400);
        }

        try {
          const result = await getBranches(project.meta.workspacePath);
          return c.json(result);
        } catch (error) {
          console.error("Get branches error:", error);
          if (error instanceof Error) {
            return c.json({ error: error.message }, 400);
          }
          return c.json({ error: "Failed to get branches" }, 500);
        }
      })

      .get("/projects/:projectId/git/commits", async (c) => {
        const { projectId } = c.req.param();
        const { project } = await getProject(projectId);

        if (!project.meta.workspacePath) {
          return c.json({ error: "Project path not found" }, 400);
        }

        try {
          const result = await getCommits(project.meta.workspacePath);
          return c.json(result);
        } catch (error) {
          console.error("Get commits error:", error);
          if (error instanceof Error) {
            return c.json({ error: error.message }, 400);
          }
          return c.json({ error: "Failed to get commits" }, 500);
        }
      })

      .post(
        "/projects/:projectId/git/diff",
        zValidator(
          "json",
          z.object({
            fromRef: z.string().min(1, "fromRef is required"),
            toRef: z.string().min(1, "toRef is required"),
          }),
        ),
        async (c) => {
          const { projectId } = c.req.param();
          const { fromRef, toRef } = c.req.valid("json");
          const { project } = await getProject(projectId);

          if (!project.meta.workspacePath) {
            return c.json({ error: "Project path not found" }, 400);
          }

          try {
            const result = await getDiff(
              project.meta.workspacePath,
              fromRef,
              toRef,
            );
            return c.json(result);
          } catch (error) {
            console.error("Get diff error:", error);
            if (error instanceof Error) {
              return c.json({ error: error.message }, 400);
            }
            return c.json({ error: "Failed to get diff" }, 500);
          }
        },
      )

      .get("/mcp/list", async (c) => {
        const { servers } = await getMcpList();
        return c.json({ servers });
      })

      .post(
        "/projects/:projectId/new-session",
        zValidator(
          "json",
          z.object({
            message: z.string(),
          }),
        ),
        async (c) => {
          const { projectId } = c.req.param();
          const { message } = c.req.valid("json");
          const { project } = await getProject(projectId);

          if (!project.meta.workspacePath) {
            return c.json({ error: "Project path not found" }, 400);
          }

          const task = await taskController.startOrContinueTask(
            {
              projectId,
              cwd: project.meta.workspacePath,
            },
            message,
          );

          return c.json({
            taskId: task.id,
            sessionId: task.sessionId,
            sessionUuid: task.sessionUuid,
            userMessageId: task.userMessageId,
          });
        },
      )

      .post(
        "/projects/:projectId/sessions/:sessionId/resume",
        zValidator(
          "json",
          z.object({
            resumeMessage: z.string(),
          }),
        ),
        async (c) => {
          const { projectId, sessionId } = c.req.param();
          const { resumeMessage } = c.req.valid("json");
          const { project } = await getProject(projectId);

          if (!project.meta.workspacePath) {
            return c.json({ error: "Project path not found" }, 400);
          }

          const sessionPath = decodeSessionId(sessionId);
          const header = await readSessionHeader(sessionPath);

          if (!header?.sessionUuid) {
            return c.json({ error: "Session UUID not found" }, 400);
          }

          const task = await taskController.startOrContinueTask(
            {
              projectId,
              sessionPathId: sessionId,
              sessionUuid: header.sessionUuid,
              cwd: project.meta.workspacePath,
            },
            resumeMessage,
          );

          return c.json({
            taskId: task.id,
            sessionId: task.sessionId,
            sessionUuid: task.sessionUuid,
            userMessageId: task.userMessageId,
          });
        },
      )

      .get("/tasks/alive", async (c) => {
        return c.json({
          aliveTasks: taskController.getSerializableAliveTasks(),
        });
      })

      .post(
        "/tasks/abort",
        zValidator("json", z.object({ sessionId: z.string() })),
        async (c) => {
          const { sessionId } = c.req.valid("json");
          taskController.abortTask(sessionId);
          return c.json({ message: "Task aborted" });
        },
      )

      .get("/events/state_changes", async (c) => {
        return streamSSE(
          c,
          async (stream) => {
            const fileWatcher = getFileWatcher();
            const eventBus = getEventBus();

            let isConnected = true;

            // ハートビート設定
            const heartbeat = setInterval(() => {
              if (isConnected) {
                eventBus.emit("heartbeat", {
                  type: "heartbeat",
                });
              }
            }, 30 * 1000);

            // connection handling
            const abortController = new AbortController();
            let connectionResolve: ((value: undefined) => void) | undefined;
            const connectionPromise = new Promise<undefined>((resolve) => {
              connectionResolve = resolve;
            });

            const onConnectionClosed = () => {
              isConnected = false;
              connectionResolve?.(undefined);
              abortController.abort();
              clearInterval(heartbeat);
            };

            // 接続終了時のクリーンアップ
            stream.onAbort(() => {
              console.log("SSE connection aborted");
              onConnectionClosed();
            });

            // イベントリスナーを登録
            console.log("Registering SSE event listeners");
            eventBus.on("connected", async (event) => {
              if (!isConnected) {
                return;
              }
              await stream.writeSSE(sseEventResponse(event)).catch(() => {
                onConnectionClosed();
              });
            });

            eventBus.on("heartbeat", async (event) => {
              if (!isConnected) {
                return;
              }
              await stream.writeSSE(sseEventResponse(event)).catch(() => {
                onConnectionClosed();
              });
            });

            eventBus.on("project_changed", async (event) => {
              if (!isConnected) {
                return;
              }

              await stream.writeSSE(sseEventResponse(event)).catch(() => {
                console.warn("Failed to write SSE event");
                onConnectionClosed();
              });
            });

            eventBus.on("session_changed", async (event) => {
              if (!isConnected) {
                return;
              }

              await stream.writeSSE(sseEventResponse(event)).catch(() => {
                onConnectionClosed();
              });
            });

            eventBus.on("task_changed", async (event) => {
              if (!isConnected) {
                return;
              }

              await stream.writeSSE(sseEventResponse(event)).catch(() => {
                onConnectionClosed();
              });
            });

            // 初期接続確認メッセージ
            eventBus.emit("connected", {
              type: "connected",
              message: "SSE connection established",
            });

            fileWatcher.startWatching();

            await connectionPromise;
          },
          async (err, stream) => {
            console.error("Streaming error:", err);
            await stream.write("エラーが発生しました。");
          },
        );
      })
  );
};

export type RouteType = ReturnType<typeof routes>;
