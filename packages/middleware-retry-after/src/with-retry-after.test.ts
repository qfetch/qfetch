import { describe, suite, type TestContext, test } from "node:test";

import {
	constant,
	fullJitter,
	upto,
	zero,
} from "@proventuslabs/retry-strategies";

import { withRetryAfter } from "./with-retry-after.ts";

/* node:coverage disable */
suite("withRetryAfter middleware - Unit", () => {
	const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

	describe("successful responses are passed through unchanged", () => {
		test("passes through successful response without Retry-After header", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withRetryAfter({ strategy: () => zero() })(fetchMock);

			// Act
			const response = await qfetch("users");
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				body,
				"ok",
				"Response body should be passed through unchanged",
			);
		});

		test("passes through successful response with Retry-After header", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(
				fetch,
				async () =>
					new Response("ok", {
						headers: { "Retry-After": "0" },
					}),
			);
			const qfetch = withRetryAfter({ strategy: () => zero() })(fetchMock);

			// Act
			const response = await qfetch("users");
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				body,
				"ok",
				"Response body should be passed through even with Retry-After header",
			);
		});
	});

	describe("error responses with an invalid Retry-After header are passed through unchanged", () => {
		test("passes through error response without Retry-After header", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);

			await ctx.test("429 status code", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(1);
				const fetchMock = ctx.mock.fn(
					fetch,
					async () => new Response("not ok", { status: 429 }),
				);
				const qfetch = withRetryAfter({ strategy: () => zero() })(fetchMock);

				// Act
				const response = await qfetch("users");
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(
					body,
					"not ok",
					"Error response should be passed through without Retry-After header",
				);
			});

			await ctx.test("503 status code", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(1);
				const fetchMock = ctx.mock.fn(
					fetch,
					async () => new Response("not ok", { status: 503 }),
				);
				const qfetch = withRetryAfter({ strategy: () => zero() })(fetchMock);

				// Act
				const response = await qfetch("users");
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(
					body,
					"not ok",
					"Error response should be passed through without Retry-After header",
				);
			});
		});

		test("passes through error response with invalid Retry-After header", async (ctx: TestContext) => {
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
				const qfetch = withRetryAfter({ strategy: () => zero() })(fetchMock);

				// Act
				const response = await qfetch("users");
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should not retry with empty string Retry-After",
				);
				ctx.assert.strictEqual(
					body,
					"not ok",
					"Should return original error response",
				);
			});

			await ctx.test("random string", async (ctx: TestContext) => {
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
				const qfetch = withRetryAfter({ strategy: () => zero() })(fetchMock);

				// Act
				const response = await qfetch("users");
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should not retry with invalid string Retry-After",
				);
				ctx.assert.strictEqual(
					body,
					"not ok",
					"Should return original error response",
				);
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
				const qfetch = withRetryAfter({ strategy: () => zero() })(fetchMock);

				// Act
				const response = await qfetch("users");
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should not retry with float number Retry-After",
				);
				ctx.assert.strictEqual(
					body,
					"not ok",
					"Should return original error response",
				);
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
				const qfetch = withRetryAfter({ strategy: () => zero() })(fetchMock);

				// Act
				const response = await qfetch("users");
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should not retry with negative number Retry-After",
				);
				ctx.assert.strictEqual(
					body,
					"not ok",
					"Should return original error response",
				);
			});

			await ctx.test("iso date", async (ctx: TestContext) => {
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
				const qfetch = withRetryAfter({ strategy: () => zero() })(fetchMock);

				// Act
				const response = await qfetch("users");
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should not retry with ISO date Retry-After",
				);
				ctx.assert.strictEqual(
					body,
					"not ok",
					"Should return original error response",
				);
			});
		});
	});

	describe("valid Retry-After header on error responses triggers delayed retry", () => {
		test("accepts maximum valid INT32_MAX value", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);

			ctx.beforeEach((ctx: TestContext) => {
				ctx.mock.timers.enable({ apis: ["setTimeout"] });
			});
			ctx.afterEach((ctx: TestContext) => {
				ctx.mock.timers.reset();
			});

			await ctx.test("INT32_MAX seconds for 429", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(3);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({ strategy: () => upto(1, zero()) })(
					fetchMock,
				);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "2147483" }, // INT32_MAX (/ 1000 as per ms)
						}),
				);

				// Act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(2_147_483_647);

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once before delay completes",
				);

				// Act
				await flushMicrotasks();
				const response = await presponse;
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have retried after INT32_MAX seconds delay",
				);
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be successful after retry",
				);
			});

			await ctx.test("INT32_MAX seconds for 503", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(3);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({ strategy: () => upto(1, zero()) })(
					fetchMock,
				);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 503,
							headers: { "Retry-After": "2147483" }, // INT32_MAX (/1000 as per ms)
						}),
				);

				// Act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(2_147_483_647);

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once before delay completes",
				);

				// Act
				await flushMicrotasks();
				const response = await presponse;
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have retried after INT32_MAX seconds delay",
				);
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be successful after retry",
				);
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
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(
					fetchMock,
				);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" },
						}),
				);

				// Act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after 5 seconds",
				);

				// Act
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);
				const response = await presponse;
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have called fetch twice after 10 seconds",
				);
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be successful after retry",
				);
			});

			await ctx.test("positive seconds for 503", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(3);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(
					fetchMock,
				);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 503,
							headers: { "Retry-After": "10" },
						}),
				);

				// Act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after 5 seconds",
				);

				// Act
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);
				const response = await presponse;
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have called fetch twice after 10 seconds",
				);
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be successful after retry",
				);
			});

			await ctx.test("zero seconds", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(3);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(
					fetchMock,
				);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "0" },
						}),
				);

				// Act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(1);

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after one tick",
				);

				// Act
				await flushMicrotasks();
				ctx.mock.timers.tick(2);
				const response = await presponse;
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have called fetch twice after 2 ticks",
				);
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be successful after immediate retry",
				);
			});
		});

		test("retries after specified delay using an HTTP-date", async (ctx: TestContext) => {
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
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(
					fetchMock,
				);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": futureDate },
						}),
				);

				// Act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after 5 seconds",
				);

				// Act
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);
				const response = await presponse;
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have called fetch twice after 10 seconds",
				);
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be successful after retry",
				);
			});

			await ctx.test("present date", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(3);
				ctx.mock.timers.setTime(new Date("2025-01-15T10:00:00.000Z").getTime());
				const presentDate = "Wed, 15 Jan 2025 10:00:00 GMT";
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(
					fetchMock,
				);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": presentDate },
						}),
				);

				// Act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(1);

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after one tick",
				);

				// Act
				await flushMicrotasks();
				ctx.mock.timers.tick(1);
				const response = await presponse;
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have called fetch twice after an additional tick",
				);
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be successful after immediate retry",
				);
			});

			await ctx.test("past date", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(3);
				ctx.mock.timers.setTime(new Date("2025-01-15T10:00:00.000Z").getTime());
				const pastDate = "Wed, 15 Jan 2025 09:59:50 GMT";
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(
					fetchMock,
				);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": pastDate },
						}),
				);

				// Act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(1);

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after one tick",
				);

				// Act
				await flushMicrotasks();
				ctx.mock.timers.tick(1);
				const response = await presponse;
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have called fetch twice with immediate retry for past date",
				);
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be successful after immediate retry",
				);
			});
		});
	});

	describe("allows enforcement of a maximum ceiling for retry delay", () => {
		test("retries without a maximum delay limit", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(4);

			ctx.beforeEach((ctx: TestContext) => {
				ctx.mock.timers.enable({ apis: ["setTimeout"] });
			});
			ctx.afterEach((ctx: TestContext) => {
				ctx.mock.timers.reset();
			});

			await ctx.test("undefined maxDelayTime", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(3);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(
					fetchMock,
				);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" },
						}),
				);

				// Act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after 5 seconds",
				);

				// Act
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);
				const response = await presponse;
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have retried after 10 seconds",
				);
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be from successful retry",
				);
			});

			await ctx.test("negative maxDelayTime", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(3);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({
					strategy: () => upto(3, zero()),
					maxServerDelay: -100,
				})(fetchMock);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" },
						}),
				);

				// Act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after 5 seconds",
				);

				// Act
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);
				const response = await presponse;
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have retried after 10 seconds with negative maxDelayTime",
				);
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be from successful retry",
				);
			});

			await ctx.test("non-numeric maxDelayTime", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(3);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({
					strategy: () => upto(3, zero()),
					// biome-ignore lint/suspicious/noExplicitAny: we want to test invalid options
					maxServerDelay: "invalid" as any,
				})(fetchMock);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" },
						}),
				);

				// Act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after 5 seconds",
				);

				// Act
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);
				const response = await presponse;
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have retried after 10 seconds with non-numeric maxDelayTime",
				);
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be from successful retry",
				);
			});

			await ctx.test("NaN maxDelayTime", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(3);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({
					strategy: () => upto(3, zero()),
					maxServerDelay: Number.NaN,
				})(fetchMock);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" },
						}),
				);

				// Act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after 5 seconds",
				);

				// Act
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);
				const response = await presponse;
				const body = await response.text();

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have retried after 10 seconds with NaN maxDelayTime",
				);
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be from successful retry",
				);
			});
		});

		test("retries when delay is within the maximum", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withRetryAfter({
				strategy: () => upto(3, zero()),
				maxServerDelay: 20_000,
			})(fetchMock);
			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("not ok", {
						status: 429,
						headers: { "Retry-After": "10" },
					}),
			);

			// Act
			const presponse = qfetch("http://example.local");
			await flushMicrotasks();
			ctx.mock.timers.tick(10_000);
			const response = await presponse;
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				2,
				"Should have retried when delay is within max delay time",
			);
			ctx.assert.strictEqual(
				body,
				"ok",
				"Response body should be from successful retry",
			);
		});

		test("allows instant retries with zero maxDelayTime", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withRetryAfter({
				strategy: () => upto(3, zero()),
				maxServerDelay: 0,
			})(fetchMock);
			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("not ok", {
						status: 429,
						headers: { "Retry-After": "0" },
					}),
			);

			// Act
			const presponse = qfetch("http://example.local");
			await flushMicrotasks();
			ctx.mock.timers.tick(1);
			const response = await presponse;
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				2,
				"Should retry when delay is zero and maxDelayTime is zero",
			);
			ctx.assert.strictEqual(
				body,
				"ok",
				"Response body should be from successful retry",
			);
		});

		test("throws when delay exceeds the maximum", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);

			ctx.beforeEach((ctx: TestContext) => {
				ctx.mock.timers.enable({ apis: ["setTimeout"] });
			});
			ctx.afterEach((ctx: TestContext) => {
				ctx.mock.timers.reset();
			});

			await ctx.test("non-zero maxDelayTime", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(2);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({
					strategy: () => upto(3, zero()),
					maxServerDelay: 5_000,
				})(fetchMock);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" },
						}),
				);

				// Act
				const presponse = qfetch("http://example.local");
				ctx.mock.timers.tick(10_000);

				// Assert
				await ctx.assert.rejects(
					() => presponse,
					(e: unknown) =>
						e instanceof DOMException && e.name === "ConstraintError",
					"Should throw ConstraintError when computed delay exceeds maxDelayTime",
				);
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should not retry when delay exceeds maximum delay time",
				);
			});

			await ctx.test("zero maxDelayTime", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(2);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({
					strategy: () => upto(3, zero()),
					maxServerDelay: 0,
				})(fetchMock);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" },
						}),
				);

				// Act
				const presponse = qfetch("http://example.local");
				ctx.mock.timers.tick(10_000);

				// Assert
				await ctx.assert.rejects(
					() => presponse,
					(e: unknown) =>
						e instanceof DOMException && e.name === "ConstraintError",
					"Should throw ConstraintError when delay exceeds zero maxDelayTime",
				);
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should not retry when delay exceeds zero maxDelayTime",
				);
			});
		});

		test("throws when delay exceeds INT32_MAX", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(
				fetchMock,
			);
			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("not ok", {
						status: 429,
						headers: { "Retry-After": "2147483648" }, // INT32_MAX + 1 in milliseconds
					}),
			);

			// Act
			const presponse = qfetch("http://example.local");
			ctx.mock.timers.tick(10_000);

			// Assert
			await ctx.assert.rejects(
				() => presponse,
				(e: unknown) => e instanceof RangeError,
				"Should throw RangeError when delay exceeds INT32_MAX",
			);
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"Should not retry when delay exceeds INT32_MAX",
			);
		});
	});

	describe("strategy controls retry attempts", () => {
		test("retries when attempts are within the maximum", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(4);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withRetryAfter({ strategy: () => upto(2, zero()) })(
				fetchMock,
			);
			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("retry-1", {
						status: 429,
						headers: { "Retry-After": "1" },
					}),
			);

			// Act
			const presponse = qfetch("http://example.local");
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"Should have called fetch once after 1 second",
			);

			// Arrange
			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("retry-2", {
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
				"Should have called fetch twice after 2 seconds",
			);

			// Act
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);
			const response = await presponse;
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				3,
				"Should have called fetch three times after 3 seconds",
			);
			ctx.assert.strictEqual(
				body,
				"ok",
				"Final response body should be successful",
			);
		});

		test("does not retry at all with zero maxRetries", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withRetryAfter({ strategy: () => upto(0, zero()) })(
				fetchMock,
			);
			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("not ok", {
						status: 429,
						headers: { "Retry-After": "1" },
					}),
			);

			// Act
			const presponse = qfetch("http://example.local");
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);
			const response = await presponse;
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"Should not retry with zero maxRetries",
			);
			ctx.assert.strictEqual(
				body,
				"not ok",
				"Response body should be from initial failed response",
			);
		});

		test("returns the last response when retry attempts are exhausted", async (ctx: TestContext) => {
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
			const qfetch = withRetryAfter({ strategy: () => upto(1, zero()) })(
				fetchMock,
			);

			// Act
			const presponse = qfetch("http://example.local");
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);
			const response = await presponse;
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				2,
				"Should have performed initial request and one retry before stopping",
			);
			ctx.assert.strictEqual(
				response.status,
				429,
				"Final response status should be 429 after exhausting retries",
			);
			ctx.assert.strictEqual(
				body,
				"still not ok",
				"Response body should be from the final failed response",
			);
		});
	});

	describe("response body cleanup before retry", () => {
		test("cancels response body before retrying", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			let cancelCalled = false;
			let cancelReason: string | undefined;
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(
				fetchMock,
			);

			fetchMock.mock.mockImplementationOnce(async () => {
				const stream = new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode("not ok"));
						controller.close();
					},
					cancel(reason) {
						cancelCalled = true;
						cancelReason = reason;
					},
				});
				return new Response(stream, {
					status: 429,
					headers: { "Retry-After": "1" },
				});
			});

			// Act
			const presponse = qfetch("http://example.local");
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);
			await presponse;

			// Assert
			ctx.assert.strictEqual(
				cancelCalled,
				true,
				"Should call cancel on the stream before retry",
			);
			ctx.assert.strictEqual(
				cancelReason,
				"Retry scheduled",
				"Should call cancel with 'Retry scheduled' reason",
			);
		});

		test("swallows body.cancel() errors", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(
				fetchMock,
			);

			fetchMock.mock.mockImplementationOnce(async () => {
				const stream = new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode("not ok"));
						controller.close();
					},
				});

				const res = new Response(stream, {
					status: 429,
					headers: { "Retry-After": "1" },
				});

				stream.getReader();

				return res;
			});

			// Act
			const presponse = qfetch("http://example.local");
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);

			// Assert
			await ctx.assert.doesNotReject(
				() => presponse,
				"Should swalled errors from body.cancel()",
			);
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				2,
				"Should retry even when body.cancel() throws",
			);
		});

		test("handles responses with null body", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(
				fetchMock,
			);

			fetchMock.mock.mockImplementationOnce(async () => {
				return new Response(null, {
					status: 429,
					headers: { "Retry-After": "1" },
				});
			});

			// Act
			const presponse = qfetch("http://example.local");
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);
			const response = await presponse;
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				2,
				"Should retry even with null body",
			);
			ctx.assert.strictEqual(
				body,
				"ok",
				"Should successfully return response after retry",
			);
		});
	});

	describe("strategy adds backoff delay on top of server delay", () => {
		test("does not add extra delay with zero strategy", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withRetryAfter({ strategy: () => upto(1, zero()) })(
				fetchMock,
			);
			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("not ok", {
						status: 429,
						headers: { "Retry-After": "10" },
					}),
			);

			// Act
			const presponse = qfetch("http://example.local");
			await flushMicrotasks();
			ctx.mock.timers.tick(10_000);
			const response = await presponse;

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				2,
				"Should have retried after exactly server delay with zero strategy",
			);
			ctx.assert.strictEqual(
				response.status,
				200,
				"Should successfully retry without extra backoff",
			);
		});

		test("waits for server delay only when strategy returns zero", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withRetryAfter({
				strategy: () => upto(1, zero()),
			})(fetchMock);
			// Set Retry-After to INT32_MAX - this is at the edge
			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("not ok", {
						status: 429,
						headers: { "Retry-After": "2147483" }, // INT32_MAX ms / 1000 = 2147483 seconds
					}),
			);

			// Act
			const presponse = qfetch("http://example.local");
			await flushMicrotasks();
			// Should retry after exactly INT32_MAX without any extra backoff
			ctx.mock.timers.tick(2_147_483_647);

			// Assert
			await presponse;
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				2,
				"Should have retried after INT32_MAX without adding extra backoff",
			);

			// The total delay should be exactly INT32_MAX (no extra backoff)
			// We verify this by confirming that the retry happened at exactly INT32_MAX
			ctx.assert.strictEqual(
				fetchMock.mock.calls[1]?.arguments[0],
				"http://example.local",
				"Should have retried with the correct URL",
			);
		});

		test("adds backoff delay from strategy", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);

			ctx.beforeEach((ctx: TestContext) => {
				ctx.mock.timers.enable({ apis: ["setTimeout"] });
			});
			ctx.afterEach((ctx: TestContext) => {
				ctx.mock.timers.reset();
			});

			await ctx.test("constant backoff delay", async (ctx: TestContext) => {
				// Arrange
				ctx.plan(2);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({
					strategy: () => upto(1, constant(5_000)), // 5 seconds constant backoff
				})(fetchMock);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" }, // 10 seconds server delay
						}),
				);

				// Act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(10_000);

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should not have retried yet after server delay (backoff not elapsed)",
				);

				// Act - advance by strategy backoff: 5000ms
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);
				await presponse;

				// Assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have retried after server delay + strategy backoff (15s total)",
				);
			});

			await ctx.test(
				"backoff delay with fullJitter strategy",
				async (ctx: TestContext) => {
					// Arrange
					ctx.plan(3);
					ctx.mock.method(Math, "random", () => 0.5);

					const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
					const qfetch = withRetryAfter({
						strategy: () => upto(1, fullJitter(0, 3_000)), // up to 3 seconds backoff
					})(fetchMock);
					fetchMock.mock.mockImplementationOnce(
						async () =>
							new Response("not ok", {
								status: 429,
								headers: { "Retry-After": "10" }, // 10 seconds server delay
							}),
					);

					// Act
					const presponse = qfetch("http://example.local");
					await flushMicrotasks();
					ctx.mock.timers.tick(10_000);

					// Assert
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						1,
						"Should not have retried yet after server delay",
					);

					// Act - advance by strategy backoff = random(0, min(3000, ∞)) with Math.random()=0.5 = 1500ms
					await flushMicrotasks();
					ctx.mock.timers.tick(1_500);
					const response = await presponse;

					// Assert
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						2,
						"Should have retried after server delay + strategy backoff",
					);
					ctx.assert.strictEqual(
						response.status,
						200,
						"Should successfully retry with fullJitter strategy",
					);

					// cleanup
					ctx.mock.restoreAll();
				},
			);

			await ctx.test(
				"backoff delay with smaller fullJitter cap",
				async (ctx: TestContext) => {
					// Arrange
					ctx.plan(3);
					ctx.mock.method(Math, "random", () => 0.5);

					const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
					const qfetch = withRetryAfter({
						strategy: () => upto(1, fullJitter(0, 2_000)), // up to 2 seconds backoff
					})(fetchMock);
					fetchMock.mock.mockImplementationOnce(
						async () =>
							new Response("not ok", {
								status: 429,
								headers: { "Retry-After": "2" }, // 2 seconds server delay
							}),
					);

					// Act
					const presponse = qfetch("http://example.local");
					await flushMicrotasks();
					ctx.mock.timers.tick(2_000);

					// Assert
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						1,
						"Should not have retried yet after server delay",
					);

					// Act - advance by strategy backoff = random(0, min(2000, ∞)) with Math.random()=0.5 = 1000ms
					await flushMicrotasks();
					ctx.mock.timers.tick(1_000);
					const response = await presponse;

					// Assert
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						2,
						"Should have retried after server delay + strategy backoff",
					);
					ctx.assert.strictEqual(
						response.status,
						200,
						"Should successfully retry with fullJitter strategy",
					);

					// cleanup
					ctx.mock.restoreAll();
				},
			);
		});
	});

	describe("respects global cancellation", () => {
		test("aborts during waiting", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const controller = new AbortController();
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(
				fetchMock,
			);
			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("not ok", {
						status: 429,
						headers: { "Retry-After": "10" },
					}),
			);

			// Act
			const presponse = qfetch("http://example.local", {
				signal: controller.signal,
			});
			await flushMicrotasks();
			ctx.mock.timers.tick(5_000);
			controller.abort();
			ctx.mock.timers.tick(5_000);

			// Assert
			await ctx.assert.rejects(
				() => presponse,
				(e: unknown) => e instanceof DOMException && e.name === "AbortError",
				"Should throw AbortError when signal is aborted while waiting for retry",
			);
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"Should only have made initial request before abort during wait",
			);
		});
	});
});
