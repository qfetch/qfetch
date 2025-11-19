import { describe, it, type TestContext } from "node:test";

import { compose, type FetchExecutor, pipeline } from "./framework.ts";

/* node:coverage disable */
describe("framework - Unit tests", () => {
	describe("compose", () => {
		it("should execute middlewares in right-to-left order", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const calls: string[] = [];

			const mw1: FetchExecutor = (next) => async (input, init) => {
				calls.push("mw1-before");
				const res = await next(input, init);
				calls.push("mw1-after");
				return res;
			};

			const mw2: FetchExecutor = (next) => async (input, init) => {
				calls.push("mw2-before");
				const res = await next(input, init);
				calls.push("mw2-after");
				return res;
			};

			const baseFetch = ctx.mock.fn(fetch, async () => {
				calls.push("base-fetch");
				return new Response("ok");
			});

			const qfetch = compose(mw1, mw2)(baseFetch);

			// act
			const res = await qfetch("https://example.com", { method: "GET" });

			// assert
			ctx.assert.strictEqual(await res.text(), "ok");
			ctx.assert.deepStrictEqual(calls, [
				"mw2-before", // mw2 runs first
				"mw1-before", // then mw1
				"base-fetch",
				"mw1-after",
				"mw2-after",
			]);
		});

		it("should forward request parameters through the middleware chain", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			let receivedInput: URL | RequestInfo | undefined;
			let receivedInit: RequestInit | undefined;

			const baseFetch = ctx.mock.fn(fetch, async (input, init) => {
				receivedInput = input;
				receivedInit = init;
				return new Response("ok");
			});

			const passthrough: FetchExecutor = (next) => (input, init) =>
				next(input, init);

			const qfetch = compose(passthrough)(baseFetch);

			// act
			await qfetch("https://example.com", { method: "POST" });

			// assert
			ctx.assert.strictEqual(receivedInput, "https://example.com");
			ctx.assert.deepStrictEqual(receivedInit, { method: "POST" });
		});

		it("should work when no middlewares are provided", async (ctx: TestContext) => {
			// arrange
			ctx.plan(1);
			const baseFetch = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = compose()(baseFetch);

			// act
			const res = await qfetch("url");

			// assert
			ctx.assert.strictEqual(await res.text(), "ok");
		});
	});

	describe("pipeline", () => {
		it("should execute middlewares in left-to-right order", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const calls: string[] = [];

			const mw1: FetchExecutor = (next) => async (input, init) => {
				calls.push("mw1-before");
				const res = await next(input, init);
				calls.push("mw1-after");
				return res;
			};

			const mw2: FetchExecutor = (next) => async (input, init) => {
				calls.push("mw2-before");
				const res = await next(input, init);
				calls.push("mw2-after");
				return res;
			};

			const baseFetch = ctx.mock.fn(fetch, async () => {
				calls.push("base-fetch");
				return new Response("ok");
			});

			const qfetch = pipeline(mw1, mw2)(baseFetch);

			// act
			const res = await qfetch("https://example.com", { method: "GET" });

			// assert
			ctx.assert.strictEqual(await res.text(), "ok");
			ctx.assert.deepStrictEqual(calls, [
				"mw1-before", // mw1 runs first
				"mw2-before", // then mw2
				"base-fetch",
				"mw2-after",
				"mw1-after",
			]);
		});

		it("should forward request parameters through the middleware chain", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			let receivedInput: URL | RequestInfo | undefined;
			let receivedInit: RequestInit | undefined;

			const baseFetch = ctx.mock.fn(fetch, async (input, init) => {
				receivedInput = input;
				receivedInit = init;
				return new Response("ok");
			});

			const passthrough: FetchExecutor = (next) => (input, init) =>
				next(input, init);

			const qfetch = pipeline(passthrough)(baseFetch);

			// act
			await qfetch("https://example.com", { method: "POST" });

			// assert
			ctx.assert.strictEqual(receivedInput, "https://example.com");
			ctx.assert.deepStrictEqual(receivedInit, { method: "POST" });
		});

		it("should work when no middlewares are provided", async (ctx: TestContext) => {
			// arrange
			ctx.plan(1);
			const baseFetch = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = pipeline()(baseFetch);

			// act
			const res = await qfetch("url");

			// assert
			ctx.assert.strictEqual(await res.text(), "ok");
		});
	});
});
