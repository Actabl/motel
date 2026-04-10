import { Effect, Layer, ServiceMap } from "effect"
import { Locator } from "./locator.js"

export class LetoHttpError extends Error {
	readonly _tag = "LetoHttpError"
	constructor(
		readonly status: number,
		readonly detail: string,
	) {
		super(`leto returned HTTP ${status}: ${detail}`)
	}
}

type QueryValue = string | number | boolean | null | undefined
type Query = Readonly<Record<string, QueryValue>>

const appendQuery = (url: URL, query: Query | undefined) => {
	if (!query) return url
	for (const [key, value] of Object.entries(query)) {
		if (value === undefined || value === null || value === "") continue
		url.searchParams.set(key, String(value))
	}
	return url
}

const appendAttributes = (url: URL, attributes: Readonly<Record<string, string>> | undefined) => {
	if (!attributes) return url
	for (const [key, value] of Object.entries(attributes)) {
		url.searchParams.set(`attr.${key}`, value)
	}
	return url
}

export type SearchTracesInput = {
	readonly service?: string
	readonly operation?: string
	readonly status?: "ok" | "error"
	readonly minDurationMs?: number
	readonly lookback?: string
	readonly limit?: number
	readonly cursor?: string
	readonly attributes?: Readonly<Record<string, string>>
}

export type SearchLogsInput = {
	readonly service?: string
	readonly traceId?: string
	readonly spanId?: string
	readonly body?: string
	readonly lookback?: string
	readonly limit?: number
	readonly cursor?: string
	readonly attributes?: Readonly<Record<string, string>>
}

export type TraceStatsInput = {
	readonly groupBy: string
	readonly agg: "count" | "avg_duration" | "p95_duration" | "error_rate"
	readonly service?: string
	readonly operation?: string
	readonly status?: "ok" | "error"
	readonly minDurationMs?: number
	readonly lookback?: string
	readonly limit?: number
	readonly attributes?: Readonly<Record<string, string>>
}

export type LogStatsInput = {
	readonly groupBy: string
	readonly service?: string
	readonly traceId?: string
	readonly spanId?: string
	readonly body?: string
	readonly lookback?: string
	readonly limit?: number
	readonly attributes?: Readonly<Record<string, string>>
}

export type FacetsInput = {
	readonly type: "traces" | "logs"
	readonly field: string
	readonly service?: string
	readonly lookback?: string
	readonly limit?: number
}

export class LetoClient extends ServiceMap.Service<
	LetoClient,
	{
		readonly searchTraces: (input: SearchTracesInput) => Effect.Effect<unknown, LetoHttpError>
		readonly getTrace: (traceId: string) => Effect.Effect<unknown, LetoHttpError>
		readonly getTraceLogs: (
			traceId: string,
			options: { readonly lookback?: string; readonly limit?: number; readonly cursor?: string },
		) => Effect.Effect<unknown, LetoHttpError>
		readonly searchLogs: (input: SearchLogsInput) => Effect.Effect<unknown, LetoHttpError>
		readonly traceStats: (input: TraceStatsInput) => Effect.Effect<unknown, LetoHttpError>
		readonly logStats: (input: LogStatsInput) => Effect.Effect<unknown, LetoHttpError>
		readonly facets: (input: FacetsInput) => Effect.Effect<unknown, LetoHttpError>
		readonly services: Effect.Effect<unknown, LetoHttpError>
		readonly health: Effect.Effect<unknown, LetoHttpError>
	}
>()("leto/LetoClient") {}

export const LetoClientLive = Layer.effect(
	LetoClient,
	Effect.gen(function* () {
		const locator = yield* Locator

		const get = <A = unknown>(path: string, query?: Query, attributes?: Readonly<Record<string, string>>) =>
			Effect.gen(function* () {
				const { url } = yield* Effect.mapError(
					locator.resolve,
					(err) => new LetoHttpError(0, err.message),
				)
				const target = appendAttributes(appendQuery(new URL(path, url), query), attributes)
				return yield* Effect.tryPromise({
					try: async () => {
						const res = await fetch(target, { signal: AbortSignal.timeout(5000) })
						const body = (await res.json().catch(() => ({ error: "invalid json" }))) as A
						if (!res.ok) throw new LetoHttpError(res.status, JSON.stringify(body))
						return body
					},
					catch: (err) =>
						err instanceof LetoHttpError ? err : new LetoHttpError(0, (err as Error).message),
				}).pipe(
					Effect.tapError((err) => (err.status === 0 ? locator.invalidate : Effect.void)),
				)
			})

		return {
			searchTraces: (input) =>
				get("/api/traces/search", {
					service: input.service,
					operation: input.operation,
					status: input.status,
					minDurationMs: input.minDurationMs,
					lookback: input.lookback,
					limit: input.limit,
					cursor: input.cursor,
				}, input.attributes),

			getTrace: (traceId) => get(`/api/traces/${encodeURIComponent(traceId)}`),

			getTraceLogs: (traceId, options) =>
				get(`/api/traces/${encodeURIComponent(traceId)}/logs`, {
					lookback: options.lookback,
					limit: options.limit,
					cursor: options.cursor,
				}),

			searchLogs: (input) =>
				get("/api/logs/search", {
					service: input.service,
					traceId: input.traceId,
					spanId: input.spanId,
					body: input.body,
					lookback: input.lookback,
					limit: input.limit,
					cursor: input.cursor,
				}, input.attributes),

			traceStats: (input) =>
				get("/api/traces/stats", {
					groupBy: input.groupBy,
					agg: input.agg,
					service: input.service,
					operation: input.operation,
					status: input.status,
					minDurationMs: input.minDurationMs,
					lookback: input.lookback,
					limit: input.limit,
				}, input.attributes),

			logStats: (input) =>
				get("/api/logs/stats", {
					groupBy: input.groupBy,
					agg: "count",
					service: input.service,
					traceId: input.traceId,
					spanId: input.spanId,
					body: input.body,
					lookback: input.lookback,
					limit: input.limit,
				}, input.attributes),

			facets: (input) =>
				get("/api/facets", {
					type: input.type,
					field: input.field,
					service: input.service,
					lookback: input.lookback,
					limit: input.limit,
				}),

			services: get("/api/services"),

			health: get("/api/health"),
		}
	}),
)
