import { describe, it, type TestContext } from "node:test";

import { type RetryAfterOptions, withRetryAfter } from "./with-retry-after.ts";

describe("withRetryAfter middleware", () => {
	describe("Successful responses are passed through unchanged", () => {
		it("should passthrough successful response without Retry-After header", async (ctx: TestContext) => {
			const fetchMock = ctx.mock.fn(fetch, async () => {
				return new Response("ok");
			});

			const opts: RetryAfterOptions = {};
			const qfetch = withRetryAfter(opts)(fetchMock);

			ctx.plan(1);
			const response = await qfetch("users");
			const body = await response.text();
			ctx.assert.strictEqual(body, "ok");
		});

		it("should passthrough successful response with Retry-After header", async (ctx: TestContext) => {
			const fetchMock = ctx.mock.fn(fetch, async () => {
				return new Response("ok", {
					headers: { "Retry-After": "0" },
				});
			});

			const opts: RetryAfterOptions = {};
			const qfetch = withRetryAfter(opts)(fetchMock);

			ctx.plan(1);
			const response = await qfetch("users");
			const body = await response.text();
			ctx.assert.strictEqual(body, "ok");
		});
	});

	describe("Error responses with an invalid Retry-After header are passed through unchanged", () => {
		it("should passthrough error response without Retry-After header", async (ctx: TestContext) => {
			const fetchMock = ctx.mock.fn(fetch, async () => {
				return new Response("not ok", { status: 429 });
			});

			const opts: RetryAfterOptions = {};
			const qfetch = withRetryAfter(opts)(fetchMock);

			ctx.plan(1);
			const response = await qfetch("users");
			const body = await response.text();
			ctx.assert.strictEqual(body, "not ok");
		});

		it("should passthrough error response with invalid Retry-After header", async (ctx: TestContext) => {
			const fetchMock = ctx.mock.fn(fetch, async () => {
				return new Response("ok");
			});

			const opts: RetryAfterOptions = {};
			const qfetch = withRetryAfter(opts)(fetchMock);

			ctx.plan(3);
			ctx.afterEach((ctx: TestContext) => {
				fetchMock.mock.resetCalls();
				ctx.mock.timers.reset();
			});

			await ctx.test("empty string", async (ctx: TestContext) => {
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "" },
						}),
				);

				ctx.plan(2);
				const response = await qfetch("users");
				const body = await response.text();
				ctx.assert.strictEqual(fetchMock.mock.callCount(), 1);
				ctx.assert.strictEqual(body, "not ok");
			});

			await ctx.test("invalid number", async (ctx: TestContext) => {
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "invalid-number" },
						}),
				);

				ctx.plan(2);
				const response = await qfetch("users");
				const body = await response.text();
				ctx.assert.strictEqual(fetchMock.mock.callCount(), 1);
				ctx.assert.strictEqual(body, "not ok");
			});

			await ctx.test("invalid date", async (ctx: TestContext) => {
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "2024-13-01T10:30:00Z" },
						}),
				);

				ctx.plan(2);
				const response = await qfetch("users");
				const body = await response.text();
				ctx.assert.strictEqual(fetchMock.mock.callCount(), 1);
				ctx.assert.strictEqual(body, "not ok");
			});
		});
	});

	describe("Valid Retry-After header on error responses triggers delayed retry", () => {
		it("should retry after specified delay in seconds", async (ctx: TestContext) => {
			const fetchMock = ctx.mock.fn(fetch, async () => {
				return new Response("ok");
			});

			const opts: RetryAfterOptions = {
				maxRetries: 3,
			};
			const qfetch = withRetryAfter(opts)(fetchMock);

			ctx.plan(3);
			ctx.beforeEach((ctx: TestContext) => {
				ctx.mock.timers.enable();
			});
			ctx.afterEach((ctx: TestContext) => {
				fetchMock.mock.resetCalls();
				ctx.mock.timers.reset();
			});

			await ctx.test("positive seconds", async (ctx: TestContext) => {
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "10" },
						}),
				);

				ctx.plan(3);
				const presponse = qfetch("http://example.local");
				await Promise.resolve(); // let microtask scheduling

				ctx.mock.timers.tick(5 * 1000);
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"After 5 seconds we should have called fetch once",
				);

				ctx.mock.timers.tick(5 * 1000);
				const response = await presponse;
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"After 10 seconds we should have called fetch twice",
				);

				const body = await response.text();
				ctx.assert.strictEqual(
					body,
					"ok",
					"Body must be the successful response after a single retry",
				);
			});

			await ctx.test("zero seconds", async (ctx: TestContext) => {
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "0" },
						}),
				);

				ctx.plan(3);
				const presponse = qfetch("http://example.local");
				await Promise.resolve(); // let microtask scheduling

				ctx.mock.timers.tick(1);
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"After one tick we should have called fetch once",
				);

				ctx.mock.timers.tick(2);
				const response = await presponse;
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"After 2 ticks we should have called fetch twice",
				);

				const body = await response.text();
				ctx.assert.strictEqual(
					body,
					"ok",
					"Body must be the successful response after a single retry",
				);
			});

			await ctx.test("negative seconds", async (ctx: TestContext) => {
				fetchMock.mock.mockImplementationOnce(
					async () =>
						new Response("not ok", {
							status: 429,
							headers: { "Retry-After": "-10" },
						}),
				);

				ctx.plan(3);
				const presponse = qfetch("http://example.local");
				await Promise.resolve(); // let microtask scheduling

				ctx.mock.timers.tick(1);
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					1,
					"After one tick we should have called fetch once",
				);

				ctx.mock.timers.tick(2);
				const response = await presponse;
				ctx.assert.strictEqual(
					fetchMock.mock.callCount(),
					2,
					"After 2 ticks we should have called fetch twice",
				);

				const body = await response.text();
				ctx.assert.strictEqual(
					body,
					"ok",
					"Body must be the successful response after a single retry",
				);
			});
		});

		it("should retry after specified delay using an HTTP-date", async (ctx: TestContext) => {
			ctx.todo("NOT IMPLEMENTED");

			await ctx.test("future date", async (ctx: TestContext) => {
				ctx.todo("NOT IMPLEMENTED");
			});

			await ctx.test("present date", async (ctx: TestContext) => {
				ctx.todo("NOT IMPLEMENTED");
			});

			await ctx.test("past date", async (ctx: TestContext) => {
				ctx.todo("NOT IMPLEMENTED");
			});
		});
	});

	describe("Allows enforcement of a maximum ceiling for retry delay", () => {
		it("should retry without a maximum", async (ctx: TestContext) => {
			ctx.todo("NOT IMPLEMENTED");
		});

		it("should retry within the maximum", async (ctx: TestContext) => {
			ctx.todo("NOT IMPLEMENTED");
		});

		it("should throw when exceeding a maximum", async (ctx: TestContext) => {
			ctx.todo("NOT IMPLEMENTED");
		});
	});

	describe("Allows enforcement of a maximum ceiling for retry attempts", () => {
		it("should retry without a maximum", async (ctx: TestContext) => {
			ctx.todo("NOT IMPLEMENTED");
		});

		it("should retry within the maximum", async (ctx: TestContext) => {
			ctx.todo("NOT IMPLEMENTED");
		});

		it("should return the last response on exhausted attempts", async (ctx: TestContext) => {
			ctx.todo("NOT IMPLEMENTED");
		});
	});
});
