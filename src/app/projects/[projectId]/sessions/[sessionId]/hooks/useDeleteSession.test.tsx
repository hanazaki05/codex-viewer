// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import React, { type PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { projectQueryConfig } from "../../../hooks/useProject";
import { useDeleteSession } from "./useDeleteSession";

void React;

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: PropsWithChildren) => {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
};

afterEach(() => {
  cleanup();
});

describe("useDeleteSession", () => {
  it("calls the delete endpoint and invalidates related queries", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );
    const projectId = "project-123";
    const sessionId = "session-456";

    const { result } = renderHook(() => useDeleteSession(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ projectId, sessionId });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/projects/project-123/sessions/session-456",
      {
        method: "DELETE",
      },
    );
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: projectQueryConfig(projectId).queryKey,
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["sessions"],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["sessions", sessionId],
    });
  });

  it("surfaces backend conflict errors for active sessions", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "Cannot delete a session that is currently running or waiting",
        }),
        {
          status: 409,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    const { result } = renderHook(() => useDeleteSession(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          projectId: "project-123",
          sessionId: "session-456",
        });
      }),
    ).rejects.toThrow(
      "Cannot delete a session that is currently running or waiting",
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
