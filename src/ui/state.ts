import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { readFileSync } from "node:fs"
import { dirname } from "node:path"
import { config } from "../config.ts"
import type { AiCallDetail, LogItem, TraceItem, TraceSummaryItem } from "../domain.ts"
import { queryRuntime } from "../runtime.ts"
import { LogQueryService } from "../services/LogQueryService.ts"
import { TraceQueryService } from "../services/TraceQueryService.ts"
import type { ThemeName } from "./theme.ts"

export type LoadStatus = "loading" | "ready" | "error"
export type DetailView = "waterfall" | "span-detail" | "service-logs"

export interface TraceState {
	readonly status: LoadStatus
	readonly services: readonly string[]
	readonly data: readonly TraceSummaryItem[]
	readonly error: string | null
	readonly fetchedAt: Date | null
}

export interface TraceDetailState {
	readonly status: LoadStatus
	readonly traceId: string | null
	readonly data: TraceItem | null
	readonly error: string | null
	readonly fetchedAt: Date | null
}

export interface LogState {
	readonly status: LoadStatus
	readonly traceId: string | null
	readonly data: readonly LogItem[]
	readonly error: string | null
	readonly fetchedAt: Date | null
}

export interface ServiceLogState {
	readonly status: LoadStatus
	readonly serviceName: string | null
	readonly data: readonly LogItem[]
	readonly error: string | null
	readonly fetchedAt: Date | null
}

export const initialTraceState: TraceState = {
	status: "loading",
	services: [],
	data: [],
	error: null,
	fetchedAt: null,
}

export const initialLogState: LogState = {
	status: "ready",
	traceId: null,
	data: [],
	error: null,
	fetchedAt: null,
}

export const initialTraceDetailState: TraceDetailState = {
	status: "ready",
	traceId: null,
	data: null,
	error: null,
	fetchedAt: null,
}

export const initialServiceLogState: ServiceLogState = {
	status: "ready",
	serviceName: null,
	data: [],
	error: null,
	fetchedAt: null,
}

export const traceStateAtom = Atom.make(initialTraceState).pipe(Atom.keepAlive)
export const traceDetailStateAtom = Atom.make(initialTraceDetailState).pipe(Atom.keepAlive)
export const logStateAtom = Atom.make(initialLogState).pipe(Atom.keepAlive)
export const serviceLogStateAtom = Atom.make(initialServiceLogState).pipe(Atom.keepAlive)
export const selectedServiceLogIndexAtom = Atom.make(0).pipe(Atom.keepAlive)
export const selectedTraceIndexAtom = Atom.make(0).pipe(Atom.keepAlive)
const lastServicePath = `${dirname(config.otel.databasePath)}/last-service.txt`
const readLastService = (): string | null => {
	try { return readFileSync(lastServicePath, "utf-8").trim() || null }
	catch { return null }
}

let lastPersistedService = readLastService()

export const persistSelectedService = (service: string) => {
	if (service === lastPersistedService) return
	lastPersistedService = service
	Bun.write(lastServicePath, service).catch(() => {})
}

export const selectedTraceServiceAtom = Atom.make<string | null>(readLastService() ?? config.otel.serviceName).pipe(Atom.keepAlive)
export const refreshNonceAtom = Atom.make(0).pipe(Atom.keepAlive)
export const noticeAtom = Atom.make<string | null>(null).pipe(Atom.keepAlive)
export const selectedSpanIndexAtom = Atom.make<number | null>(null).pipe(Atom.keepAlive)
// Cursor inside the full-screen span content view (detailView === "span-detail").
// Tracks which span tag is currently selected for copy / drill-in. Reset to 0
// on each new span so the cursor doesn't point past a shorter tag list.
export const selectedAttrIndexAtom = Atom.make(0).pipe(Atom.keepAlive)
export const detailViewAtom = Atom.make<DetailView>("waterfall").pipe(Atom.keepAlive)
export const showHelpAtom = Atom.make(false).pipe(Atom.keepAlive)
export const autoRefreshAtom = Atom.make(false).pipe(Atom.keepAlive)
export const filterModeAtom = Atom.make(false).pipe(Atom.keepAlive)
export const filterTextAtom = Atom.make("").pipe(Atom.keepAlive)

// Waterfall-scoped filter: the `/` key while drilled into a trace
// (viewLevel >= 1) opens this filter instead of the trace-list one.
// Purely client-side — dims spans whose operation name and attribute
// values don't contain the needle.
export const waterfallFilterModeAtom = Atom.make(false).pipe(Atom.keepAlive)
export const waterfallFilterTextAtom = Atom.make("").pipe(Atom.keepAlive)

// Attribute filter (F key): pick a span-attribute key + exact value to restrict the trace list.
export type AttrPickerMode = "off" | "keys" | "values"
export const attrPickerModeAtom = Atom.make<AttrPickerMode>("off").pipe(Atom.keepAlive)
export const attrPickerInputAtom = Atom.make("").pipe(Atom.keepAlive)
export const attrPickerIndexAtom = Atom.make(0).pipe(Atom.keepAlive)

