import { describe, suite, type TestContext, test } from "node:test";

import type { BackoffStrategy } from "@proventuslabs/retry-strategies";

import { withRetryStatus } from "./with-retry-status.ts";

/* node:coverage disable */

// Helper to flush microtasks for predictable async behavior
const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

// Mock strategy factory for testing
const createMockStrategy = (delays: number[]): (() => BackoffStrategy) => {
	return () => {
		let callCount = 0;
		return {
			nextBackoff: () => {
				const delay = delays[callCount];
				callCount++;
				return delay ?? Number.NaN;
			},
			resetBackoff() {},
		};
	};
};

suite("withRetryStatus - Unit", () => {
	describe("successful responses", () => {
		test("returns successful response without retrying", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			const qfetch = withRetryStatus({
				strategy: createMockStrategy([1000]),
			})(fetchMock);

			// Act
			const response = await qfetch("https://example.com");
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"calls fetch exactly once",
			);
			ctx.assert.strictEqual(body, "ok", "returns response body");
		});

		test("handles all 2xx status codes without retrying", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(5);
			const statusCodes = [200, 201, 204, 206, 299];

			for (const status of statusCodes) {
				await ctx.test(`status ${status}`, async (ctx: TestContext) => {
					// Arrange
					ctx.plan(1);
					const fetchMock = ctx.mock.fn(
						fetch,
						async () => new Response(null, { status }),
					);
					const qfetch = withRetryStatus({
						strategy: createMockStrategy([1000]),
					})(fetchMock);

					// Act
					await qfetch("https://example.com");

					// Assert
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						1,
						"calls fetch exactly once",
					);
				});
			}
		});
	});

	describe("non-retryable error responses", () => {
		test("returns client error without retrying", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("not found", { status: 404 }),
			);
			const qfetch = withRetryStatus({
				strategy: createMockStrategy([1000]),
			})(fetchMock);

			// Act
			const response = await qfetch("https://example.com");

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"calls fetch exactly once",
			);
			ctx.assert.strictEqual(
				response.status,
				404,
				"returns original error response",
			);
		});

		test("handles non-retryable 4xx status codes without retrying", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(6);
			const statusCodes = [400, 401, 403, 404, 405, 422];

			for (const status of statusCodes) {
				await ctx.test(`status ${status}`, async (ctx: TestContext) => {
					// Arrange
					ctx.plan(1);
					const fetchMock = ctx.mock.fn(
						fetch,
						async () => new Response(null, { status }),
					);
					const qfetch = withRetryStatus({
						strategy: createMockStrategy([1000]),
					})(fetchMock);

					// Act
					await qfetch("https://example.com");

					// Assert
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						1,
						"calls fetch exactly once",
					);
				});
			}
		});
	});

	describe("retryable status codes", () => {
		test("retries on 500 internal server error", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			let callCount = 0;
			const fetchMock = ctx.mock.fn(fetch, async () => {
				callCount++;
				if (callCount === 1) {
					return new Response("error", { status: 500 });
				}
				return new Response("ok", { status: 200 });
			});

			const qfetch = withRetryStatus({
				strategy: createMockStrategy([1000, 2000]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1000);
			const response = await responsePromise;

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				2,
				"retries once after initial failure",
			);
			ctx.assert.strictEqual(
				response.status,
				200,
				"returns successful response after retry",
			);
		});

		test("retries on all retryable status codes", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(6);
			const retryableStatuses = [408, 429, 500, 502, 503, 504];

			for (const status of retryableStatuses) {
				await ctx.test(`status ${status}`, async (ctx: TestContext) => {
					// Arrange
					ctx.plan(1);
					ctx.mock.timers.enable({ apis: ["setTimeout"] });

					let callCount = 0;
					const fetchMock = ctx.mock.fn(fetch, async () => {
						callCount++;
						if (callCount === 1) {
							return new Response(null, { status });
						}
						return new Response("ok", { status: 200 });
					});

					const qfetch = withRetryStatus({
						strategy: createMockStrategy([1000]),
					})(fetchMock);

					// Act
					const responsePromise = qfetch("https://example.com");
					await flushMicrotasks();
					ctx.mock.timers.tick(1000);
					await responsePromise;

					// Assert
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						2,
						"retries the request",
					);
				});
			}
		});

		test("performs multiple retries until success", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			let callCount = 0;
			const fetchMock = ctx.mock.fn(fetch, async () => {
				callCount++;
				if (callCount <= 3) {
					return new Response("error", { status: 503 });
				}
				return new Response("ok", { status: 200 });
			});

			const qfetch = withRetryStatus({
				strategy: createMockStrategy([1000, 2000, 3000]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1000);
			await flushMicrotasks();
			ctx.mock.timers.tick(2000);
			await flushMicrotasks();
			ctx.mock.timers.tick(3000);
			const response = await responsePromise;

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				4,
				"retries three times before success",
			);
			ctx.assert.strictEqual(
				response.status,
				200,
				"returns successful response",
			);
		});
	});

	describe("strategy-controlled retry limits", () => {
		test("stops retrying when strategy returns NaN", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("error", { status: 500 }),
			);

			// Strategy returns delays for 2 retries, then NaN
			const qfetch = withRetryStatus({
				strategy: createMockStrategy([1000, 2000, Number.NaN]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1000);
			await flushMicrotasks();
			ctx.mock.timers.tick(2000);
			const response = await responsePromise;

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				3,
				"attempts exactly 3 times (initial + 2 retries)",
			);
			ctx.assert.strictEqual(
				response.status,
				500,
				"returns last error response",
			);
		});

		test("stops immediately when strategy returns NaN on first retry", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("error", { status: 503 }),
			);

			// Strategy returns NaN immediately
			const qfetch = withRetryStatus({
				strategy: createMockStrategy([Number.NaN]),
			})(fetchMock);

			// Act
			const response = await qfetch("https://example.com");

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"attempts exactly once",
			);
			ctx.assert.strictEqual(
				response.status,
				503,
				"returns error response without retry",
			);
		});
	});

	describe("backoff delay timing", () => {
		test("waits for strategy-specified delay between retries", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			let callCount = 0;
			const fetchMock = ctx.mock.fn(fetch, async () => {
				callCount++;
				if (callCount === 1) {
					return new Response(null, { status: 503 });
				}
				return new Response("ok", { status: 200 });
			});

			const qfetch = withRetryStatus({
				strategy: createMockStrategy([5000]), // 5 second delay
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();

			// Assert - not yet retried
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"initial request completed",
			);

			// Act - advance time but not enough
			ctx.mock.timers.tick(4999);
			await flushMicrotasks();

			// Assert - still not retried
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"waits for full delay before retry",
			);

			// Act - complete the delay
			ctx.mock.timers.tick(1);
			await responsePromise;
		});

		test("uses different delays for each retry attempt", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response(null, { status: 500 }),
			);

			// Different delays: 1s, 2s, 3s
			const qfetch = withRetryStatus({
				strategy: createMockStrategy([1000, 2000, 3000, Number.NaN]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1000); // First retry after 1s
			await flushMicrotasks();
			ctx.mock.timers.tick(2000); // Second retry after 2s
			await flushMicrotasks();
			ctx.mock.timers.tick(3000); // Third retry after 3s
			await responsePromise;

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				4,
				"completes all retries with different delays",
			);
		});
	});

	describe("abort signal handling", () => {
		test("respects abort signal during retry delay", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response(null, { status: 503 }),
			);
			const controller = new AbortController();

			const qfetch = withRetryStatus({
				strategy: createMockStrategy([5000]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com", {
				signal: controller.signal,
			});
			await flushMicrotasks();

			// Assert - initial call completed
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"completes initial request",
			);

			// Act - abort during wait
			controller.abort();
			ctx.mock.timers.tick(5000);

			// Assert - throws abort error
			await ctx.assert.rejects(
				responsePromise,
				(error: unknown) => {
					return error instanceof Error && error.name === "AbortError";
				},
				"throws abort error when signal is aborted",
			);
		});

		test("extracts signal from Request object", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response(null, { status: 503 }),
			);
			const controller = new AbortController();
			const request = new Request("https://example.com", {
				signal: controller.signal,
			});

			const qfetch = withRetryStatus({
				strategy: createMockStrategy([5000]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch(request);
			await flushMicrotasks();

			// Assert - initial call completed
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"completes initial request",
			);

			// Act - abort during wait
			controller.abort();
			ctx.mock.timers.tick(5000);

			// Assert
			await ctx.assert.rejects(
				responsePromise,
				(error: unknown) =>
					error instanceof Error && error.name === "AbortError",
				"extracts and respects signal from Request object",
			);
		});
	});

	describe("request forwarding", () => {
		test("forwards URL and init to fetch", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			let receivedInput: URL | RequestInfo | undefined;
			let receivedInit: RequestInit | undefined;

			const fetchMock = ctx.mock.fn(fetch, async (input, init) => {
				receivedInput = input;
				receivedInit = init;
				return new Response("ok", { status: 200 });
			});

			const qfetch = withRetryStatus({
				strategy: createMockStrategy([1000]),
			})(fetchMock);

			const url = "https://example.com/api";
			const init = {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			};

			// Act
			await qfetch(url, init);

			// Assert
			ctx.assert.strictEqual(receivedInput, url, "forwards URL to fetch");
			ctx.assert.deepStrictEqual(
				receivedInit,
				init,
				"forwards init options to fetch",
			);
		});

		test("forwards same parameters on retry", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(4);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			const receivedInputs: (URL | RequestInfo)[] = [];
			const receivedInits: (RequestInit | undefined)[] = [];

			let callCount = 0;
			const fetchMock = ctx.mock.fn(fetch, async (input, init) => {
				callCount++;
				receivedInputs.push(input);
				receivedInits.push(init);

				if (callCount === 1) {
					return new Response(null, { status: 500 });
				}
				return new Response("ok", { status: 200 });
			});

			const qfetch = withRetryStatus({
				strategy: createMockStrategy([1000]),
			})(fetchMock);

			const url = "https://example.com/api";
			const init = { method: "POST", body: "test data" };

			// Act
			const responsePromise = qfetch(url, init);
			await flushMicrotasks();
			ctx.mock.timers.tick(1000);
			await responsePromise;

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				2,
				"calls fetch twice",
			);
			ctx.assert.strictEqual(
				receivedInputs[0],
				url,
				"forwards URL on first attempt",
			);
			ctx.assert.strictEqual(
				receivedInputs[1],
				url,
				"forwards same URL on retry",
			);
			ctx.assert.deepStrictEqual(
				receivedInits[0],
				receivedInits[1],
				"forwards same init on retry",
			);
		});
	});

	describe("response body cleanup", () => {
		test("cancels response body before retry", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			const testStream = new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode("test data"));
					controller.close();
				},
			});
			const cancelMock = ctx.mock.method(testStream, "cancel", async () => {});

			let callCount = 0;
			const fetchMock = ctx.mock.fn(fetch, async () => {
				callCount++;
				if (callCount === 1) {
					return new Response(testStream, { status: 500 });
				}
				return new Response("ok", { status: 200 });
			});

			const qfetch = withRetryStatus({
				strategy: createMockStrategy([1000]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1000);
			await responsePromise;

			// Assert
			ctx.assert.strictEqual(
				cancelMock.mock.callCount(),
				1,
				"calls cancel on response body",
			);
			ctx.assert.deepStrictEqual(
				cancelMock.mock.calls[0]?.arguments,
				["Retry scheduled"],
				"passes reason to cancel",
			);
		});

		test("continues retry even if body cancellation fails", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			const testStream = new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode("test data"));
					controller.close();
				},
			});
			const cancelMock = ctx.mock.method(testStream, "cancel", async () => {
				throw new Error("Cancel failed");
			});

			let callCount = 0;
			const fetchMock = ctx.mock.fn(fetch, async () => {
				callCount++;
				if (callCount === 1) {
					return new Response(testStream, { status: 503 });
				}
				return new Response("ok", { status: 200 });
			});

			const qfetch = withRetryStatus({
				strategy: createMockStrategy([1000]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1000);
			const response = await responsePromise;

			// Assert
			ctx.assert.strictEqual(
				cancelMock.mock.callCount(),
				1,
				"attempts to cancel response body",
			);
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				2,
				"continues with retry despite cancel error",
			);
			ctx.assert.strictEqual(
				response.status,
				200,
				"returns successful response",
			);
		});

		test("handles null body gracefully", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			let callCount = 0;
			const fetchMock = ctx.mock.fn(fetch, async () => {
				callCount++;
				if (callCount === 1) {
					return new Response(null, { status: 500 });
				}
				return new Response("ok", { status: 200 });
			});

			const qfetch = withRetryStatus({
				strategy: createMockStrategy([1000]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1000);
			const response = await responsePromise;

			// Assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"handles null body without error",
			);
		});
	});

	describe("strategy isolation", () => {
		test("creates new strategy instance for each request", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			let strategyCallCount = 0;
			const strategyFactory = () => {
				strategyCallCount++;
				return createMockStrategy([1000])();
			};

			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response(null, { status: 500 }),
			);

			const qfetch = withRetryStatus({
				strategy: strategyFactory,
			})(fetchMock);

			// Act - first request
			const promise1 = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1000);
			await promise1;

			// Act - second request
			const promise2 = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1000);
			await promise2;

			// Assert
			ctx.assert.strictEqual(
				strategyCallCount,
				2,
				"creates strategy once per request",
			);
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				4,
				"each request retries independently",
			);
		});
	});

	describe("custom retryable status codes", () => {
		test("retries only on custom status codes", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			let callCount = 0;
			const fetchMock = ctx.mock.fn(fetch, async () => {
				callCount++;
				if (callCount === 1) {
					return new Response(null, { status: 429 });
				}
				return new Response("ok", { status: 200 });
			});

			// Only retry on 429 and 503
			const qfetch = withRetryStatus({
				strategy: createMockStrategy([1000]),
				retryableStatuses: new Set([429, 503]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1000);
			const response = await responsePromise;

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				2,
				"retries on custom status code 429",
			);
			ctx.assert.strictEqual(
				response.status,
				200,
				"returns successful response after retry",
			);
		});

		test("does not retry on default codes when custom codes are provided", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response(null, { status: 500 }),
			);

			// Custom codes that don't include 500
			const qfetch = withRetryStatus({
				strategy: createMockStrategy([1000]),
				retryableStatuses: new Set([429, 502]),
			})(fetchMock);

			// Act
			const response = await qfetch("https://example.com");

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"does not retry on 500 when not in custom set",
			);
			ctx.assert.strictEqual(
				response.status,
				500,
				"returns error response without retry",
			);
		});

		test("retries on multiple custom status codes", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			const customStatuses = [429, 502, 520];

			for (const status of customStatuses) {
				await ctx.test(`status ${status}`, async (ctx: TestContext) => {
					// Arrange
					ctx.plan(1);
					ctx.mock.timers.enable({ apis: ["setTimeout"] });

					let callCount = 0;
					const fetchMock = ctx.mock.fn(fetch, async () => {
						callCount++;
						if (callCount === 1) {
							return new Response(null, { status });
						}
						return new Response("ok", { status: 200 });
					});

					const qfetch = withRetryStatus({
						strategy: createMockStrategy([1000]),
						retryableStatuses: new Set([429, 502, 520]),
					})(fetchMock);

					// Act
					const responsePromise = qfetch("https://example.com");
					await flushMicrotasks();
					ctx.mock.timers.tick(1000);
					await responsePromise;

					// Assert
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						2,
						"retries the request",
					);
				});
			}
		});

		test("uses default status codes when option is not provided", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			let callCount = 0;
			const fetchMock = ctx.mock.fn(fetch, async () => {
				callCount++;
				if (callCount === 1) {
					return new Response(null, { status: 503 });
				}
				return new Response("ok", { status: 200 });
			});

			// No custom status codes provided
			const qfetch = withRetryStatus({
				strategy: createMockStrategy([1000]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1000);
			const response = await responsePromise;

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				2,
				"retries on default status code 503",
			);
			ctx.assert.strictEqual(
				response.status,
				200,
				"returns successful response",
			);
		});

		test("allows empty set of retryable status codes", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response(null, { status: 500 }),
			);

			// Empty set means no retries on any status code
			const qfetch = withRetryStatus({
				strategy: createMockStrategy([1000]),
				retryableStatuses: new Set(),
			})(fetchMock);

			// Act
			const response = await qfetch("https://example.com");

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"does not retry with empty status set",
			);
			ctx.assert.strictEqual(
				response.status,
				500,
				"returns error response without retry",
			);
		});
	});
});
