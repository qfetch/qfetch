import { describe, suite, type TestContext, test } from "node:test";

import type { BackoffStrategy } from "@proventuslabs/retry-strategies";

import { withRetryAfter } from "./with-retry-after.ts";

/* node:coverage disable */

// Helper to flush microtasks for predictable async behavior
const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

// Mock strategy factory for testing
const strategyMock = (ctx: TestContext, delays: number[]) => {
	return ctx.mock.fn<() => BackoffStrategy>(() => {
		let callCount = 0;
		return {
			nextBackoff: ctx.mock.fn(() => {
				const delay = delays.at(callCount++);
				return delay ?? Number.NaN;
			}),
			resetBackoff: ctx.mock.fn(() => {}),
		};
	});
};

suite("withRetryAfter - unit middleware", () => {
	describe("retry mechanism is skipped for successful or invalid responses", () => {
		test("completes without retrying on successful status", async (ctx: TestContext) => {
			ctx.plan(2);

			await ctx.test(
				"without a Retry-After header",
				async (ctx: TestContext) => {
					// Arrange
					ctx.plan(2);
					const fetchMock = ctx.mock.fn(
						fetch,
						async () => new Response("ok", { status: 200 }),
					);
					const qfetch = withRetryAfter({
						strategy: strategyMock(ctx, [1000]),
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
				},
			);

			await ctx.test("with a Retry-After header", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(2);
				const fetchMock = ctx.mock.fn(
					fetch,
					async () =>
						new Response("ok", {
							status: 200,
							headers: { "Retry-After": "10" },
						}),
				);
				const qfetch = withRetryAfter({
					strategy: strategyMock(ctx, [1000]),
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
				ctx.assert.strictEqual(body, "ok", "returns response without retry");
			});
		});

		test("completes without retrying on non-retryable status code", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("not ok", { status: 404 }),
			);
			const qfetch = withRetryAfter({
				strategy: strategyMock(ctx, [1000]),
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
			ctx.assert.strictEqual(body, "not ok", "returns error response");
		});

		test("completes without retrying when missing Retry-After header", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("not ok", { status: 429 }),
			);
			const qfetch = withRetryAfter({
				strategy: strategyMock(ctx, [1000]),
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
			ctx.assert.strictEqual(body, "not ok", "returns error response");
		});

		test("completes without retrying when Retry-After value is invalid", async (ctx: TestContext) => {
			ctx.plan(6);

			await ctx.test("empty string", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(2);
				const fetchMock = ctx.mock.fn(
					fetch,
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "" },
						}),
				);
				const qfetch = withRetryAfter({
					strategy: strategyMock(ctx, [1000]),
				})(fetchMock);

				// Act
				const response = await qfetch("https://example.com");
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(fetchMock.mock.callCount(), 1, "does not retry");
				ctx.assert.strictEqual(body, "not ok", "returns error response");
			});

			await ctx.test("invalid date string", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(2);
				const fetchMock = ctx.mock.fn(
					fetch,
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "invalid-number" },
						}),
				);
				const qfetch = withRetryAfter({
					strategy: strategyMock(ctx, [1000]),
				})(fetchMock);

				// Act
				const response = await qfetch("https://example.com");
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(fetchMock.mock.callCount(), 1, "does not retry");
				ctx.assert.strictEqual(body, "not ok", "returns error response");
			});

			await ctx.test("float number", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(2);
				const fetchMock = ctx.mock.fn(
					fetch,
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10.1" },
						}),
				);
				const qfetch = withRetryAfter({
					strategy: strategyMock(ctx, [1000]),
				})(fetchMock);

				// Act
				const response = await qfetch("https://example.com");
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(fetchMock.mock.callCount(), 1, "does not retry");
				ctx.assert.strictEqual(body, "not ok", "returns error response");
			});

			await ctx.test("negative number", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(2);
				const fetchMock = ctx.mock.fn(
					fetch,
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "-10" },
						}),
				);
				const qfetch = withRetryAfter({
					strategy: strategyMock(ctx, [1000]),
				})(fetchMock);

				// Act
				const response = await qfetch("https://example.com");
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(fetchMock.mock.callCount(), 1, "does not retry");
				ctx.assert.strictEqual(body, "not ok", "returns error response");
			});

			await ctx.test("ISO date format", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(2);
				const fetchMock = ctx.mock.fn(
					fetch,
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "2024-12-01T10:30:00Z" },
						}),
				);
				const qfetch = withRetryAfter({
					strategy: strategyMock(ctx, [1000]),
				})(fetchMock);

				// Act
				const response = await qfetch("https://example.com");
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(fetchMock.mock.callCount(), 1, "does not retry");
				ctx.assert.strictEqual(body, "not ok", "returns error response");
			});

			await ctx.test("non-GMT HTTP date format", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(2);
				const fetchMock = ctx.mock.fn(
					fetch,
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "Wed, 15 Jan 2025 10:00:00 PST" },
						}),
				);
				const qfetch = withRetryAfter({
					strategy: strategyMock(ctx, [1000]),
				})(fetchMock);

				// Act
				const response = await qfetch("https://example.com");
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(fetchMock.mock.callCount(), 1, "does not retry");
				ctx.assert.strictEqual(body, "not ok", "returns error response");
			});
		});
	});

	describe("retry is correctly triggered and delayed by Retry-After header", () => {
		test("uses delay-seconds format to calculate and wait for delay", async (ctx: TestContext) => {
			ctx.plan(3);

			// Arrange: Enable timer mocks using the parent test's context
			ctx.beforeEach((ctx: TestContext) => {
				ctx.mock.timers.enable({ apis: ["setTimeout"] });
			});
			ctx.afterEach((ctx: TestContext) => {
				ctx.mock.timers.reset();
			});

			await ctx.test(
				"retries after specified positive delay in seconds",
				async (ctx: TestContext) => {
					// Arrange
					ctx.plan(3);
					const fetchMock = ctx.mock.fn(
						fetch,
						async () => new Response("ok", { status: 200 }),
					);
					fetchMock.mock.mockImplementationOnce(
						async () =>
							new Response("not ok", {
								status: 429,
								headers: { "Retry-After": "10" },
							}),
					);
					const qfetch = withRetryAfter({
						strategy: strategyMock(ctx, [0, 0, 0]),
					})(fetchMock);

					// Act
					const responsePromise = qfetch("https://example.com");
					await flushMicrotasks();
					ctx.mock.timers.tick(5_000);

					// Assert
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						1,
						"initial request completed",
					);

					// Act
					await flushMicrotasks();
					ctx.mock.timers.tick(5_000);
					const response = await responsePromise;
					const body = await response.text();

					// Assert
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						2,
						"retries after 10 seconds",
					);
					ctx.assert.strictEqual(body, "ok", "returns successful response");
				},
			);

			await ctx.test(
				"retries immediately when delay is zero seconds",
				async (ctx: TestContext) => {
					// Arrange
					ctx.plan(3);
					const fetchMock = ctx.mock.fn(
						fetch,
						async () => new Response("ok", { status: 200 }),
					);
					fetchMock.mock.mockImplementationOnce(
						async () =>
							new Response("not ok", {
								status: 429,
								headers: { "Retry-After": "0" },
							}),
					);
					const qfetch = withRetryAfter({
						strategy: strategyMock(ctx, [0, 0, 0]),
					})(fetchMock);

					// Act
					const responsePromise = qfetch("https://example.com");
					await flushMicrotasks();
					ctx.mock.timers.tick(1);

					// Assert
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						1,
						"initial request completed",
					);

					// Act
					await flushMicrotasks();
					ctx.mock.timers.tick(2);
					const response = await responsePromise;
					const body = await response.text();

					// Assert
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						2,
						"retries immediately",
					);
					ctx.assert.strictEqual(body, "ok", "returns successful response");
				},
			);

			await ctx.test(
				"handles maximum allowed INT32_MAX equivalent in seconds",
				async (ctx: TestContext) => {
					// Arrange
					ctx.plan(3);
					const fetchMock = ctx.mock.fn(
						fetch,
						async () => new Response("ok", { status: 200 }),
					);
					fetchMock.mock.mockImplementationOnce(
						async () =>
							new Response("not ok", {
								status: 429,
								headers: { "Retry-After": "2147483" }, // INT32_MAX / 1000
							}),
					);
					const qfetch = withRetryAfter({
						strategy: strategyMock(ctx, [0]),
					})(fetchMock);

					// Act
					const responsePromise = qfetch("https://example.com");
					await flushMicrotasks();
					ctx.mock.timers.tick(2_147_483_647);

					// Assert
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						1,
						"initial request completed",
					);

					// Act
					await flushMicrotasks();
					const response = await responsePromise;
					const body = await response.text();

					// Assert
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						2,
						"retries after INT32_MAX delay",
					);
					ctx.assert.strictEqual(body, "ok", "returns successful response");
				},
			);
		});

		test("uses HTTP-date format to calculate and wait for delay", async (ctx: TestContext) => {
			ctx.plan(3);

			// Arrange: Enable timer mocks using the parent test's context
			ctx.beforeEach((ctx: TestContext) => {
				ctx.mock.timers.enable({ apis: ["setTimeout"] });
			});
			ctx.afterEach((ctx: TestContext) => {
				ctx.mock.timers.reset();
			});

			await ctx.test(
				"retries after computed delay from a future HTTP-date",
				async (ctx: TestContext) => {
					// Arrange
					ctx.plan(3);
					ctx.mock.timers.setTime(
						new Date("2025-01-15T10:00:00.000Z").getTime(),
					);
					const futureDate = "Wed, 15 Jan 2025 10:00:10 GMT";
					const fetchMock = ctx.mock.fn(
						fetch,
						async () => new Response("ok", { status: 200 }),
					);
					fetchMock.mock.mockImplementationOnce(
						async () =>
							new Response("not ok", {
								status: 429,
								headers: { "Retry-After": futureDate },
							}),
					);
					const qfetch = withRetryAfter({
						strategy: strategyMock(ctx, [0, 0, 0]),
					})(fetchMock);

					// Act
					const responsePromise = qfetch("https://example.com");
					await flushMicrotasks();
					ctx.mock.timers.tick(5_000);

					// Assert
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						1,
						"initial request completed",
					);

					// Act
					await flushMicrotasks();
					ctx.mock.timers.tick(5_000);
					const response = await responsePromise;
					const body = await response.text();

					// Assert
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						2,
						"retries after 10 seconds",
					);
					ctx.assert.strictEqual(body, "ok", "returns successful response");
				},
			);

			await ctx.test(
				"retries immediately from a present or past HTTP-date",
				async (ctx: TestContext) => {
					// Arrange
					ctx.plan(3);
					ctx.mock.timers.setTime(
						new Date("2025-01-15T10:00:00.000Z").getTime(),
					);
					const pastDate = "Wed, 15 Jan 2025 09:59:50 GMT";
					const fetchMock = ctx.mock.fn(
						fetch,
						async () => new Response("ok", { status: 200 }),
					);
					fetchMock.mock.mockImplementationOnce(
						async () =>
							new Response("not ok", {
								status: 429,
								headers: { "Retry-After": pastDate },
							}),
					);
					const qfetch = withRetryAfter({
						strategy: strategyMock(ctx, [0, 0, 0]),
					})(fetchMock);

					// Act
					const responsePromise = qfetch("https://example.com");
					await flushMicrotasks();
					ctx.mock.timers.tick(1);

					// Assert
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						1,
						"initial request completed",
					);

					// Act
					await flushMicrotasks();
					ctx.mock.timers.tick(1);
					const response = await responsePromise;
					const body = await response.text();

					// Assert
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						2,
						"retries immediately for past date",
					);
					ctx.assert.strictEqual(body, "ok", "returns successful response");
				},
			);

			await ctx.test(
				"handles maximum allowed INT32_MAX equivalent in HTTP-date",
				async (ctx: TestContext) => {
					// Arrange
					ctx.plan(3);
					ctx.mock.timers.setTime(
						new Date("2025-01-15T10:00:00.000Z").getTime(),
					);
					// INT32_MAX milliseconds = 2147483647ms = ~24.8 days
					const futureTime =
						new Date("2025-01-15T10:00:00.000Z").getTime() + 2_147_483_647;
					const futureDate = new Date(futureTime).toUTCString();
					const fetchMock = ctx.mock.fn(
						fetch,
						async () => new Response("ok", { status: 200 }),
					);
					fetchMock.mock.mockImplementationOnce(
						async () =>
							new Response("not ok", {
								status: 429,
								headers: { "Retry-After": futureDate },
							}),
					);
					const qfetch = withRetryAfter({
						strategy: strategyMock(ctx, [0]),
					})(fetchMock);

					// Act
					const responsePromise = qfetch("https://example.com");
					await flushMicrotasks();
					ctx.mock.timers.tick(2_147_483_647);

					// Assert
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						1,
						"initial request completed",
					);

					// Act
					await flushMicrotasks();
					const response = await responsePromise;
					const body = await response.text();

					// Assert
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						2,
						"retries after INT32_MAX delay",
					);
					ctx.assert.strictEqual(body, "ok", "returns successful response");
				},
			);
		});

		test("succeeds after first retry attempt", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("not ok", {
						status: 429,
						headers: { "Retry-After": "1" },
					}),
			);
			const qfetch = withRetryAfter({
				strategy: strategyMock(ctx, [0, 0, 0]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);
			const response = await responsePromise;
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(fetchMock.mock.callCount(), 2, "retries once");
			ctx.assert.strictEqual(response.status, 200, "returns success status");
			ctx.assert.strictEqual(body, "ok", "returns successful response");
		});
	});

	describe("backoff strategy controls jitter and attempt limits", () => {
		test("uses fresh strategy state for each top-level request", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			const strategyFactory = ctx.mock.fn(strategyMock(ctx, [0]));

			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);

			const qfetch = withRetryAfter({
				strategy: strategyFactory,
			})(fetchMock);

			// Act - first request
			const promise1 = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);
			await promise1;

			// Act - second request
			const promise2 = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);
			await promise2;

			// Assert
			ctx.assert.strictEqual(
				strategyFactory.mock.callCount(),
				2,
				"creates strategy once per request",
			);
		});

		test("adds strategy backoff delay on top of server delay", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("not ok", {
						status: 429,
						headers: { "Retry-After": "10" },
					}),
			);
			const qfetch = withRetryAfter({
				strategy: strategyMock(ctx, [5_000, Number.NaN]), // 5 second backoff
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(10_000);

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"waits for full delay",
			);

			// Act - advance by strategy backoff
			await flushMicrotasks();
			ctx.mock.timers.tick(5_000);
			await responsePromise;

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				2,
				"retries after server delay plus backoff (15s total)",
			);
		});

		test("waits for server delay only when strategy returns zero backoff", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("not ok", {
						status: 429,
						headers: { "Retry-After": "10" },
					}),
			);
			const qfetch = withRetryAfter({
				strategy: strategyMock(ctx, [0, Number.NaN]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(10_000);
			const response = await responsePromise;

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				2,
				"retries after server delay",
			);
			ctx.assert.strictEqual(
				response.status,
				200,
				"returns successful response",
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
						status: 429,
						headers: { "Retry-After": "1" },
					}),
			);
			const qfetch = withRetryAfter({
				strategy: strategyMock(ctx, [0, Number.NaN]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);
			const response = await responsePromise;
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				2,
				"initial request plus one retry",
			);
			ctx.assert.strictEqual(response.status, 429, "returns error status");
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
				async () => new Response("ok", { status: 200 }),
			);
			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("not ok", {
						status: 429,
						headers: { "Retry-After": "1" },
					}),
			);
			const qfetch = withRetryAfter({
				strategy: strategyMock(ctx, [Number.NaN]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);
			const response = await responsePromise;
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(fetchMock.mock.callCount(), 1, "does not retry");
			ctx.assert.strictEqual(body, "not ok", "returns initial error response");
		});

		test("uses INT32_MAX server delay without adding extra backoff delay", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("not ok", {
						status: 429,
						headers: { "Retry-After": "2147483" }, // INT32_MAX / 1000
					}),
			);
			const qfetch = withRetryAfter({
				strategy: strategyMock(ctx, [0, Number.NaN]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(2_147_483_647);

			// Assert
			await responsePromise;
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				2,
				"retries after INT32_MAX without extra backoff",
			);
			ctx.assert.strictEqual(
				fetchMock.mock.calls[1]?.arguments[0],
				"https://example.com",
				"retries with correct URL",
			);
		});
	});

	describe("server delay constraints are enforced to prevent excessive waits", () => {
		test("enforces constraint checks on the server-provided delay", async (ctx: TestContext) => {
			ctx.plan(3);

			// Arrange: Enable timer mocks using the parent test's context
			ctx.beforeEach((ctx: TestContext) => {
				ctx.mock.timers.enable({ apis: ["setTimeout"] });
			});
			ctx.afterEach((ctx: TestContext) => {
				ctx.mock.timers.reset();
			});

			await ctx.test(
				"retries when server delay is within maximum limit",
				async (ctx: TestContext) => {
					// Arrange
					ctx.plan(2);
					const fetchMock = ctx.mock.fn(
						fetch,
						async () => new Response("ok", { status: 200 }),
					);
					fetchMock.mock.mockImplementationOnce(
						async () =>
							new Response("not ok", {
								status: 429,
								headers: { "Retry-After": "10" },
							}),
					);
					const qfetch = withRetryAfter({
						strategy: strategyMock(ctx, [0, 0, 0]),
						maxServerDelay: 20_000,
					})(fetchMock);

					// Act
					const responsePromise = qfetch("https://example.com");
					await flushMicrotasks();
					ctx.mock.timers.tick(10_000);
					const response = await responsePromise;
					const body = await response.text();

					// Assert
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						2,
						"retries when delay within max",
					);
					ctx.assert.strictEqual(body, "ok", "returns successful response");
				},
			);

			await ctx.test(
				"rejects with constraint error when delay exceeds maximum limit (non-zero maxServerDelay)",
				async (ctx: TestContext) => {
					// Arrange
					ctx.plan(2);
					const fetchMock = ctx.mock.fn(
						fetch,
						async () => new Response("ok", { status: 200 }),
					);
					fetchMock.mock.mockImplementationOnce(
						async () =>
							new Response("not ok", {
								status: 429,
								headers: { "Retry-After": "10" },
							}),
					);
					const qfetch = withRetryAfter({
						strategy: strategyMock(ctx, [0, 0, 0]),
						maxServerDelay: 5_000,
					})(fetchMock);

					// Act
					const responsePromise = qfetch("https://example.com");
					ctx.mock.timers.tick(10_000);

					// Assert
					await ctx.assert.rejects(
						() => responsePromise,
						(e: unknown) =>
							e instanceof DOMException && e.name === "ConstraintError",
						"throws ConstraintError when delay exceeds max",
					);
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						1,
						"does not retry",
					);
				},
			);

			await ctx.test(
				"rejects with constraint error when delay exceeds maximum limit (zero maxServerDelay)",
				async (ctx: TestContext) => {
					// Arrange
					ctx.plan(2);
					const fetchMock = ctx.mock.fn(
						fetch,
						async () => new Response("ok", { status: 200 }),
					);
					fetchMock.mock.mockImplementationOnce(
						async () =>
							new Response("not ok", {
								status: 429,
								headers: { "Retry-After": "10" },
							}),
					);
					const qfetch = withRetryAfter({
						strategy: strategyMock(ctx, [0, 0, 0]),
						maxServerDelay: 0,
					})(fetchMock);

					// Act
					const responsePromise = qfetch("https://example.com");
					ctx.mock.timers.tick(10_000);

					// Assert
					await ctx.assert.rejects(
						() => responsePromise,
						(e: unknown) =>
							e instanceof DOMException && e.name === "ConstraintError",
						"throws ConstraintError when delay exceeds zero max",
					);
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						1,
						"does not retry",
					);
				},
			);
		});

		test("allows unlimited delay when maxServerDelay option is non-positive or invalid", async (ctx: TestContext) => {
			ctx.plan(4);

			await ctx.test("undefined maxServerDelay", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(3);
				ctx.mock.timers.enable({ apis: ["setTimeout"] });
				const fetchMock = ctx.mock.fn(
					fetch,
					async () => new Response("ok", { status: 200 }),
				);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" },
						}),
				);
				const qfetch = withRetryAfter({
					strategy: strategyMock(ctx, [0, 0, 0]),
				})(fetchMock);

				// Act
				const responsePromise = qfetch("https://example.com");
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"initial request completed",
				);

				// Act
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);
				const response = await responsePromise;
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"retries after 10 seconds",
				);
				ctx.assert.strictEqual(body, "ok", "returns successful response");
			});

			await ctx.test("negative maxServerDelay", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(3);
				ctx.mock.timers.enable({ apis: ["setTimeout"] });
				const fetchMock = ctx.mock.fn(
					fetch,
					async () => new Response("ok", { status: 200 }),
				);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" },
						}),
				);
				const qfetch = withRetryAfter({
					strategy: strategyMock(ctx, [0, 0, 0]),
					maxServerDelay: -100,
				})(fetchMock);

				// Act
				const responsePromise = qfetch("https://example.com");
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"initial request completed",
				);

				// Act
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);
				const response = await responsePromise;
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"retries after 10 seconds with negative max",
				);
				ctx.assert.strictEqual(body, "ok", "returns successful response");
			});

			await ctx.test("non-numeric maxServerDelay", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(3);
				ctx.mock.timers.enable({ apis: ["setTimeout"] });
				const fetchMock = ctx.mock.fn(
					fetch,
					async () => new Response("ok", { status: 200 }),
				);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" },
						}),
				);
				const qfetch = withRetryAfter({
					strategy: strategyMock(ctx, [0, 0, 0]),
					// biome-ignore lint/suspicious/noExplicitAny: testing invalid input
					maxServerDelay: "invalid" as any,
				})(fetchMock);

				// Act
				const responsePromise = qfetch("https://example.com");
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"initial request completed",
				);

				// Act
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);
				const response = await responsePromise;
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"retries after 10 seconds with non-numeric max",
				);
				ctx.assert.strictEqual(body, "ok", "returns successful response");
			});

			await ctx.test("NaN maxServerDelay", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(3);
				ctx.mock.timers.enable({ apis: ["setTimeout"] });
				const fetchMock = ctx.mock.fn(
					fetch,
					async () => new Response("ok", { status: 200 }),
				);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" },
						}),
				);
				const qfetch = withRetryAfter({
					strategy: strategyMock(ctx, [0, 0, 0]),
					maxServerDelay: Number.NaN,
				})(fetchMock);

				// Act
				const responsePromise = qfetch("https://example.com");
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"initial request completed",
				);

				// Act
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);
				const response = await responsePromise;
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"retries after 10 seconds with NaN max",
				);
				ctx.assert.strictEqual(body, "ok", "returns successful response");
			});
		});

		test("rejects with range error when total delay exceeds INT32_MAX (2147483647ms)", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("not ok", {
						status: 429,
						headers: { "Retry-After": "2147483648" }, // INT32_MAX + 1
					}),
			);
			const qfetch = withRetryAfter({
				strategy: strategyMock(ctx, [0, 0, 0]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			ctx.mock.timers.tick(10_000);

			// Assert
			await ctx.assert.rejects(
				() => responsePromise,
				(e: unknown) => e instanceof RangeError,
				"throws RangeError when delay exceeds INT32_MAX",
			);
			ctx.assert.strictEqual(fetchMock.mock.callCount(), 1, "does not retry");
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
				async () =>
					new Response(testStream, {
						status: 429,
						headers: { "Retry-After": "1" },
					}),
			);

			const qfetch = withRetryAfter({
				strategy: strategyMock(ctx, [0, 0, 0]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);
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
				async () =>
					new Response(testStream, {
						status: 429,
						headers: { "Retry-After": "1" },
					}),
			);

			const qfetch = withRetryAfter({
				strategy: strategyMock(ctx, [0, 0, 0]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);
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
				async () =>
					new Response(null, {
						status: 429,
						headers: { "Retry-After": "1" },
					}),
			);
			const qfetch = withRetryAfter({
				strategy: strategyMock(ctx, [0, 0, 0]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);
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
				async () =>
					new Response("not ok", {
						status: 429,
						headers: { "Retry-After": "10" },
					}),
			);
			const controller = new AbortController();

			const qfetch = withRetryAfter({
				strategy: strategyMock(ctx, [0, 0, 0]),
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
			ctx.mock.timers.tick(10_000);

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
				async () =>
					new Response("not ok", {
						status: 429,
						headers: { "Retry-After": "10" },
					}),
			);
			const controller = new AbortController();
			const request = new Request("https://example.com", {
				signal: controller.signal,
			});

			const qfetch = withRetryAfter({
				strategy: strategyMock(ctx, [0, 0, 0]),
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
			ctx.mock.timers.tick(10_000);

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
			ctx.plan(3);

			for (const status of [429, 502, 520]) {
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
									headers: { "Retry-After": "1" },
								}),
						);

						const qfetch = withRetryAfter({
							strategy: strategyMock(ctx, [0, 0]),
							retryableStatuses: new Set([429, 502, 520]),
						})(fetchMock);

						// Act
						const responsePromise = qfetch("https://example.com");
						await flushMicrotasks();
						ctx.mock.timers.tick(1_000);
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

		test("uses default statuses (429, 503) when option is not provided", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("not ok", {
						status: 503,
						headers: { "Retry-After": "1" },
					}),
			);

			// No custom status codes provided
			const qfetch = withRetryAfter({
				strategy: strategyMock(ctx, [0, 0]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);
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
						status: 429,
						headers: { "Retry-After": "1" },
					}),
			);

			// Empty set means no retries on any status code
			const qfetch = withRetryAfter({
				strategy: strategyMock(ctx, [0, 0]),
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
				429,
				"returns error response without retry",
			);
		});
	});
});