export interface AttrFacetState {
	readonly status: LoadStatus
	readonly key: string | null // null when loading keys; set when loading values
	readonly data: readonly { readonly value: string; readonly count: number }[]
	readonly error: string | null
}

export const initialAttrFacetState: AttrFacetState = {
	status: "ready",
	key: null,
	data: [],
	error: null,
}

export const attrFacetStateAtom = Atom.make(initialAttrFacetState).pipe(Atom.keepAlive)

// Applied filter (drives trace list query)
export const activeAttrKeyAtom = Atom.make<string | null>(null).pipe(Atom.keepAlive)
export const activeAttrValueAtom = Atom.make<string | null>(null).pipe(Atom.keepAlive)

// AI chat view (full-screen when drilled into an `isAiSpan` span).
// ---------------------------------------------------------------------
// Navigation is chunk-based: each message/tool-call/tool-result is a
// semantic unit the user can select with j/k and expand with enter.
// The scroll offset is still kept so long expanded chunks can be
// panned line-by-line if needed, but it's derived from the selected
// chunk most of the time.
// ---------------------------------------------------------------------
export const chatScrollOffsetAtom = Atom.make(0).pipe(Atom.keepAlive)
/** Chunk id currently selected (null = first chunk). */
export const selectedChatChunkIdAtom = Atom.make<string | null>(null).pipe(Atom.keepAlive)
/** Explicit expansion overrides; stored with a `!` prefix for
 *  default-open chunks the user has force-collapsed. */
export const expandedChatChunkIdsAtom = Atom.make<ReadonlySet<string>>(new Set<string>() as ReadonlySet<string>).pipe(Atom.keepAlive)

export interface AiCallDetailState {
	readonly status: LoadStatus
	readonly spanId: string | null
	readonly data: AiCallDetail | null
	readonly error: string | null
}

export const initialAiCallDetailState: AiCallDetailState = {
	status: "ready",
	spanId: null,
	data: null,
	error: null,
}

export const aiCallDetailStateAtom = Atom.make(initialAiCallDetailState).pipe(Atom.keepAlive)

const lastThemePath = `${dirname(config.otel.databasePath)}/last-theme.txt`
const readLastTheme = (): ThemeName => {
	try {
		const raw = readFileSync(lastThemePath, "utf-8").trim()
		return raw === "tokyo-night" || raw === "catppuccin" || raw === "motel-default" ? raw : "motel-default"
	} catch {
		return "motel-default"
	}
}

let lastPersistedTheme = readLastTheme()

export const persistSelectedTheme = (theme: ThemeName) => {
	if (theme === lastPersistedTheme) return
	lastPersistedTheme = theme
	Bun.write(lastThemePath, theme).catch(() => {})
}

export const selectedThemeAtom = Atom.make<ThemeName>(readLastTheme()).pipe(Atom.keepAlive)

export type TraceSortMode = "recent" | "slowest" | "errors"
export const traceSortAtom = Atom.make<TraceSortMode>("recent").pipe(Atom.keepAlive)
export const collapsedSpanIdsAtom = Atom.make(new Set<string>() as ReadonlySet<string>).pipe(Atom.keepAlive)

export const loadTraceServices = () => queryRuntime.runPromise(Effect.flatMap(TraceQueryService.asEffect(), (service) => service.listServices))
export const loadRecentTraceSummaries = (serviceName: string) => queryRuntime.runPromise(Effect.flatMap(TraceQueryService.asEffect(), (service) => service.listTraceSummaries(serviceName)))
/**
 * Server-side trace summary search. Accepts any combination of:
 *
 * - `attributeFilters` — exact-match span attributes (from the `f` picker)
 * - `aiText`           — FTS5-backed search across LLM prompt/response
 *                        content (AI_FTS_KEYS), from the `:ai <query>`
 *                        modifier in the `/` filter
 *
 * Both filters compose: when both are set, a trace must match both. When
 * neither is set, callers should prefer `loadRecentTraceSummaries` so
 * the server can skip the search path entirely.
 */
export const loadFilteredTraceSummaries = (
	serviceName: string,
	options: {
		readonly attributeFilters?: Readonly<Record<string, string>>
		readonly aiText?: string | null
	},
) =>
	queryRuntime.runPromise(Effect.flatMap(TraceQueryService.asEffect(), (service) => service.searchTraceSummaries({
		serviceName,
		attributeFilters: options.attributeFilters,
		aiText: options.aiText ?? null,
		limit: config.otel.traceFetchLimit,
	})))
export const loadTraceAttributeKeys = (serviceName: string) =>
	queryRuntime.runPromise(Effect.flatMap(TraceQueryService.asEffect(), (service) => service.listFacets({ type: "traces", field: "attribute_keys", serviceName, limit: 200 })))
export const loadTraceAttributeValues = (serviceName: string, key: string) =>
	queryRuntime.runPromise(Effect.flatMap(TraceQueryService.asEffect(), (service) => service.listFacets({ type: "traces", field: "attribute_values", serviceName, key, limit: 200 })))

