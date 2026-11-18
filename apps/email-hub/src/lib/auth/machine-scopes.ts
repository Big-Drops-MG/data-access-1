export const MACHINE_SCOPES = [
  "emails:send",
  "emails:read",
  "arohaa:webhook",
] as const

export type MachineScope = (typeof MACHINE_SCOPES)[number]
