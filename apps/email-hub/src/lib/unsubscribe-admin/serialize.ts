export type UnsubscribeOptOutJson = {
  id: string
  kind: "category" | "all"
  email: string | null
  recipient_id: string | null
  category_id: string | null
  category_key: string | null
  category_name: string | null
  source: string
  occurred_at: string
}

export type UnsubscribeDnsRecordJson = {
  type: "CNAME" | "TXT"
  host: string
  value: string
}

export type UnsubscribeSettingsJson = {
  id: string
  logo_url: string | null
  custom_domain: string | null
  custom_domain_status: "unset" | "pending" | "verified" | "failed"
  verification_token: string | null
  verified_at: string | null
  public_base_url: string
  hub_host: string
  dns_records: UnsubscribeDnsRecordJson[]
  updated_at: string
}
