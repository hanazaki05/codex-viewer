import { hc } from "hono/client";
import type { RouteType } from "../../server/hono/route";

// biome-ignore lint/complexity/useLiteralKeys: TypeScript restriction
const internalOrigin = process.env["CC_VIEWER_INTERNAL_ORIGIN"];
// biome-ignore lint/complexity/useLiteralKeys: TypeScript restriction
const port = process.env["PORT"] ?? 3000;

export const honoClient = hc<RouteType>(
  typeof window === "undefined"
    ? (internalOrigin ?? `http://localhost:${port}/`)
    : "/",
);
