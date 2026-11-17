"use client"

import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

import { useOfferSelection } from "@/components/app/offer-provider"
import { filterOffersByQuery } from "@/lib/offer-filter"
import { debounceLatest, throttleLatest } from "@/lib/search-timing"

const SEARCH_DEBOUNCE_MS = 250
const SEARCH_THROTTLE_MS = 80
const LIST_MAX_HEIGHT_CLASS = "max-h-72"

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

function offerMeta(offer: {
  everflow_offer_id: number | null
  external_ref: string
}): string {
  return offer.everflow_offer_id != null
    ? `EF ${offer.everflow_offer_id}`
    : offer.external_ref
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
  const [inputValue, setInputValue] = useState("")
  const [filterQuery, setFilterQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const deferredQuery = useDeferredValue(filterQuery)

  const debouncedSetFilter = useMemo(
    () =>
      debounceLatest((value: string) => {
        setFilterQuery(value)
        setActiveIndex(0)
      }, SEARCH_DEBOUNCE_MS),
    []
  )
  const throttledSearchPipeline = useMemo(
    () =>
      throttleLatest((value: string) => {
        debouncedSetFilter(value)
      }, SEARCH_THROTTLE_MS),
    [debouncedSetFilter]
  )

  useEffect(() => {
    return () => {
      throttledSearchPipeline.cancel()
      debouncedSetFilter.cancel()
    }
  }, [throttledSearchPipeline, debouncedSetFilter])

  useEffect(() => {
    if (!open) {
      return
    }
    const frame = window.requestAnimationFrame(() => {
      searchRef.current?.focus()
      searchRef.current?.select()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  const filteredOffers = useMemo(
    () => filterOffersByQuery(offers, deferredQuery),
    [offers, deferredQuery]
  )
  const highlightIndex =
    filteredOffers.length === 0
      ? 0
      : Math.min(activeIndex, filteredOffers.length - 1)

  const triggerLabel = selectedOffer
    ? offerLabel(selectedOffer)
    : isLoading
      ? "Loading offers…"
      : offers.length === 0
        ? "No offers"
        : "Select offer"

  function resetSearch() {
    setInputValue("")
    setFilterQuery("")
    setActiveIndex(0)
    throttledSearchPipeline.cancel()
    debouncedSetFilter.cancel()
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setActiveIndex(0)
      return
    }
    resetSearch()
  }

  function selectOffer(offerId: string) {
    setSelectedOfferId(offerId)
    handleOpenChange(false)
  }

  function onSearchChange(value: string) {
    setInputValue(value)
    throttledSearchPipeline(value)
  }

  function onListKeyDown(event: KeyboardEvent) {
    if (filteredOffers.length === 0) {
      return
    }
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((index) => {
        const current = Math.min(index, filteredOffers.length - 1)
        return (current + 1) % filteredOffers.length
      })
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((index) => {
        const current = Math.min(index, filteredOffers.length - 1)
        return (current - 1 + filteredOffers.length) % filteredOffers.length
      })
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      const offer = filteredOffers[highlightIndex]
      if (offer) {
        selectOffer(offer.id)
      }
    }
  }

  const filtering = inputValue !== filterQuery || deferredQuery !== filterQuery
  const resultLabel =
    deferredQuery.trim() === ""
      ? `${filteredOffers.length} offer${filteredOffers.length === 1 ? "" : "s"}`
      : `${filteredOffers.length} match${filteredOffers.length === 1 ? "" : "es"}`

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        type="button"
        className={cn(
          "inline-flex h-9 w-full max-w-[20rem] items-center gap-2 rounded-md border border-border bg-bg px-3 text-left text-[13px] font-medium text-fg outline-none",
          "hover:bg-surface-2 focus-visible:shadow-[0_0_0_3px_var(--ring)]"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label="Selected offer"
        data-testid="app-top-bar-offer-switcher"
      >
        <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
        <ChevronDownIcon
          className="size-4 shrink-0 text-fg-muted"
          aria-hidden
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[22rem] gap-0 overflow-hidden border border-border bg-surface p-0 shadow-md dark:border-border-strong dark:shadow-[0_12px_40px_rgb(0_0_0_/_0.55)] dark:ring-1 dark:ring-white/12"
        data-testid="app-top-bar-offer-menu"
        onKeyDown={onListKeyDown}
      >
        {offers.length === 0 ? (
          <p className="px-3 py-3 text-sm text-fg-muted">
            Import an offer from Everflow under Admin → Offers.
          </p>
        ) : (
          <>
            <div className="sticky top-0 z-[1] border-b border-border bg-surface p-2">
              <label className="relative block">
                <span className="sr-only">Search offers</span>
                <SearchIcon
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-muted"
                  aria-hidden
                />
                <input
                  ref={searchRef}
                  type="search"
                  value={inputValue}
                  onChange={(event) => onSearchChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && inputValue !== "") {
                      event.preventDefault()
                      event.stopPropagation()
                      resetSearch()
                    }
                  }}
                  placeholder="Search name, ref, or EF id"
                  className={cn(
                    "h-9 w-full rounded-md border border-border bg-bg py-0 pr-3 pl-8 text-[13px] text-fg outline-none",
                    "placeholder:text-fg-muted focus-visible:shadow-[0_0_0_3px_var(--ring)]"
                  )}
                  autoComplete="off"
                  spellCheck={false}
                  data-testid="app-top-bar-offer-search"
                />
              </label>
              <p
                className="mt-1.5 px-0.5 text-[11px] text-fg-muted"
                data-testid="app-top-bar-offer-result-count"
                aria-live="polite"
              >
                {resultLabel}
                {filtering ? "…" : ""}
              </p>
            </div>

            {filteredOffers.length === 0 ? (
              <p className="px-3 py-4 text-sm text-fg-muted">
                No offers match “{deferredQuery.trim()}”.
              </p>
            ) : (
              <ul
                id={listId}
                className={cn(
                  "m-0 list-none overflow-y-auto overscroll-contain p-1",
                  LIST_MAX_HEIGHT_CLASS
                )}
                role="listbox"
                aria-label="Offers"
              >
                {filteredOffers.map((offer, index) => {
                  const selected = offer.id === selectedOfferId
                  const active = index === highlightIndex
                  return (
                    <li key={offer.id} role="none">
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={cn(
                          "flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors outline-none",
                          selected
                            ? "bg-accent/10 font-medium text-fg"
                            : "text-fg hover:bg-surface-2",
                          active && !selected ? "bg-surface-2" : null,
                          active
                            ? "shadow-[inset_0_0_0_1px_var(--border)]"
                            : null
                        )}
                        data-testid={`app-top-bar-offer-${offer.id}`}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => selectOffer(offer.id)}
                      >
                        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                          {selected ? (
                            <CheckIcon
                              className="size-3.5 text-fg"
                              aria-hidden
                            />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block w-full truncate">
                            {offer.name}
                          </span>
                          <span className="mt-0.5 block font-mono text-[11px] text-fg-muted">
                            {offerMeta(offer)}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
