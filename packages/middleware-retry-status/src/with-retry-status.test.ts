import { describe, suite, type TestContext, test } from "node:test";

import { createStrategyMock, flushMicrotasks } from "@qfetch/test-utils";

import { withRetryStatus } from "./with-retry-status.ts";

/* node:coverage disable */

suite("withRetryStatus - unit middleware", () => {
	describe("retry mechanism is skipped for successful or non-retryable responses", () => {
		test("completes without retrying on successful status", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			const qfetch = withRetryStatus({
				strategy: createStrategyMock(ctx, [1000]),
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

		test("completes without retrying on all 2xx status codes", async (ctx: TestContext) => {
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
						strategy: createStrategyMock(ctx, [1000]),
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

		test("completes without retrying on non-retryable client error status", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("not found", { status: 404 }),
			);
			const qfetch = withRetryStatus({
				strategy: createStrategyMock(ctx, [1000]),
			})(fetchMock);

			// Act
			const response = await qfetch("https://example.com");

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"calls fetch exactly once",
			);
			ctx.assert.strictEqual(response.status, 404, "returns error response");
		});

		test("completes without retrying on all non-retryable 4xx status codes", async (ctx: TestContext) => {
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
						strategy: createStrategyMock(ctx, [1000]),
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

	describe("retry is correctly triggered for retryable status codes", () => {
		test("succeeds after first retry attempt", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			fetchMock.mock.mockImplementationOnce(
				async () => new Response("error", { status: 500 }),
			);
			const qfetch = withRetryStatus({
				strategy: createStrategyMock(ctx, [1000, 2000]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1000);
			const response = await responsePromise;
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(fetchMock.mock.callCount(), 2, "retries once");
			ctx.assert.strictEqual(response.status, 200, "returns success status");
			ctx.assert.strictEqual(body, "ok", "returns successful response");
		});

		test("retries on all default retryable status codes", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(6);
			const retryableStatuses = [408, 429, 500, 502, 503, 504];

			for (const status of retryableStatuses) {
				await ctx.test(`status ${status}`, async (ctx: TestContext) => {
					// Arrange
					ctx.plan(1);
					ctx.mock.timers.enable({ apis: ["setTimeout"] });
					const fetchMock = ctx.mock.fn(
						fetch,
						async () => new Response("ok", { status: 200 }),
					);
					fetchMock.mock.mockImplementationOnce(
						async () => new Response(null, { status }),
					);
					const qfetch = withRetryStatus({
						strategy: createStrategyMock(ctx, [1000]),
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
				strategy: createStrategyMock(ctx, [1000, 2000, 3000]),
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

	describe("backoff strategy controls retry attempts and delays", () => {
		test("uses fresh strategy state for each top-level request", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			const strategyFactory = ctx.mock.fn(createStrategyMock(ctx, [1000]));

			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
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
				strategyFactory.mock.callCount(),
				2,
				"creates strategy once per request",
			);
		});

		test("stops retrying when strategy exhausts its attempts budget", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(
				fetch,
				async () =>
					new Response("still not ok", {
						status: 500,
					}),
			);
			const qfetch = withRetryStatus({
				strategy: createStrategyMock(ctx, [1000, 2000, Number.NaN]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1000);
			await flushMicrotasks();
			ctx.mock.timers.tick(2000);
			const response = await responsePromise;
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				3,
				"initial request plus two retries",
			);
			ctx.assert.strictEqual(response.status, 500, "returns error status");
			ctx.assert.strictEqual(
				body,
				"still not ok",
				"returns final error response",
			);
		});

		test("does not retry when strategy returns NaN on first check", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("not ok", { status: 503 }),
			);
			const qfetch = withRetryStatus({
				strategy: createStrategyMock(ctx, [Number.NaN]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1000);
			const response = await responsePromise;
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(fetchMock.mock.callCount(), 1, "does not retry");
			ctx.assert.strictEqual(body, "not ok", "returns initial error response");
		});
	});

	describe("backoff delay timing", () => {
		test("waits for strategy-specified delay between retries", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			fetchMock.mock.mockImplementationOnce(
				async () => new Response(null, { status: 503 }),
			);
			const qfetch = withRetryStatus({
				strategy: createStrategyMock(ctx, [5000]), // 5 second delay
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
			const qfetch = withRetryStatus({
				strategy: createStrategyMock(ctx, [1000, 2000, 3000, Number.NaN]),
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

	describe("request state is correctly managed during retry", () => {
		test("cancels the response body before retrying the request", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			const testStream = new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode("not ok"));
					controller.close();
				},
			});
			const cancelMock = ctx.mock.method(testStream, "cancel", async () => {});

			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			fetchMock.mock.mockImplementationOnce(
				async () => new Response(testStream, { status: 500 }),
			);

			const qfetch = withRetryStatus({
				strategy: createStrategyMock(ctx, [1000]),
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

		test("continues retry when body cancellation fails", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			const testStream = new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode("not ok"));
					controller.close();
				},
			});
			const cancelMock = ctx.mock.method(testStream, "cancel", async () => {
				throw new Error("Cancel failed");
			});

			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			fetchMock.mock.mockImplementationOnce(
				async () => new Response(testStream, { status: 503 }),
			);

			const qfetch = withRetryStatus({
				strategy: createStrategyMock(ctx, [1000]),
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

		test("handles null response body gracefully without cancellation", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			fetchMock.mock.mockImplementationOnce(
				async () => new Response(null, { status: 500 }),
			);
			const qfetch = withRetryStatus({
				strategy: createStrategyMock(ctx, [1000]),
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

		test("respects abort signal and aborts the fetch request", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			fetchMock.mock.mockImplementationOnce(
				async () => new Response(null, { status: 503 }),
			);
			const controller = new AbortController();

			const qfetch = withRetryStatus({
				strategy: createStrategyMock(ctx, [5000]),
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

		test("respects abort signal and stops the retry delay with error", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			fetchMock.mock.mockImplementationOnce(
				async () => new Response(null, { status: 503 }),
			);
			const controller = new AbortController();
			const request = new Request("https://example.com", {
				signal: controller.signal,
			});

			const qfetch = withRetryStatus({
				strategy: createStrategyMock(ctx, [5000]),
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

	describe("custom status codes can override default retryable behavior", () => {
		test("retries only on custom status codes provided in the options", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			const customStatuses = [429, 502, 520];

			for (const status of customStatuses) {
				await ctx.test(
					`retries on custom status ${status}`,
					async (ctx: TestContext) => {
						// Arrange
						ctx.plan(1);
						ctx.mock.timers.enable({ apis: ["setTimeout"] });
						const fetchMock = ctx.mock.fn(
							fetch,
							async () => new Response("ok", { status: 200 }),
						);
						fetchMock.mock.mockImplementationOnce(
							async () =>
								new Response("not ok", {
									status,
								}),
						);
						const qfetch = withRetryStatus({
							strategy: createStrategyMock(ctx, [1000]),
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
					},
				);
			}
		});

		test("uses default statuses (408, 429, 500, 502, 503, 504) when option is not provided", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			fetchMock.mock.mockImplementationOnce(
				async () => new Response("not ok", { status: 503 }),
			);

			// No custom status codes provided
			const qfetch = withRetryStatus({
				strategy: createStrategyMock(ctx, [1000]),
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

		test("does not retry when the set of retryable status codes is empty", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(
				fetch,
				async () =>
					new Response("not ok", {
						status: 500,
					}),
			);

			// Empty set means no retries on any status code
			const qfetch = withRetryStatus({
				strategy: createStrategyMock(ctx, [1000]),
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
