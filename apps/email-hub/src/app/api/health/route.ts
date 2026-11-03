import { NextResponse } from "next/server"

import { withApiRequest } from "@/lib/with-api-request"

async function handleGet(): Promise<NextResponse> {
  return NextResponse.json({ ok: true })
}

export const GET = withApiRequest(handleGet)
