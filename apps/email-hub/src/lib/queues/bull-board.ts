import { createBullBoard } from "@bull-board/api"
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter"
import { HonoAdapter } from "@bull-board/hono"
import { serveStatic } from "@hono/node-server/serve-static"
import { getDb } from "@workspace/db/client"
import { BULLMQ_PREFIX, loadServerEnv, writeAudit } from "@workspace/shared"
import { Queue } from "bullmq"
import { Hono, type Context, type Next } from "hono"
import { Redis } from "ioredis"
import { createRequire } from "node:module"
import path from "node:path"

import type { SessionUser } from "@/lib/auth"
import { getSession } from "@/lib/auth"
import { hasAtLeastRole } from "@/lib/permissions"

import {
  assertBullBoardMutationAllowed,
  auditActionForMutation,
  classifyBullBoardMutation,
} from "./bull-board-guards"
import { ADMIN_QUEUE_NAMES } from "./names"

export const BULL_BOARD_BASE_PATH = "/admin/queues"

function resolveBullBoardUiBasePath(): string {
  const fallback = path.join(process.cwd(), "node_modules", "@bull-board", "ui")
  try {
    const nodeRequire = createRequire(path.join(process.cwd(), "package.json"))
    return path.dirname(nodeRequire.resolve("@bull-board/ui/package.json"))
  } catch {
    return fallback
  }
}

type BoardState = {
  app: Hono
  queues: Map<string, Queue>
  redis: Redis
}

let boardState: BoardState | undefined

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || null
  }
  return request.headers.get("x-real-ip")
}

async function requireAdminSession(): Promise<
  { user: SessionUser } | { response: Response }
> {
  const session = await getSession()
  if (!session) {
    return {
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }
  if (!hasAtLeastRole(session, "admin")) {
    return {
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    }
  }
  return { user: session }
}

function createBoardState(): BoardState {
  const env = loadServerEnv("web")
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })
  const queues = new Map<string, Queue>()
  const adapters: BullMQAdapter[] = []

  for (const name of ADMIN_QUEUE_NAMES) {
    const queue = new Queue(name, {
      connection: redis,
      prefix: BULLMQ_PREFIX,
    })
    queues.set(name, queue)
    adapters.push(new BullMQAdapter(queue))
  }

  const serverAdapter = new HonoAdapter(serveStatic)
  serverAdapter.setBasePath(BULL_BOARD_BASE_PATH)

  createBullBoard({
    queues: adapters,
    serverAdapter,
    options: {
      uiBasePath: resolveBullBoardUiBasePath(),
    },
  })

  const board = new Hono()
  board.route(BULL_BOARD_BASE_PATH, serverAdapter.registerPlugin())

  const app = new Hono()

  const guard = async (c: Context, next: Next) => {
    const auth = await requireAdminSession()
    if ("response" in auth) {
      return auth.response
    }

    const url = new URL(c.req.url)
    const relativePath = url.pathname.startsWith(BULL_BOARD_BASE_PATH)
      ? url.pathname.slice(BULL_BOARD_BASE_PATH.length) || "/"
      : url.pathname

    const mutation = classifyBullBoardMutation(c.req.method, relativePath)
    if (mutation) {
      const allowed = await assertBullBoardMutationAllowed(mutation, queues)
      if (!allowed.ok) {
        return Response.json(
          { error: allowed.message },
          { status: allowed.status }
        )
      }
    }

    await next()

    if (
      mutation &&
      (mutation.kind === "retry" ||
        mutation.kind === "pause" ||
        mutation.kind === "resume" ||
        mutation.kind === "clean") &&
      c.res.ok
    ) {
      try {
        await writeAudit(getDb(), {
          actor: { type: "user", id: auth.user.id },
          action: auditActionForMutation(mutation),
          objectType: "queue",
          objectId: mutation.queueName ?? BULL_BOARD_BASE_PATH,
          requestId: c.req.header("x-request-id"),
          after: mutation,
          ip: clientIp(c.req.raw),
          userAgent: c.req.header("user-agent"),
        })
      } catch (error) {
        void error
      }
    }
  }

  app.use(BULL_BOARD_BASE_PATH, guard)
  app.use(`${BULL_BOARD_BASE_PATH}/*`, guard)
  app.route("/", board)

  return { app, queues, redis }
}

export function getBullBoardApp(): Hono {
  if (!boardState) {
    boardState = createBoardState()
  }
  return boardState.app
}
