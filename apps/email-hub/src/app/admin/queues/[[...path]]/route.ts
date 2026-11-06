import { getSession } from "@/lib/auth"
import { buildLoginPath } from "@/lib/login/login-path"
import { hasAtLeastRole } from "@/lib/permissions"
import { getBullBoardApp } from "@/lib/queues/bull-board"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function handle(request: Request): Promise<Response> {
  const session = await getSession()
  const url = new URL(request.url)
  const next = `${url.pathname}${url.search}`

  if (!session) {
    return new Response(null, {
      status: 307,
      headers: { Location: buildLoginPath({ next }) },
    })
  }
  if (!hasAtLeastRole(session, "admin")) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  return getBullBoardApp().fetch(request)
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
