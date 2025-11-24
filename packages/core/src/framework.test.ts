import { describe, suite, type TestContext, test } from "node:test";

import { compose, type FetchExecutor, pipeline } from "./framework.ts";

/* node:coverage disable */
suite("framework - Unit", () => {
	describe("compose", () => {
		test("executes middlewares in right-to-left order", async (ctx: TestContext) => {
			// Arrange
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

			// Act
			const res = await qfetch("https://example.com", { method: "GET" });

			// Assert
			ctx.assert.strictEqual(await res.text(), "ok");
			ctx.assert.deepStrictEqual(calls, [
				"mw2-before",
				"mw1-before",
				"base-fetch",
				"mw1-after",
				"mw2-after",
			]);
		});

		test("forwards request parameters through the chain", async (ctx: TestContext) => {
			// Arrange
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

			// Act
			await qfetch("https://example.com", { method: "POST" });

			// Assert
			ctx.assert.strictEqual(receivedInput, "https://example.com");
			ctx.assert.deepStrictEqual(receivedInit, { method: "POST" });
		});

		test("works with no middlewares", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const baseFetch = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = compose()(baseFetch);

			// Act
			const res = await qfetch("url");

			// Assert
			ctx.assert.strictEqual(await res.text(), "ok");
		});
	});

	describe("pipeline", () => {
		test("executes middlewares in left-to-right order", async (ctx: TestContext) => {
			// Arrange
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

			// Act
			const res = await qfetch("https://example.com", { method: "GET" });

			// Assert
			ctx.assert.strictEqual(await res.text(), "ok");
			ctx.assert.deepStrictEqual(calls, [
				"mw1-before",
				"mw2-before",
				"base-fetch",
				"mw2-after",
				"mw1-after",
			]);
		});

		test("forwards request parameters through the chain", async (ctx: TestContext) => {
			// Arrange
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

			// Act
			await qfetch("https://example.com", { method: "POST" });

			// Assert
			ctx.assert.strictEqual(receivedInput, "https://example.com");
			ctx.assert.deepStrictEqual(receivedInit, { method: "POST" });
		});

		test("works with no middlewares", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const baseFetch = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = pipeline()(baseFetch);

			// Act
			const res = await qfetch("url");

			// Assert
			ctx.assert.strictEqual(await res.text(), "ok");
		});
	});
});
