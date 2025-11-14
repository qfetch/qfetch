import { describe, it, type TestContext } from "node:test";

import { withRetryAfter } from "./with-retry-after.ts";

/* node:coverage disable */
describe("withRetryAfter middleware", () => {
	const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

	describe("Successful responses are passed through unchanged", () => {
		it("should pass through successful response without Retry-After header", async (ctx: TestContext) => {
			// arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withRetryAfter()(fetchMock);

			// act
			const response = await qfetch("users");
			const body = await response.text();

			// assert
			ctx.assert.strictEqual(
				body,
				"ok",
				"Response body should be passed through unchanged",
			);
		});

		it("should pass through successful response with Retry-After header", async (ctx: TestContext) => {
			// arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(
				fetch,
				async () =>
					new Response("ok", {
						headers: { "Retry-After": "0" },
					}),
			);
			const qfetch = withRetryAfter()(fetchMock);

			// act
			const response = await qfetch("users");
			const body = await response.text();

			// assert
			ctx.assert.strictEqual(
				body,
				"ok",
				"Response body should be passed through even with Retry-After header",
			);
		});
	});

	describe("Error responses with an invalid Retry-After header are passed through unchanged", () => {
		it("should pass through error response without Retry-After header", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);

			await ctx.test("429 status code", async (ctx: TestContext) => {
				// arrange
				ctx.plan(1);
				const fetchMock = ctx.mock.fn(
					fetch,
					async () => new Response("not ok", { status: 429 }),
				);
				const qfetch = withRetryAfter()(fetchMock);

				// act
				const response = await qfetch("users");
				const body = await response.text();

				// assert
				ctx.assert.strictEqual(
					body,
					"not ok",
					"Error response should be passed through without Retry-After header",
				);
			});

			await ctx.test("503 status code", async (ctx: TestContext) => {
				// arrange
				ctx.plan(1);
				const fetchMock = ctx.mock.fn(
					fetch,
					async () => new Response("not ok", { status: 503 }),
				);
				const qfetch = withRetryAfter()(fetchMock);

				// act
				const response = await qfetch("users");
				const body = await response.text();

				// assert
				ctx.assert.strictEqual(
					body,
					"not ok",
					"Error response should be passed through without Retry-After header",
				);
			});
		});

		it("should pass through error response with invalid Retry-After header", async (ctx: TestContext) => {
			// arrange
			ctx.plan(6);

			await ctx.test("empty string", async (ctx: TestContext) => {
				// arrange
				ctx.plan(2);
				const fetchMock = ctx.mock.fn(
					fetch,
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "" },
						}),
				);
				const qfetch = withRetryAfter()(fetchMock);

				// act
				const response = await qfetch("users");
				const body = await response.text();

				// assert
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
				// arrange
				ctx.plan(2);
				const fetchMock = ctx.mock.fn(
					fetch,
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "invalid-number" },
						}),
				);
				const qfetch = withRetryAfter()(fetchMock);

				// act
				const response = await qfetch("users");
				const body = await response.text();

				// assert
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
				// arrange
				ctx.plan(2);
				const fetchMock = ctx.mock.fn(
					fetch,
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10.1" },
						}),
				);
				const qfetch = withRetryAfter()(fetchMock);

				// act
				const response = await qfetch("users");
				const body = await response.text();

				// assert
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
				// arrange
				ctx.plan(2);
				const fetchMock = ctx.mock.fn(
					fetch,
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "-10" },
						}),
				);
				const qfetch = withRetryAfter()(fetchMock);

				// act
				const response = await qfetch("users");
				const body = await response.text();

				// assert
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
				// arrange
				ctx.plan(2);
				const fetchMock = ctx.mock.fn(
					fetch,
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "2024-12-01T10:30:00Z" },
						}),
				);
				const qfetch = withRetryAfter()(fetchMock);

				// act
				const response = await qfetch("users");
				const body = await response.text();

				// assert
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

			await ctx.test("exceeds INT32_MAX", async (ctx: TestContext) => {
				// arrange
				ctx.plan(2);
				const fetchMock = ctx.mock.fn(
					fetch,
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "2147483648" }, // INT32_MAX + 1
						}),
				);
				const qfetch = withRetryAfter()(fetchMock);

				// act
				const response = await qfetch("users");
				const body = await response.text();

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should not retry with Retry-After value exceeding INT32_MAX",
				);
				ctx.assert.strictEqual(
					body,
					"not ok",
					"Should return original error response",
				);
			});
		});
	});

	describe("Valid Retry-After header on error responses triggers delayed retry", () => {
		it("should accept maximum valid INT32_MAX value", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);

			ctx.beforeEach((ctx: TestContext) => {
				ctx.mock.timers.enable({ apis: ["setTimeout"] });
			});
			ctx.afterEach((ctx: TestContext) => {
				ctx.mock.timers.reset();
			});

			await ctx.test("INT32_MAX seconds for 429", async (ctx: TestContext) => {
				// arrange
				ctx.plan(3);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({ maxRetries: 1 })(fetchMock);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "2147483" }, // INT32_MAX (/ 1000 as per ms)
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(2_147_483_647);

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once before delay completes",
				);

				// act
				await flushMicrotasks();
				const response = await presponse;
				const body = await response.text();

				// assert
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
				// arrange
				ctx.plan(3);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({ maxRetries: 1 })(fetchMock);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 503,
							headers: { "Retry-After": "2147483" }, // INT32_MAX (/1000 as per ms)
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(2_147_483_647);

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once before delay completes",
				);

				// act
				await flushMicrotasks();
				const response = await presponse;
				const body = await response.text();

				// assert
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

		it("should retry after specified delay in seconds", async (ctx: TestContext) => {
			// arrange
			ctx.plan(3);

			ctx.beforeEach((ctx: TestContext) => {
				ctx.mock.timers.enable({ apis: ["setTimeout"] });
			});
			ctx.afterEach((ctx: TestContext) => {
				ctx.mock.timers.reset();
			});

			await ctx.test("positive seconds for 429", async (ctx: TestContext) => {
				// arrange
				ctx.plan(3);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({ maxRetries: 3 })(fetchMock);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after 5 seconds",
				);

				// act
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);
				const response = await presponse;
				const body = await response.text();

				// assert
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
				// arrange
				ctx.plan(3);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({ maxRetries: 3 })(fetchMock);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 503,
							headers: { "Retry-After": "10" },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after 5 seconds",
				);

				// act
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);
				const response = await presponse;
				const body = await response.text();

				// assert
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
				// arrange
				ctx.plan(3);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({ maxRetries: 3 })(fetchMock);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "0" },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(1);

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after one tick",
				);

				// act
				await flushMicrotasks();
				ctx.mock.timers.tick(2);
				const response = await presponse;
				const body = await response.text();

				// assert
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

		it("should retry after specified delay using an HTTP-date", async (ctx: TestContext) => {
			// arrange
			ctx.plan(3);

			ctx.beforeEach((ctx: TestContext) => {
				ctx.mock.timers.enable({ apis: ["setTimeout"] });
			});
			ctx.afterEach((ctx: TestContext) => {
				ctx.mock.timers.reset();
			});

			await ctx.test("future date", async (ctx: TestContext) => {
				// arrange
				ctx.plan(3);
				ctx.mock.timers.setTime(new Date("2025-01-15T10:00:00.000Z").getTime());
				const futureDate = "Wed, 15 Jan 2025 10:00:10 GMT";
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({ maxRetries: 3 })(fetchMock);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": futureDate },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after 5 seconds",
				);

				// act
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);
				const response = await presponse;
				const body = await response.text();

				// assert
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
				// arrange
				ctx.plan(3);
				ctx.mock.timers.setTime(new Date("2025-01-15T10:00:00.000Z").getTime());
				const presentDate = "Wed, 15 Jan 2025 10:00:00 GMT";
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({ maxRetries: 3 })(fetchMock);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": presentDate },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(1);

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after one tick",
				);

				// act
				await flushMicrotasks();
				ctx.mock.timers.tick(1);
				const response = await presponse;
				const body = await response.text();

				// assert
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
				// arrange
				ctx.plan(3);
				ctx.mock.timers.setTime(new Date("2025-01-15T10:00:00.000Z").getTime());
				const pastDate = "Wed, 15 Jan 2025 09:59:50 GMT";
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({ maxRetries: 3 })(fetchMock);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": pastDate },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(1);

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after one tick",
				);

				// act
				await flushMicrotasks();
				ctx.mock.timers.tick(1);
				const response = await presponse;
				const body = await response.text();

				// assert
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

	describe("Allows enforcement of a maximum ceiling for retry delay", () => {
		it("should retry without a maximum delay limit", async (ctx: TestContext) => {
			// arrange
			ctx.plan(4);

			ctx.beforeEach((ctx: TestContext) => {
				ctx.mock.timers.enable({ apis: ["setTimeout"] });
			});
			ctx.afterEach((ctx: TestContext) => {
				ctx.mock.timers.reset();
			});

			await ctx.test("undefined maxDelayTime", async (ctx: TestContext) => {
				// arrange
				ctx.plan(3);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({ maxRetries: 3 })(fetchMock);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after 5 seconds",
				);

				// act
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);
				const response = await presponse;
				const body = await response.text();

				// assert
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
				// arrange
				ctx.plan(3);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({
					maxRetries: 3,
					maxDelayTime: -100,
				})(fetchMock);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after 5 seconds",
				);

				// act
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);
				const response = await presponse;
				const body = await response.text();

				// assert
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
				// arrange
				ctx.plan(3);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({
					maxRetries: 3,
					// biome-ignore lint/suspicious/noExplicitAny: we want to test invalid options
					maxDelayTime: "invalid" as any,
				})(fetchMock);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after 5 seconds",
				);

				// act
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);
				const response = await presponse;
				const body = await response.text();

				// assert
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
				// arrange
				ctx.plan(3);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({
					maxRetries: 3,
					maxDelayTime: Number.NaN,
				})(fetchMock);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after 5 seconds",
				);

				// act
				await flushMicrotasks();
				ctx.mock.timers.tick(5_000);
				const response = await presponse;
				const body = await response.text();

				// assert
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

		it("should retry when delay is within the maximum", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withRetryAfter({
				maxRetries: 3,
				maxDelayTime: 20_000,
			})(fetchMock);
			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("not ok", {
						status: 429,
						headers: { "Retry-After": "10" },
					}),
			);

			// act
			const presponse = qfetch("http://example.local");
			await flushMicrotasks();
			ctx.mock.timers.tick(10_000);
			const response = await presponse;
			const body = await response.text();

			// assert
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

		it("should throw when delay exceeds the maximum", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);

			ctx.beforeEach((ctx: TestContext) => {
				ctx.mock.timers.enable({ apis: ["setTimeout"] });
			});
			ctx.afterEach((ctx: TestContext) => {
				ctx.mock.timers.reset();
			});

			await ctx.test("non-zero maxDelayTime", async (ctx: TestContext) => {
				// arrange
				ctx.plan(2);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({
					maxRetries: 3,
					maxDelayTime: 5_000,
				})(fetchMock);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				ctx.mock.timers.tick(10_000);

				// assert
				await ctx.assert.rejects(
					() => presponse,
					(e: unknown) => e instanceof DOMException && e.name === "AbortError",
					"Should throw AbortError when computed delay exceeds maxDelayTime",
				);
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should not retry when delay exceeds maximum delay time",
				);
			});

			await ctx.test("zero maxDelayTime", async (ctx: TestContext) => {
				// arrange
				ctx.plan(2);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({
					maxRetries: 3,
					maxDelayTime: 0,
				})(fetchMock);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				ctx.mock.timers.tick(10_000);

				// assert
				await ctx.assert.rejects(
					() => presponse,
					(e: unknown) => e instanceof DOMException && e.name === "AbortError",
					"Should throw AbortError when delay exceeds zero maxDelayTime",
				);
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should not retry when delay exceeds zero maxDelayTime",
				);
			});
		});

		it("should allow instant retries with zero maxDelayTime", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withRetryAfter({
				maxRetries: 3,
				maxDelayTime: 0,
			})(fetchMock);
			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("not ok", {
						status: 429,
						headers: { "Retry-After": "0" },
					}),
			);

			// act
			const presponse = qfetch("http://example.local");
			await flushMicrotasks();
			ctx.mock.timers.tick(1);
			const response = await presponse;
			const body = await response.text();

			// assert
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
	});

	describe("Response body cleanup before retry", () => {
		it("should cancel response body before retrying", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			let cancelCalled = false;
			let cancelReason: string | undefined;
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetchMock);

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

			// act
			const presponse = qfetch("http://example.local");
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);
			await presponse;

			// assert
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

		it("should swallow body.cancel() errors", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetchMock);

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

			// act
			const presponse = qfetch("http://example.local");
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);

			// assert
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

		it("should handle responses with null body", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetchMock);

			fetchMock.mock.mockImplementationOnce(async () => {
				const response = new Response(null, {
					status: 429,
					headers: { "Retry-After": "1" },
				});
				return response;
			});

			// act
			const presponse = qfetch("http://example.local");
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);
			const response = await presponse;
			const body = await response.text();

			// assert
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

	describe("Allows enforcement of a maximum ceiling for retry attempts", () => {
		it("should retry without a maximum retry limit", async (ctx: TestContext) => {
			// arrange
			ctx.plan(4);

			ctx.beforeEach((ctx: TestContext) => {
				ctx.mock.timers.enable({ apis: ["setTimeout"] });
			});
			ctx.afterEach((ctx: TestContext) => {
				ctx.mock.timers.reset();
			});

			await ctx.test("undefined maxRetries", async (ctx: TestContext) => {
				// arrange
				ctx.plan(2);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter()(fetchMock);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "1" },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(1_000);
				const response = await presponse;
				const body = await response.text();

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have retried once without retry limit",
				);
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be from successful retry",
				);
			});

			await ctx.test("negative maxRetries", async (ctx: TestContext) => {
				// arrange
				ctx.plan(2);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({ maxRetries: -5 })(fetchMock);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "1" },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(1_000);
				const response = await presponse;
				const body = await response.text();

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have retried once with negative maxRetries",
				);
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be from successful retry",
				);
			});

			await ctx.test("non-numeric maxRetries", async (ctx: TestContext) => {
				// arrange
				ctx.plan(2);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({
					// biome-ignore lint/suspicious/noExplicitAny: we want to test invalid options
					maxRetries: "invalid" as any,
				})(fetchMock);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "1" },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(1_000);
				const response = await presponse;
				const body = await response.text();

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have retried once with non-numeric maxRetries",
				);
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be from successful retry",
				);
			});

			await ctx.test("NaN maxRetries", async (ctx: TestContext) => {
				// arrange
				ctx.plan(2);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const qfetch = withRetryAfter({ maxRetries: Number.NaN })(fetchMock);
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "1" },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await flushMicrotasks();
				ctx.mock.timers.tick(1_000);
				const response = await presponse;
				const body = await response.text();

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have retried once with NaN maxRetries",
				);
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be from successful retry",
				);
			});
		});

		it("should retry when attempts are within the maximum", async (ctx: TestContext) => {
			// arrange
			ctx.plan(4);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetchMock);
			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("retry-1", {
						status: 429,
						headers: { "Retry-After": "1" },
					}),
			);

			// act
			const presponse = qfetch("http://example.local");
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);

			// assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"Should have called fetch once after 1 second",
			);

			// arrange
			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("retry-2", {
						status: 429,
						headers: { "Retry-After": "1" },
					}),
			);

			// act
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);

			// assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				2,
				"Should have called fetch twice after 2 seconds",
			);

			// act
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);
			const response = await presponse;
			const body = await response.text();

			// assert
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

		it("should not retry at all with zero maxRetries", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withRetryAfter({ maxRetries: 0 })(fetchMock);
			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("not ok", {
						status: 429,
						headers: { "Retry-After": "1" },
					}),
			);

			// act
			const presponse = qfetch("http://example.local");
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);
			const response = await presponse;
			const body = await response.text();

			// assert
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

		it("should return the last response when retry attempts are exhausted", async (ctx: TestContext) => {
			// arrange
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
			const qfetch = withRetryAfter({ maxRetries: 1 })(fetchMock);

			// act
			const presponse = qfetch("http://example.local");
			await flushMicrotasks();
			ctx.mock.timers.tick(1_000);
			const response = await presponse;
			const body = await response.text();

			// assert
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
});
