import { getBullBoardApp } from "@/lib/queues/bull-board"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function handle(request: Request): Promise<Response> {
  return getBullBoardApp().fetch(request)
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
