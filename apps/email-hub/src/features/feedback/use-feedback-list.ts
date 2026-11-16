"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import {
  fetchFeedbackList,
  type FeedbackListParams,
} from "@/features/feedback/api"
import { listQueryOptions } from "@/lib/query-options"

export function useFeedbackList(params: FeedbackListParams = {}) {
  return useQuery({
    ...listQueryOptions("feedback", () => fetchFeedbackList(params), params),
    placeholderData: keepPreviousData,
  })
}
