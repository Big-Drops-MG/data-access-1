type PresentConflict = (onReload: () => void) => void

let presenter: PresentConflict | null = null

/** Registered by `ConflictDialogProvider` for mutation-cache 409 handling. */
export function registerConflictPresenter(next: PresentConflict | null): void {
  presenter = next
}

export function presentConflictFromCache(onReload: () => void): void {
  presenter?.(onReload)
}
