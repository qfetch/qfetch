import { describe, it, type TestContext } from "node:test";

import { compose, type MiddlewareExecutor, pipeline } from "./framework.ts";

describe("framework", () => {
	describe("compose", () => {
		it("applies middleware in right-to-left order", async (ctx: TestContext) => {
			const calls: string[] = [];

			const mw1: MiddlewareExecutor = (next) => async (input, init) => {
				calls.push("mw1-before");
				const res = await next(input, init);
				calls.push("mw1-after");
				return res;
			};

			const mw2: MiddlewareExecutor = (next) => async (input, init) => {
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

			const res = await qfetch("https://example.com", { method: "GET" });

			ctx.assert.equal(await res.text(), "ok");
			ctx.assert.deepEqual(calls, [
				"mw2-before", // mw2 runs first
				"mw1-before", // then mw1
				"base-fetch",
				"mw1-after",
				"mw2-after",
			]);
		});

		it("passes input and init to base fetch", async (ctx: TestContext) => {
			let receivedInput: URL | RequestInfo | undefined;
			let receivedInit: RequestInit | undefined;

			const baseFetch = ctx.mock.fn(fetch, async (input, init) => {
				receivedInput = input;
				receivedInit = init;
				return new Response("ok");
			});

			const passthrough: MiddlewareExecutor = (next) => (input, init) =>
				next(input, init);

			const qfetch = compose(passthrough)(baseFetch);

			await qfetch("https://example.com", { method: "POST" });

			ctx.assert.equal(receivedInput, "https://example.com");
			ctx.assert.deepEqual(receivedInit, { method: "POST" });
		});

		it("works with no middleware", async (ctx: TestContext) => {
			const baseFetch = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = compose()(baseFetch);

			const res = await qfetch("url");
			ctx.assert.equal(await res.text(), "ok");
		});
	});

	describe("pipeline", () => {
		it("applies middleware in left-to-right order", async (ctx: TestContext) => {
			const calls: string[] = [];

			const mw1: MiddlewareExecutor = (next) => async (input, init) => {
				calls.push("mw1-before");
				const res = await next(input, init);
				calls.push("mw1-after");
				return res;
			};

			const mw2: MiddlewareExecutor = (next) => async (input, init) => {
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

			const res = await qfetch("https://example.com", { method: "GET" });

			ctx.assert.equal(await res.text(), "ok");
			ctx.assert.deepEqual(calls, [
				"mw1-before", // mw1 runs first
				"mw2-before", // then mw2
				"base-fetch",
				"mw2-after",
				"mw1-after",
			]);
		});

		it("passes input and init to base fetch", async (ctx: TestContext) => {
			let receivedInput: URL | RequestInfo | undefined;
			let receivedInit: RequestInit | undefined;

			const baseFetch = ctx.mock.fn(fetch, async (input, init) => {
				receivedInput = input;
				receivedInit = init;
				return new Response("ok");
			});

			const passthrough: MiddlewareExecutor = (next) => (input, init) =>
				next(input, init);

			const qfetch = pipeline(passthrough)(baseFetch);

			await qfetch("https://example.com", { method: "POST" });

			ctx.assert.equal(receivedInput, "https://example.com");
			ctx.assert.deepEqual(receivedInit, { method: "POST" });
		});

		it("works with no middleware", async (ctx: TestContext) => {
			const baseFetch = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = pipeline()(baseFetch);

			const res = await qfetch("url");
			ctx.assert.equal(await res.text(), "ok");
		});
	});
});