// ---------------------------------------------------------------------------
// Facet cache (drives the `f` attribute filter picker)
//
// The `attribute_keys` SQL scans a fair chunk of `span_attributes` on each
// call (several hundred ms on a 2GB DB even after the LENGTH(value) < 512
// pre-filter) — noticeable lag when the picker pops open. We cache per
// service and let stale-while-revalidate hide the cost on reopen, plus a
// pre-warm so the first `f` press after switching service feels instant.
//
// Invalidated on refresh (user pressed `r` or auto-refresh tick) via the
// same `cacheEpoch` signal the trace detail cache uses, kept in sync by
// `useTraceScreenData`.
// ---------------------------------------------------------------------------

export interface FacetRow { readonly value: string; readonly count: number }
interface FacetCacheEntry {
	readonly data: readonly FacetRow[]
	readonly fetchedAt: Date
}

const facetKeysCache = new Map<string, FacetCacheEntry>()
const facetValuesCache = new Map<string, FacetCacheEntry>()
const facetKeysInflight = new Map<string, Promise<FacetCacheEntry>>()
const facetValuesInflight = new Map<string, Promise<FacetCacheEntry>>()

const valuesKey = (service: string, key: string) => `${service}\u0000${key}`

export const getCachedFacetKeys = (service: string): FacetCacheEntry | null =>
	facetKeysCache.get(service) ?? null

export const getCachedFacetValues = (service: string, key: string): FacetCacheEntry | null =>
	facetValuesCache.get(valuesKey(service, key)) ?? null

/**
 * Load attribute keys for `service`, sharing any in-flight request and
 * caching the result. Safe to call repeatedly — `f` opens the picker,
 * service-change pre-warm, and auto-refresh all route through here.
 */
export const ensureTraceAttributeKeys = (service: string): Promise<FacetCacheEntry> => {
	const existing = facetKeysInflight.get(service)
	if (existing) return existing
	const request = loadTraceAttributeKeys(service)
		.then((data) => {
			const entry = { data, fetchedAt: new Date() } satisfies FacetCacheEntry
			facetKeysCache.set(service, entry)
			return entry
		})
		.finally(() => { facetKeysInflight.delete(service) })
	facetKeysInflight.set(service, request)
	return request
}

export const ensureTraceAttributeValues = (service: string, key: string): Promise<FacetCacheEntry> => {
	const ck = valuesKey(service, key)
	const existing = facetValuesInflight.get(ck)
	if (existing) return existing
	const request = loadTraceAttributeValues(service, key)
		.then((data) => {
			const entry = { data, fetchedAt: new Date() } satisfies FacetCacheEntry
			facetValuesCache.set(ck, entry)
			return entry
		})
		.finally(() => { facetValuesInflight.delete(ck) })
	facetValuesInflight.set(ck, request)
	return request
}

/** Called from the refreshNonce effect alongside the trace / log cache clears. */
export const invalidateFacetCaches = () => {
	facetKeysCache.clear()
	facetValuesCache.clear()
	facetKeysInflight.clear()
	facetValuesInflight.clear()
}
export const loadTraceDetail = (traceId: string) => queryRuntime.runPromise(Effect.flatMap(TraceQueryService.asEffect(), (service) => service.getTrace(traceId)))
export const loadTraceLogs = (traceId: string) => queryRuntime.runPromise(Effect.flatMap(LogQueryService.asEffect(), (service) => service.listTraceLogs(traceId)))
export const loadServiceLogs = (serviceName: string) => queryRuntime.runPromise(Effect.flatMap(LogQueryService.asEffect(), (service) => service.listRecentLogs(serviceName)))
export const loadAiCallDetail = (spanId: string) =>
	queryRuntime.runPromise(Effect.flatMap(TraceQueryService.asEffect(), (service) => service.getAiCall(spanId)))

// AI call detail cache: the `ai.prompt` payload can easily be 50KB+ and
// we don't want to re-hit SQLite every time j/k moves the selection
// between adjacent AI spans. Cleared alongside the other per-refresh
// caches in `useTraceScreenData`.
const aiCallDetailCache = new Map<string, AiCallDetail | null>()
const aiCallDetailInflight = new Map<string, Promise<AiCallDetail | null>>()

export const getCachedAiCallDetail = (spanId: string): AiCallDetail | null | undefined =>
	aiCallDetailCache.has(spanId) ? aiCallDetailCache.get(spanId) ?? null : undefined

export const ensureAiCallDetail = (spanId: string): Promise<AiCallDetail | null> => {
	if (aiCallDetailCache.has(spanId)) return Promise.resolve(aiCallDetailCache.get(spanId) ?? null)
	const existing = aiCallDetailInflight.get(spanId)
	if (existing) return existing
	const request = loadAiCallDetail(spanId)
		.then((data) => {
			aiCallDetailCache.set(spanId, data)
			return data
		})
		.finally(() => { aiCallDetailInflight.delete(spanId) })
	aiCallDetailInflight.set(spanId, request)
	return request
}

export const invalidateAiCallDetailCache = () => {
	aiCallDetailCache.clear()
	aiCallDetailInflight.clear()
}
