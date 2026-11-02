import type { DnsRecord, Domain, DomainSetupStep } from "@workspace/db"

function isoUtc(value: Date): string {
  return value.toISOString()
}

export type DomainJson = {
  id: string
  name: string
  ses_identity_arn: string | null
  status: Domain["status"]
  created_by: string | null
  created_at: string
  updated_at: string
  verified_at: string | null
}

export type DnsRecordJson = {
  id: string
  domain_id: string
  purpose: DnsRecord["purpose"]
  name: string
  record_type: string
  expected_value: string
  last_seen_value: string | null
  status: DnsRecord["status"]
  last_checked_at: string | null
  created_at: string
  updated_at: string
}

export type DomainSetupStepJson = {
  id: string
  domain_id: string
  step: DomainSetupStep["step"]
  status: DomainSetupStep["status"]
  error: string | null
  started_at: string | null
  completed_at: string | null
  updated_at: string
}

export function serializeDomain(row: Domain): DomainJson {
  return {
    id: row.id,
    name: row.name,
    ses_identity_arn: row.sesIdentityArn,
    status: row.status,
    created_by: row.createdBy,
    created_at: isoUtc(row.createdAt),
    updated_at: isoUtc(row.updatedAt),
    verified_at: row.verifiedAt ? isoUtc(row.verifiedAt) : null,
  }
}

export function serializeDnsRecord(row: DnsRecord): DnsRecordJson {
  return {
    id: row.id,
    domain_id: row.domainId,
    purpose: row.purpose,
    name: row.name,
    record_type: row.recordType,
    expected_value: row.expectedValue,
    last_seen_value: row.lastSeenValue,
    status: row.status,
    last_checked_at: row.lastCheckedAt ? isoUtc(row.lastCheckedAt) : null,
    created_at: isoUtc(row.createdAt),
    updated_at: isoUtc(row.updatedAt),
  }
}

export function serializeDomainSetupStep(
  row: DomainSetupStep
): DomainSetupStepJson {
  return {
    id: row.id,
    domain_id: row.domainId,
    step: row.step,
    status: row.status,
    error: row.error,
    started_at: row.startedAt ? isoUtc(row.startedAt) : null,
    completed_at: row.completedAt ? isoUtc(row.completedAt) : null,
    updated_at: isoUtc(row.updatedAt),
  }
}
