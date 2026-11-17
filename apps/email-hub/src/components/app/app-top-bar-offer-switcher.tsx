"use client"

import { useState } from "react"
import { ChevronDownIcon } from "lucide-react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

import { useOfferSelection } from "@/components/app/offer-provider"

function offerLabel(offer: {
  name: string
  everflow_offer_id: number | null
  external_ref: string
}): string {
  if (offer.everflow_offer_id != null) {
    return `${offer.name} (#${offer.everflow_offer_id})`
  }
  return offer.name || offer.external_ref
}

/** Workspace offer picker — scopes Hub modules to one Everflow-imported offer. */
export function AppTopBarOfferSwitcher() {
  const {
    offers,
    selectedOffer,
    selectedOfferId,
    setSelectedOfferId,
    isLoading,
  } = useOfferSelection()
  const [open, setOpen] = useState(false)

  const triggerLabel = selectedOffer
    ? offerLabel(selectedOffer)
    : isLoading
      ? "Loading offers…"
      : offers.length === 0
        ? "No offers"
        : "Select offer"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        className={cn(
          "inline-flex h-9 max-w-[18rem] items-center gap-1.5 rounded-md border border-border bg-bg px-3 text-left text-[13px] font-medium text-fg outline-none",
          "hover:bg-surface-2 focus-visible:shadow-[0_0_0_3px_var(--ring)]"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Selected offer"
        data-testid="app-top-bar-offer-switcher"
      >
        <span className="min-w-0 truncate">{triggerLabel}</span>
        <ChevronDownIcon
          className="size-4 shrink-0 text-fg-muted"
          aria-hidden
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-72 gap-0.5 border border-border bg-surface-2 p-1 shadow-md dark:border-border-strong dark:shadow-[0_12px_40px_rgb(0_0_0_/_0.55)] dark:ring-1 dark:ring-white/12"
        data-testid="app-top-bar-offer-menu"
      >
        {offers.length === 0 ? (
          <p className="px-3 py-2 text-sm text-fg-muted">
            Import an offer from Everflow under Admin → Offers.
          </p>
        ) : (
          <ul
            className="m-0 max-h-72 list-none overflow-y-auto p-0"
            role="listbox"
          >
            {offers.map((offer) => {
              const selected = offer.id === selectedOfferId
              return (
                <li key={offer.id} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-sm transition-colors outline-none",
                      selected
                        ? "bg-accent/10 font-medium text-fg"
                        : "text-fg hover:bg-surface"
                    )}
                    data-testid={`app-top-bar-offer-${offer.id}`}
                    onClick={() => {
                      setSelectedOfferId(offer.id)
                      setOpen(false)
                    }}
                  >
                    <span className="w-full truncate">{offer.name}</span>
                    <span className="font-mono text-[11px] text-fg-muted">
                      {offer.everflow_offer_id != null
                        ? `EF ${offer.everflow_offer_id}`
                        : offer.external_ref}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
