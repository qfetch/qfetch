import { describe, suite, type TestContext, test } from "node:test";

import type { BackoffStrategy } from "@proventuslabs/retry-strategies";

import { withRetryAfter } from "./with-retry-after.ts";

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

suite("withRetryAfter - Unit", () => {
	describe("successful responses", () => {
		test("returns successful response without retrying", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			const qfetch = withRetryAfter({
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

		test("ignores Retry-After header on successful responses", async (ctx: TestContext) => {
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
			ctx.assert.strictEqual(body, "ok", "returns response without retry");
		});
	});

	describe("error responses without Retry-After header", () => {
		test("returns error response without retrying", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);

			await ctx.test("status 429", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(2);
				const fetchMock = ctx.mock.fn(
					fetch,
					async () => new Response("not ok", { status: 429 }),
				);
				const qfetch = withRetryAfter({
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
				ctx.assert.strictEqual(body, "not ok", "returns error response");
			});

			await ctx.test("status 503", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(2);
				const fetchMock = ctx.mock.fn(
					fetch,
					async () => new Response("not ok", { status: 503 }),
				);
				const qfetch = withRetryAfter({
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
				ctx.assert.strictEqual(body, "not ok", "returns error response");
			});
		});

		test("returns error response with invalid Retry-After values", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(5);

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
					strategy: createMockStrategy([1000]),
				})(fetchMock);

				// Act
				const response = await qfetch("https://example.com");
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(fetchMock.mock.callCount(), 1, "does not retry");
				ctx.assert.strictEqual(body, "not ok", "returns error response");
			});

			await ctx.test("invalid string", async (ctx: TestContext) => {
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
					strategy: createMockStrategy([1000]),
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
					strategy: createMockStrategy([1000]),
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
					strategy: createMockStrategy([1000]),
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
					strategy: createMockStrategy([1000]),
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

	describe("valid Retry-After header with delay-seconds", () => {
		test("accepts maximum INT32_MAX value in milliseconds", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);

			ctx.beforeEach((ctx: TestContext) => {
				ctx.mock.timers.enable({ apis: ["setTimeout"] });
			});
			ctx.afterEach((ctx: TestContext) => {
				ctx.mock.timers.reset();
			});

			await ctx.test("status 429", async (ctx: TestContext) => {
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
					strategy: createMockStrategy([0]),
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
			});

			await ctx.test("status 503", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(3);
				const fetchMock = ctx.mock.fn(
					fetch,
					async () => new Response("ok", { status: 200 }),
				);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 503,
							headers: { "Retry-After": "2147483" }, // INT32_MAX / 1000
						}),
				);
				const qfetch = withRetryAfter({
					strategy: createMockStrategy([0]),
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
			});
		});

		test("retries after specified delay in seconds", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);

			ctx.beforeEach((ctx: TestContext) => {
				ctx.mock.timers.enable({ apis: ["setTimeout"] });
			});
			ctx.afterEach((ctx: TestContext) => {
				ctx.mock.timers.reset();
			});

			await ctx.test("positive seconds for 429", async (ctx: TestContext) => {
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
					strategy: createMockStrategy([0, 0, 0]),
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

			await ctx.test("positive seconds for 503", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(3);
				const fetchMock = ctx.mock.fn(
					fetch,
					async () => new Response("ok", { status: 200 }),
				);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 503,
							headers: { "Retry-After": "10" },
						}),
				);
				const qfetch = withRetryAfter({
					strategy: createMockStrategy([0, 0, 0]),
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

			await ctx.test("zero seconds", async (ctx: TestContext) => {
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
					strategy: createMockStrategy([0, 0, 0]),
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
			});
		});
	});

	describe("valid Retry-After header with HTTP-date", () => {
		test("retries after computed delay from HTTP-date", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);

			ctx.beforeEach((ctx: TestContext) => {
				ctx.mock.timers.enable({ apis: ["setTimeout"] });
			});
			ctx.afterEach((ctx: TestContext) => {
				ctx.mock.timers.reset();
			});

			await ctx.test("future date", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(3);
				ctx.mock.timers.setTime(new Date("2025-01-15T10:00:00.000Z").getTime());
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
					strategy: createMockStrategy([0, 0, 0]),
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

			await ctx.test("present date", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(3);
				ctx.mock.timers.setTime(new Date("2025-01-15T10:00:00.000Z").getTime());
				const presentDate = "Wed, 15 Jan 2025 10:00:00 GMT";
				const fetchMock = ctx.mock.fn(
					fetch,
					async () => new Response("ok", { status: 200 }),
				);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": presentDate },
						}),
				);
				const qfetch = withRetryAfter({
					strategy: createMockStrategy([0, 0, 0]),
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
					"retries immediately",
				);
				ctx.assert.strictEqual(body, "ok", "returns successful response");
			});

			await ctx.test("past date", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(3);
				ctx.mock.timers.setTime(new Date("2025-01-15T10:00:00.000Z").getTime());
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
					strategy: createMockStrategy([0, 0, 0]),
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
			});
		});
	});

	describe("maximum server delay enforcement", () => {
		test("retries without maximum delay limit", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(4);

			ctx.beforeEach((ctx: TestContext) => {
				ctx.mock.timers.enable({ apis: ["setTimeout"] });
			});
			ctx.afterEach((ctx: TestContext) => {
				ctx.mock.timers.reset();
			});

			await ctx.test("undefined maxServerDelay", async (ctx: TestContext) => {
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
					strategy: createMockStrategy([0, 0, 0]),
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
					strategy: createMockStrategy([0, 0, 0]),
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
					strategy: createMockStrategy([0, 0, 0]),
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
					strategy: createMockStrategy([0, 0, 0]),
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

		test("retries when delay is within maximum", async (ctx: TestContext) => {
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
				strategy: createMockStrategy([0, 0, 0]),
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
		});

		test("allows instant retries with zero maxServerDelay", async (ctx: TestContext) => {
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
						headers: { "Retry-After": "0" },
					}),
			);
			const qfetch = withRetryAfter({
				strategy: createMockStrategy([0, 0, 0]),
				maxServerDelay: 0,
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1);
			const response = await responsePromise;
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				2,
				"retries immediately when both delays are zero",
			);
			ctx.assert.strictEqual(body, "ok", "returns successful response");
		});

		test("throws when delay exceeds maximum", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);

			ctx.beforeEach((ctx: TestContext) => {
				ctx.mock.timers.enable({ apis: ["setTimeout"] });
			});
			ctx.afterEach((ctx: TestContext) => {
				ctx.mock.timers.reset();
			});

			await ctx.test("non-zero maxServerDelay", async (ctx: TestContext) => {
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
					strategy: createMockStrategy([0, 0, 0]),
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
				ctx.assert.strictEqual(fetchMock.mock.callCount(), 1, "does not retry");
			});

			await ctx.test("zero maxServerDelay", async (ctx: TestContext) => {
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
					strategy: createMockStrategy([0, 0, 0]),
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
				ctx.assert.strictEqual(fetchMock.mock.callCount(), 1, "does not retry");
			});
		});

		test("throws when delay exceeds INT32_MAX", async (ctx: TestContext) => {
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
				strategy: createMockStrategy([0, 0, 0]),
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

	describe("strategy-controlled retry limits", () => {
		test("retries when attempts are within maximum", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(4);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			const qfetch = withRetryAfter({
				strategy: createMockStrategy([0, 0, Number.NaN]),
			})(fetchMock);

			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("retry", {
						status: 429,
						headers: { "Retry-After": "1" },
					}),
			);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"initial request completed",
			);

			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("retry", {
						status: 429,
						headers: { "Retry-After": "1" },
					}),
			);

			// Act
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				2,
				"first retry completed",
			);

			// Act
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);
			const response = await responsePromise;
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				3,
				"second retry completed",
			);
			ctx.assert.strictEqual(body, "ok", "returns successful response");
		});

		test("does not retry with zero maxRetries", async (ctx: TestContext) => {
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
				strategy: createMockStrategy([Number.NaN]),
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

		test("returns last response when retries exhausted", async (ctx: TestContext) => {
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
				strategy: createMockStrategy([0, Number.NaN]),
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
	});

	describe("response body cleanup", () => {
		test("cancels response body before retry", async (ctx: TestContext) => {
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
				strategy: createMockStrategy([0, 0, 0]),
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
				strategy: createMockStrategy([0, 0, 0]),
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

		test("handles null body gracefully", async (ctx: TestContext) => {
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
				strategy: createMockStrategy([0, 0, 0]),
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
	});

	describe("strategy backoff delay", () => {
		test("waits for server delay only when strategy returns zero", async (ctx: TestContext) => {
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
				strategy: createMockStrategy([0, Number.NaN]),
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

		test("adds backoff delay from strategy on top of server delay", async (ctx: TestContext) => {
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
				strategy: createMockStrategy([5_000, Number.NaN]), // 5 second backoff
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

		test("uses INT32_MAX server delay without extra backoff", async (ctx: TestContext) => {
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
				strategy: createMockStrategy([0, Number.NaN]),
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

			const qfetch = withRetryAfter({
				strategy: createMockStrategy([0, 0]),
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

			const fetchMock = ctx.mock.fn(fetch, async (input, init) => {
				receivedInputs.push(input);
				receivedInits.push(init);
				return new Response("ok", { status: 200 });
			});
			fetchMock.mock.mockImplementationOnce(
				async (input: URL | RequestInfo, init?: RequestInit) => {
					receivedInputs.push(input);
					receivedInits.push(init);
					return new Response("not ok", {
						status: 429,
						headers: { "Retry-After": "1" },
					});
				},
			);

			const qfetch = withRetryAfter({
				strategy: createMockStrategy([0, 0]),
			})(fetchMock);

			const url = "https://example.com/api";
			const init = { method: "POST", body: "test data" };

			// Act
			const responsePromise = qfetch(url, init);
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);
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

	describe("strategy isolation", () => {
		test("creates new strategy instance for each request", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			const strategyFactory = ctx.mock.fn(createMockStrategy([0]));

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
	});

	describe("abort signal handling", () => {
		test("respects abort signal during retry delay", async (ctx: TestContext) => {
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
				strategy: createMockStrategy([0, 0, 0]),
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

		test("extracts signal from Request object", async (ctx: TestContext) => {
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
				strategy: createMockStrategy([0, 0, 0]),
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

	describe("custom retryable status codes", () => {
		test("retries only on custom status codes", async (ctx: TestContext) => {
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

			// Only retry on 429 and 503
			const qfetch = withRetryAfter({
				strategy: createMockStrategy([0, 0]),
				retryableStatuses: new Set([429, 503]),
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
				async () =>
					new Response("not ok", {
						status: 503,
						headers: { "Retry-After": "1" },
					}),
			);

			// Custom codes that don't include 503
			const qfetch = withRetryAfter({
				strategy: createMockStrategy([0, 0]),
				retryableStatuses: new Set([429, 502]),
			})(fetchMock);

			// Act
			const response = await qfetch("https://example.com");

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"does not retry on 503 when not in custom set",
			);
			ctx.assert.strictEqual(
				response.status,
				503,
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
						strategy: createMockStrategy([0, 0]),
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
				});
			}
		});

		test("uses default status codes when option is not provided", async (ctx: TestContext) => {
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
				strategy: createMockStrategy([0, 0]),
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

		test("allows empty set of retryable status codes", async (ctx: TestContext) => {
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
				strategy: createMockStrategy([0, 0]),
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
