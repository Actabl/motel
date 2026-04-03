import { Effect, Layer, ServiceMap } from "effect"
import type { TraceItem } from "../domain.js"
import { TelemetryStore } from "./TelemetryStore.js"

export class TraceQueryService extends ServiceMap.Service<
	TraceQueryService,
	{
		readonly listServices: Effect.Effect<readonly string[], Error>
		readonly listRecentTraces: (serviceName: string, options?: { readonly lookbackMinutes?: number; readonly limit?: number }) => Effect.Effect<readonly TraceItem[], Error>
		readonly getTrace: (traceId: string) => Effect.Effect<TraceItem | null, Error>
	}
>()("leto/TraceQueryService") {}

export const TraceQueryServiceLive = Layer.effect(
	TraceQueryService,
	Effect.gen(function* () {
		const store = yield* TelemetryStore

		const listServices = Effect.fn("leto/TraceQueryService.listServices")(function* () {
			const services = yield* store.listServices
			yield* Effect.annotateCurrentSpan("trace.service_count", services.length)
			return services
		})()

		const listRecentTraces = Effect.fn("leto/TraceQueryService.listRecentTraces")(function* (serviceName: string, options?: { readonly lookbackMinutes?: number; readonly limit?: number }) {
			yield* Effect.annotateCurrentSpan({
				"trace.service_name": serviceName,
			})
			const traces = yield* store.listRecentTraces(serviceName, options)
			yield* Effect.annotateCurrentSpan("trace.result_count", traces.length)
			return traces
		})

		const getTrace = Effect.fn("leto/TraceQueryService.getTrace")(function* (traceId: string) {
			yield* Effect.annotateCurrentSpan("trace.trace_id", traceId)
			return yield* store.getTrace(traceId)
		})

		return TraceQueryService.of({ listServices, listRecentTraces, getTrace })
	}),
)
