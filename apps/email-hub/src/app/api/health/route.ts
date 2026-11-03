import { NextResponse } from "next/server"

import { handler } from "@/lib/handler"

async function handleGet(_request: Request): Promise<NextResponse> {
  return NextResponse.json({ ok: true })
}

export const GET = handler(handleGet)
