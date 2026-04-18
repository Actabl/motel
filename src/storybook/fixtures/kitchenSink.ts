import { type ChatFixture, makeDetail, makeSpan } from "./index.ts"

// "Kitchen sink" fixture — every rendering branch in one transcript so
// we can iterate on styling without flipping between fixtures. Each
// section below is labelled with the case it exercises.
//
// Order roughly mirrors what a realistic conversation looks like so
// scrolling feels natural, but it's not meant to be a coherent chat.

const base64Chunk = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAD".repeat(400)

export const kitchenSinkFixture: ChatFixture = {
	id: "kitchen-sink",
	label: "kitchen-sink",
	span: makeSpan({ operationName: "ai.streamText", durationMs: 12_400 }),
	detail: makeDetail({
		durationMs: 12_400,
		finishReason: "tool-calls",
		usage: { inputTokens: 42_000, outputTokens: 1_200, totalTokens: 43_200, cachedInputTokens: 18_500, reasoningTokens: 320 },
		promptMessages: {
			messages: [
				// ── 1. Long system prompt → collapses to 6 lines + hint
				{
					role: "system",
					content: Array.from(
						{ length: 120 },
						(_, i) => `System instruction ${i}: long boilerplate that nobody reads inline`,
					).join("\n"),
				},

				// ── 2. Plain user text
				{ role: "user", content: [{ type: "text", text: "I'd like to refactor the formatter and add a todo list." }] },

				// ── 3. Assistant turn exercising many inline patterns:
				//     reasoning, plain text, bash tool-call with noisy
				//     infra keys, read with filePath+offset+limit, todowrite
				//     with count, task with description+subagent_type.
				{
					role: "assistant",
					content: [
						{ type: "reasoning", text: "I should start by inspecting the current formatter and the test file, then plan the changes in a todo list before touching any code." },
						{ type: "text", text: "Plan: check current state, build a todo list, then delegate the heavy read to a subagent." },
						{ type: "tool-call", toolCallId: "tc-1", toolName: "bash", input: { command: "git status --short --branch", timeout: 120_000, workdir: "/Users/kit/code/open-source/opencode", description: "ignored" } },
						{ type: "tool-call", toolCallId: "tc-2", toolName: "read", input: { filePath: "/src/formatter.ts", offset: 40, limit: 80 } },
						{ type: "tool-call", toolCallId: "tc-3", toolName: "todowrite", input: { todos: [{}, {}, {}, {}, {}] } },
						{ type: "tool-call", toolCallId: "tc-4", toolName: "task", input: { description: "Find every caller of formatDocument and summarise their shape", subagent_type: "explore" } },
					],
				},

				// ── 4. Tool results: short plain, long truncated, and
				//     irregular object-shaped output (error-case fallback).
				{
					role: "tool",
					content: [
						{ type: "tool-result", toolCallId: "tc-1", toolName: "bash", output: { type: "text", value: "## dev...origin/dev [ahead 8, behind 11]\n M src/formatter.ts" } },
						{ type: "tool-result", toolCallId: "tc-2", toolName: "read", output: { type: "text", value: Array.from({ length: 80 }, (_, i) => `${i + 1}: // formatter line ${i} — some body content`).join("\n") } },
						{ type: "tool-result", toolCallId: "tc-3", toolName: "todowrite", output: { type: "text", value: "ok (5 todos)" } },
						{ type: "tool-result", toolCallId: "tc-4", toolName: "task", output: { error: "rate-limited", code: 429, retryable: true } },
					],
				},

				// ── 5. Another assistant turn: edit (primary+secondary
				//     summary line), webfetch (url), unknown tool, unknown
				//     content-part type.
				{
					role: "assistant",
					content: [
						{ type: "text", text: "Now the edit itself, then a quick doc fetch for context:" },
						{ type: "tool-call", toolCallId: "tc-5", toolName: "edit", input: { filePath: "/src/formatter.ts", oldString: "function format(doc: Doc)", newString: "export function format(doc: Doc)" } },
						{ type: "tool-call", toolCallId: "tc-6", toolName: "webfetch", input: { url: "https://effect.website/docs/observability/tracing", format: "markdown" } },
						{ type: "tool-call", toolCallId: "tc-7", toolName: "novel-tool-unknown-to-us", input: { foo: "bar", count: 3 } },
						// Unknown content part kind — should fall through to
						// the `[future-thing] …` hint line.
						{ type: "future-thing", payload: { a: 1, b: "x" } } as unknown as { type: string },
					],
				},

				// ── 6. User pastes an image (base64 data URL) → scrubbed
				//     to a compact marker.
				{
					role: "user",
					content: [
						{ type: "text", text: `Here's the bug screenshot: data:image/png;base64,${base64Chunk}\n\nCan you tell me what's wrong with the spacing?` },
					],
				},

				// ── 7. Final assistant turn — text only, for the response
				//     baseline.
				{
					role: "assistant",
					content: [{ type: "text", text: "The padding token on row 3 is using `spacing.md` instead of `spacing.sm`. Swapping it fixes the alignment." }],
				},
			],
		},
		responseText: "The padding token on row 3 is using `spacing.md` instead of `spacing.sm`. Swapping it fixes the alignment.",
	}),
}
