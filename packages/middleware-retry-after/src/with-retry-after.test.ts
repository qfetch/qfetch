import { describe, it, type TestContext } from "node:test";

import { type RetryAfterOptions, withRetryAfter } from "./with-retry-after.ts";

describe("withRetryAfter middleware", () => {
	describe("Successful responses are passed through unchanged", () => {
		it("should pass through successful response without Retry-After header", async (ctx: TestContext) => {
			ctx.plan(1);

			// arrange
			const fetchMock = ctx.mock.fn(fetch, async () => {
				return new Response("ok");
			});
			const opts: RetryAfterOptions = {};
			const qfetch = withRetryAfter(opts)(fetchMock);

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
			ctx.plan(1);

			// arrange
			const fetchMock = ctx.mock.fn(fetch, async () => {
				return new Response("ok", {
					headers: { "Retry-After": "0" },
				});
			});
			const opts: RetryAfterOptions = {};
			const qfetch = withRetryAfter(opts)(fetchMock);

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
			ctx.plan(1);

			// arrange
			const fetchMock = ctx.mock.fn(fetch, async () => {
				return new Response("not ok", { status: 429 });
			});
			const opts: RetryAfterOptions = {};
			const qfetch = withRetryAfter(opts)(fetchMock);

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

		it("should pass through error response with invalid Retry-After header", async (ctx: TestContext) => {
			ctx.plan(5);

			// arrange
			const fetchMock = ctx.mock.fn(fetch, async () => {
				return new Response("ok");
			});
			const opts: RetryAfterOptions = {};
			const qfetch = withRetryAfter(opts)(fetchMock);

			ctx.afterEach((ctx: TestContext) => {
				fetchMock.mock.resetCalls();
				ctx.mock.timers.reset();
			});

			await ctx.test("empty string", async (ctx: TestContext) => {
				ctx.plan(2);

				// arrange
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "" },
						}),
				);

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
				ctx.plan(2);

				// arrange
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "invalid-number" },
						}),
				);

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
				ctx.plan(2);

				// arrange
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10.1" },
						}),
				);

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
				ctx.plan(2);

				// arrange
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "-10" },
						}),
				);

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
				ctx.plan(2);

				// arrange
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "2024-12-01T10:30:00Z" },
						}),
				);

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
		});
	});

	describe("Valid Retry-After header on error responses triggers delayed retry", () => {
		it("should retry after specified delay in seconds", async (ctx: TestContext) => {
			ctx.plan(2);

			// arrange
			const fetchMock = ctx.mock.fn(fetch, async () => {
				return new Response("ok");
			});
			const opts: RetryAfterOptions = {
				maxRetries: 3,
			};
			const qfetch = withRetryAfter(opts)(fetchMock);

			ctx.beforeEach((ctx: TestContext) => {
				ctx.mock.timers.enable();
			});
			ctx.afterEach((ctx: TestContext) => {
				fetchMock.mock.resetCalls();
				ctx.mock.timers.reset();
			});

			await ctx.test("positive seconds", async (ctx: TestContext) => {
				ctx.plan(3);

				// arrange
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await Promise.resolve(); // let microtask scheduling

				ctx.mock.timers.tick(5 * 1000);

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after 5 seconds",
				);

				// act
				ctx.mock.timers.tick(5 * 1000);
				const response = await presponse;

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have called fetch twice after 10 seconds",
				);

				const body = await response.text();
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be successful after retry",
				);
			});

			await ctx.test("zero seconds", async (ctx: TestContext) => {
				ctx.plan(3);

				// arrange
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "0" },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await Promise.resolve(); // let microtask scheduling

				ctx.mock.timers.tick(1);

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after one tick",
				);

				// act
				ctx.mock.timers.tick(2);
				const response = await presponse;

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have called fetch twice after 2 ticks",
				);

				const body = await response.text();
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be successful after immediate retry",
				);
			});
		});

		it("should retry after specified delay using an HTTP-date", async (ctx: TestContext) => {
			ctx.plan(3);

			// arrange
			const fetchMock = ctx.mock.fn(fetch, async () => {
				return new Response("ok");
			});
			const opts: RetryAfterOptions = {
				maxRetries: 3,
			};
			const qfetch = withRetryAfter(opts)(fetchMock);

			ctx.beforeEach((ctx: TestContext) => {
				ctx.mock.timers.enable();
			});
			ctx.afterEach((ctx: TestContext) => {
				fetchMock.mock.resetCalls();
				ctx.mock.timers.reset();
			});

			await ctx.test("future date", async (ctx: TestContext) => {
				ctx.plan(3);

				// arrange
				ctx.mock.timers.setTime(new Date("2025-01-15T10:00:00.000Z").getTime()); // Set current time
				const futureDate = "Wed, 15 Jan 2025 10:00:10 GMT"; // 10 seconds in the future

				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": futureDate },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await Promise.resolve(); // let microtask scheduling

				ctx.mock.timers.tick(5_000);

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after 5 seconds",
				);

				// act
				ctx.mock.timers.tick(5_000);
				const response = await presponse;

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have called fetch twice after 10 seconds",
				);

				const body = await response.text();
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be successful after retry",
				);
			});

			await ctx.test("present date", async (ctx: TestContext) => {
				ctx.plan(3);

				// arrange
				ctx.mock.timers.setTime(new Date("2025-01-15T10:00:00.000Z").getTime()); // Set current time
				const presentDate = "Wed, 15 Jan 2025 10:00:00 GMT"; // Same as current time

				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": presentDate },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await Promise.resolve();

				ctx.mock.timers.tick(1);

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after one tick",
				);

				// act
				ctx.mock.timers.tick(1);
				const response = await presponse;

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have called fetch twice after an additional tick",
				);

				const body = await response.text();
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be successful after immediate retry",
				);
			});

			await ctx.test("past date", async (ctx: TestContext) => {
				ctx.plan(3);

				// arrange
				ctx.mock.timers.setTime(new Date("2025-01-15T10:00:00.000Z").getTime()); // Set current time
				const pastDate = "Wed, 15 Jan 2025 09:59:50 GMT"; // 10 seconds in the past

				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": pastDate },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await Promise.resolve();

				ctx.mock.timers.tick(1);

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after one tick",
				);

				// act
				ctx.mock.timers.tick(1);
				const response = await presponse;

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have called fetch twice with immediate retry for past date",
				);

				const body = await response.text();
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
			ctx.plan(5);

			ctx.beforeEach((ctx: TestContext) => {
				ctx.mock.timers.enable();
			});
			ctx.afterEach((ctx: TestContext) => {
				ctx.mock.timers.reset();
			});

			await ctx.test("undefined maxDelayTime", async (ctx: TestContext) => {
				ctx.plan(3);

				// arrange
				const fetchMock = ctx.mock.fn(fetch, async () => {
					return new Response("ok");
				});
				const opts: RetryAfterOptions = {
					maxRetries: 3,
					// no maxDelayTime configured
				};
				const qfetch = withRetryAfter(opts)(fetchMock);

				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" }, // 10 seconds
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await Promise.resolve();

				ctx.mock.timers.tick(5_000);

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after 5 seconds",
				);

				// act
				ctx.mock.timers.tick(5_000);
				const response = await presponse;

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have retried after 10 seconds",
				);

				const body = await response.text();
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be from successful retry",
				);
			});

			await ctx.test("zero maxDelayTime", async (ctx: TestContext) => {
				ctx.plan(3);

				// arrange
				const fetchMock = ctx.mock.fn(fetch, async () => {
					return new Response("ok");
				});
				const opts: RetryAfterOptions = {
					maxRetries: 3,
					maxDelayTime: 0, // treated as unlimited
				};
				const qfetch = withRetryAfter(opts)(fetchMock);

				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" }, // 10 seconds
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await Promise.resolve();

				ctx.mock.timers.tick(5_000);

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after 5 seconds",
				);

				// act
				ctx.mock.timers.tick(5_000);
				const response = await presponse;

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have retried after 10 seconds with zero maxDelayTime",
				);

				const body = await response.text();
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be from successful retry",
				);
			});

			await ctx.test("negative maxDelayTime", async (ctx: TestContext) => {
				ctx.plan(3);

				// arrange
				const fetchMock = ctx.mock.fn(fetch, async () => {
					return new Response("ok");
				});
				const opts: RetryAfterOptions = {
					maxRetries: 3,
					maxDelayTime: -100, // treated as unlimited
				};
				const qfetch = withRetryAfter(opts)(fetchMock);

				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" }, // 10 seconds
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await Promise.resolve();

				ctx.mock.timers.tick(5_000);

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after 5 seconds",
				);

				// act
				ctx.mock.timers.tick(5_000);
				const response = await presponse;

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have retried after 10 seconds with negative maxDelayTime",
				);

				const body = await response.text();
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be from successful retry",
				);
			});

			await ctx.test("non-numeric maxDelayTime", async (ctx: TestContext) => {
				ctx.plan(3);

				// arrange
				const fetchMock = ctx.mock.fn(fetch, async () => {
					return new Response("ok");
				});
				const opts: RetryAfterOptions = {
					maxRetries: 3,
					// biome-ignore lint/suspicious/noExplicitAny: we want to test invalid options
					maxDelayTime: "invalid" as any, // treated as unlimited
				};
				const qfetch = withRetryAfter(opts)(fetchMock);

				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" }, // 10 seconds
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await Promise.resolve();

				ctx.mock.timers.tick(5_000);

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after 5 seconds",
				);

				// act
				ctx.mock.timers.tick(5_000);
				const response = await presponse;

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have retried after 10 seconds with non-numeric maxDelayTime",
				);

				const body = await response.text();
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be from successful retry",
				);
			});

			await ctx.test("NaN maxDelayTime", async (ctx: TestContext) => {
				ctx.plan(3);

				// arrange
				const fetchMock = ctx.mock.fn(fetch, async () => {
					return new Response("ok");
				});
				const opts: RetryAfterOptions = {
					maxRetries: 3,
					maxDelayTime: Number.NaN, // treated as unlimited
				};
				const qfetch = withRetryAfter(opts)(fetchMock);

				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" }, // 10 seconds
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await Promise.resolve();

				ctx.mock.timers.tick(5_000);

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"Should have called fetch once after 5 seconds",
				);

				// act
				ctx.mock.timers.tick(5_000);
				const response = await presponse;

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have retried after 10 seconds with NaN maxDelayTime",
				);

				const body = await response.text();
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be from successful retry",
				);
			});
		});

		it("should retry when delay is within the maximum", async (ctx: TestContext) => {
			ctx.plan(2);

			// arrange
			ctx.mock.timers.enable();
			const fetchMock = ctx.mock.fn(fetch, async () => {
				return new Response("ok");
			});
			const opts: RetryAfterOptions = {
				maxRetries: 3,
				maxDelayTime: 20_000, // 20 seconds
			};
			const qfetch = withRetryAfter(opts)(fetchMock);

			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("not ok", {
						status: 429,
						headers: { "Retry-After": "10" }, // 10 seconds < 20_000 ms
					}),
			);

			// act
			const presponse = qfetch("http://example.local");
			await Promise.resolve();

			ctx.mock.timers.tick(10_000);
			const response = await presponse;

			// assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				2,
				"Should have retried when delay is within max delay time",
			);

			const body = await response.text();
			ctx.assert.strictEqual(
				body,
				"ok",
				"Response body should be from successful retry",
			);
		});

		it("should throw when delay exceeds the maximum", async (ctx: TestContext) => {
			ctx.plan(2);

			// arrange
			ctx.mock.timers.enable();
			const fetchMock = ctx.mock.fn(fetch, async () => {
				return new Response("ok");
			});
			const opts: RetryAfterOptions = {
				maxRetries: 3,
				maxDelayTime: 5_000, // 5 seconds ceiling
			};
			const qfetch = withRetryAfter(opts)(fetchMock);

			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("not ok", {
						status: 429,
						headers: { "Retry-After": "10" }, // 10 seconds exceeds maxDelayTime
					}),
			);

			// act
			const presponse = qfetch("http://example.local");
			await Promise.resolve();

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
	});

	describe("Allows enforcement of a maximum ceiling for retry attempts", () => {
		it("should retry without a maximum retry limit", async (ctx: TestContext) => {
			ctx.plan(5);

			ctx.beforeEach((ctx: TestContext) => {
				ctx.mock.timers.enable();
			});
			ctx.afterEach((ctx: TestContext) => {
				ctx.mock.timers.reset();
			});

			await ctx.test("undefined maxRetries", async (ctx: TestContext) => {
				ctx.plan(2);

				// arrange
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const opts: RetryAfterOptions = {
					// no maxRetries configured
				};
				const qfetch = withRetryAfter(opts)(fetchMock);

				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "1" },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await Promise.resolve();

				ctx.mock.timers.tick(1_000);
				const response = await presponse;

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have retried once without retry limit",
				);

				const body = await response.text();
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be from successful retry",
				);
			});

			await ctx.test("zero maxRetries", async (ctx: TestContext) => {
				ctx.plan(2);

				// arrange
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const opts: RetryAfterOptions = {
					maxRetries: 0, // treated as unlimited
				};
				const qfetch = withRetryAfter(opts)(fetchMock);

				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "1" },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await Promise.resolve();

				ctx.mock.timers.tick(1_000);
				const response = await presponse;

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have retried once with zero maxRetries",
				);

				const body = await response.text();
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be from successful retry",
				);
			});

			await ctx.test("negative maxRetries", async (ctx: TestContext) => {
				ctx.plan(2);

				// arrange
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const opts: RetryAfterOptions = {
					maxRetries: -5, // treated as unlimited
				};
				const qfetch = withRetryAfter(opts)(fetchMock);

				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "1" },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await Promise.resolve();

				ctx.mock.timers.tick(1_000);
				const response = await presponse;

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have retried once with negative maxRetries",
				);

				const body = await response.text();
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be from successful retry",
				);
			});

			await ctx.test("non-numeric maxRetries", async (ctx: TestContext) => {
				ctx.plan(2);

				// arrange
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const opts: RetryAfterOptions = {
					// biome-ignore lint/suspicious/noExplicitAny: we want to test invalid options
					maxRetries: "invalid" as any, // treated as unlimited
				};
				const qfetch = withRetryAfter(opts)(fetchMock);

				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "1" },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await Promise.resolve();

				ctx.mock.timers.tick(1_000);
				const response = await presponse;

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have retried once with non-numeric maxRetries",
				);

				const body = await response.text();
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be from successful retry",
				);
			});

			await ctx.test("NaN maxRetries", async (ctx: TestContext) => {
				ctx.plan(2);

				// arrange
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				const opts: RetryAfterOptions = {
					maxRetries: Number.NaN, // treated as unlimited
				};
				const qfetch = withRetryAfter(opts)(fetchMock);

				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "1" },
						}),
				);

				// act
				const presponse = qfetch("http://example.local");
				await Promise.resolve();

				ctx.mock.timers.tick(1_000);
				const response = await presponse;

				// assert
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"Should have retried once with NaN maxRetries",
				);

				const body = await response.text();
				ctx.assert.strictEqual(
					body,
					"ok",
					"Response body should be from successful retry",
				);
			});
		});

		it("should retry when attempts are within the maximum", async (ctx: TestContext) => {
			ctx.plan(4);

			// arrange
			ctx.mock.timers.enable();
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const opts: RetryAfterOptions = {
				maxRetries: 3,
			};
			const qfetch = withRetryAfter(opts)(fetchMock);

			fetchMock.mock.mockImplementationOnce(
				async () =>
					new Response("retry-1", {
						status: 429,
						headers: { "Retry-After": "1" },
					}),
			);

			// act
			const presponse = qfetch("http://example.local");

			await Promise.resolve();
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
			await Promise.resolve();
			ctx.mock.timers.tick(1_000);

			// assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				2,
				"Should have called fetch twice after 2 seconds",
			);

			// act
			await Promise.resolve();
			ctx.mock.timers.tick(1_000);
			const response = await presponse;

			// assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				3,
				"Should have called fetch three times after 3 seconds",
			);

			const body = await response.text();
			ctx.assert.strictEqual(
				body,
				"ok",
				"Final response body should be successful",
			);
		});

		it("should return the last response when retry attempts are exhausted", async (ctx: TestContext) => {
			ctx.plan(3);

			// arrange
			ctx.mock.timers.enable();
			const fetchMock = ctx.mock.fn(
				fetch,
				async () =>
					new Response("still not ok", {
						status: 429,
						headers: { "Retry-After": "1" },
					}),
			);
			const opts: RetryAfterOptions = {
				maxRetries: 1,
			};
			const qfetch = withRetryAfter(opts)(fetchMock);

			// act
			const presponse = qfetch("http://example.local");

			await Promise.resolve();
			ctx.mock.timers.tick(1_000);

			const response = await presponse;

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

			const body = await response.text();
			ctx.assert.strictEqual(
				body,
				"still not ok",
				"Response body should be from the final failed response",
			);
		});
	});
});
