"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { EtDateTime } from "@/components/app/et-datetime"
import { StatusBadge } from "@/components/app/status-badge"
import type { ManagedUserListItem } from "@/features/users/api"
import { roleLabel } from "@/features/users/users-ui"

export type UserRow = ManagedUserListItem

function statusVariant(status: UserRow["status"]) {
  if (status === "active") return "ok"
  if (status === "invited") return "info"
  return "neutral"
}

function statusLabel(status: UserRow["status"]) {
  if (status === "active") return "Active"
  if (status === "invited") return "Invited"
  return "Disabled"
}

export const usersColumns: ColumnDef<UserRow, unknown>[] = [
  {
    id: "name",
    accessorFn: (row) => row.name ?? "",
    header: "Name",
    cell: ({ row }) => {
      const display = row.original.name?.trim() || "—"
      return (
        <span className="block truncate font-medium text-fg" title={display}>
          {display}
        </span>
      )
    },
    enableHiding: false,
  },
  {
    id: "email",
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => (
      <span
        className="block truncate text-[13px] text-fg"
        title={row.original.email}
      >
        {row.original.email}
      </span>
    ),
    enableHiding: false,
  },
  {
    id: "role",
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => (
      <span className="text-[13px] font-medium text-fg">
        {roleLabel(row.original.role)}
      </span>
    ),
  },
  {
    id: "two_factor",
    accessorFn: (row) =>
      row.status === "deactivated"
        ? "Removed"
        : row.two_factor_locked
          ? "Locked"
          : row.two_factor_enabled
            ? "Enrolled"
            : "Not enrolled",
    header: "Two-step verification",
    cell: ({ row }) => {
      const item = row.original
      if (item.status === "deactivated") {
        return <span className="text-[13px] text-fg-muted">Removed</span>
      }
      if (item.status === "invited") {
        return (
          <span className="text-[13px] text-fg-muted">Not enrolled yet</span>
        )
      }
      if (item.two_factor_locked) {
        return (
          <span className="text-danger text-[13px] font-medium">
            Locked · needs Admin reset
          </span>
        )
      }
      if (item.two_factor_enabled) {
        return <span className="text-[13px] text-fg-muted">Enrolled</span>
      }
      return <span className="text-[13px] text-fg-muted">Not enrolled yet</span>
    },
  },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <StatusBadge variant={statusVariant(row.original.status)}>
        {statusLabel(row.original.status)}
      </StatusBadge>
    ),
  },
  {
    id: "last_sign_in_at",
    accessorKey: "last_sign_in_at",
    header: "Last sign-in (ET)",
    cell: ({ row }) =>
      row.original.last_sign_in_at ? (
        <EtDateTime
          value={row.original.last_sign_in_at}
          className="text-[13px] text-fg-muted"
        />
      ) : (
        <span className="text-[13px] text-fg-muted">—</span>
      ),
  },
]
