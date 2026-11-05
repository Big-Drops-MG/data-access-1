import { describe, expect, it, vi } from "vitest"

import {
  assertBullBoardMutationAllowed,
  classifyBullBoardMutation,
} from "./bull-board-guards"

describe("classifyBullBoardMutation", () => {
  it("ignores reads", () => {
    expect(classifyBullBoardMutation("GET", "/api/queues")).toBeNull()
    expect(
      classifyBullBoardMutation("GET", "/api/queues/send-email")
    ).toBeNull()
  })

  it("classifies pause resume clean retry for Bull Board v9", () => {
    expect(
      classifyBullBoardMutation("PUT", "/api/queues/send-email/pause")
    ).toEqual({ kind: "pause", queueName: "send-email" })
    expect(
      classifyBullBoardMutation("PUT", "/api/queues/send-email/resume")
    ).toEqual({ kind: "resume", queueName: "send-email" })
    expect(classifyBullBoardMutation("PUT", "/api/queues/pause")).toEqual({
      kind: "pause",
    })
    expect(
      classifyBullBoardMutation("PUT", "/api/queues/dispatch/clean/completed")
    ).toEqual({ kind: "clean", queueName: "dispatch", status: "completed" })
    expect(
      classifyBullBoardMutation("PUT", "/api/queues/send-email/abc/retry")
    ).toEqual({ kind: "retry", queueName: "send-email", jobId: "abc" })
    expect(
      classifyBullBoardMutation("PUT", "/api/queues/send-email/retry/failed")
    ).toEqual({ kind: "retry", queueName: "send-email" })
  })

  it("classifies payload edits and job deletes", () => {
    expect(
      classifyBullBoardMutation(
        "PATCH",
        "/api/queues/send-email/job-1/update-data"
      )
    ).toEqual({
      kind: "update_data",
      queueName: "send-email",
      jobId: "job-1",
    })
    expect(
      classifyBullBoardMutation("PUT", "/api/queues/send-email/job-1/clean")
    ).toEqual({
      kind: "clean",
      queueName: "send-email",
      jobId: "job-1",
    })
  })
})

describe("assertBullBoardMutationAllowed", () => {
  it("blocks payload edits", async () => {
    const result = await assertBullBoardMutationAllowed(
      { kind: "update_data", queueName: "send-email", jobId: "1" },
      new Map()
    )
    expect(result).toEqual({
      ok: false,
      status: 403,
      message: "Editing job payloads is not allowed",
    })
  })

  it("blocks cleaning waiting send-email jobs", async () => {
    const getState = vi.fn().mockResolvedValue("waiting")
    const getJob = vi.fn().mockResolvedValue({ getState })
    const queues = new Map([["send-email", { getJob } as never]])

    await expect(
      assertBullBoardMutationAllowed(
        { kind: "clean", queueName: "send-email", jobId: "msg-1" },
        queues
      )
    ).resolves.toEqual({
      ok: false,
      status: 403,
      message: "Deleting waiting send-email jobs is not allowed",
    })
  })

  it("blocks clean-all of waiting send-email jobs", async () => {
    await expect(
      assertBullBoardMutationAllowed(
        { kind: "clean", queueName: "send-email", status: "waiting" },
        new Map()
      )
    ).resolves.toEqual({
      ok: false,
      status: 403,
      message: "Deleting waiting send-email jobs is not allowed",
    })
  })

  it("allows cleaning failed send-email jobs", async () => {
    const getState = vi.fn().mockResolvedValue("failed")
    const getJob = vi.fn().mockResolvedValue({ getState })
    const queues = new Map([["send-email", { getJob } as never]])

    const result = await assertBullBoardMutationAllowed(
      { kind: "clean", queueName: "send-email", jobId: "msg-1" },
      queues
    )
    expect(result).toEqual({ ok: true })
  })
})
