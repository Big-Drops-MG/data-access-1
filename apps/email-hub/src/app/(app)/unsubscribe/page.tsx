import { redirect } from "next/navigation"

type Search = Record<string, string | string[] | undefined>

function searchSuffix(searchParams: Search): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      query.set(key, value)
    } else if (Array.isArray(value)) {
      for (const entry of value) {
        query.append(key, entry)
      }
    }
  }
  const text = query.toString()
  return text ? `?${text}` : ""
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const params = await searchParams
  redirect(`/suppression/unsubscribe${searchSuffix(params)}`)
}
