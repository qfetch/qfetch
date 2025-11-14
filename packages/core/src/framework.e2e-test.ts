import { createServer, type Server } from "node:http";
import { describe, it, type TestContext } from "node:test";

import { compose, type FetchExecutor, pipeline } from "./framework.ts";

/* node:coverage disable */
describe("framework - E2E tests", () => {
	let server: Server;
	let port: number;
	let baseUrl: string;

	const startServer = async (ctx: TestContext): Promise<void> => {
		let requestCount = 0;

		server = createServer((req, res) => {
			requestCount++;
			const url = new URL(req.url || "/", `http://localhost:${port}`);
			const path = url.pathname;

			if (path === "/success") {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ message: "Success!", requestCount }));
				return;
			}

			if (path === "/echo-headers") {
				const customHeader = req.headers["x-custom-header"] || null;
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ customHeader }));
				return;
			}

			if (path === "/reset") {
				requestCount = 0;
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ message: "Counter reset", requestCount }));
				return;
			}

			res.writeHead(404, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "Not Found" }));
		});

		await new Promise<void>((resolve, reject) => {
			server.listen(0, "127.0.0.1", () => {
				const address = server.address();
				if (address && typeof address === "object") {
					port = address.port;
					baseUrl = `http://127.0.0.1:${port}`;
					resolve();
				} else {
					reject(new Error("Failed to get server address"));
				}
			});

			server.on("error", reject);
		});

		ctx.after(() => {
			return new Promise<void>((resolve) => {
				server.close(() => resolve());
			});
		});
	};

	const resetCounter = async (ctx: TestContext): Promise<void> => {
		await fetch(`${baseUrl}/reset`, { signal: ctx.signal });
		await new Promise((resolve) => setTimeout(resolve, 50));
	};

	describe("compose with real HTTP requests", () => {
		it("should apply middleware in right-to-left order with real fetch", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			await startServer(ctx);
			await resetCounter(ctx);

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

			const qfetch = compose(mw1, mw2)(fetch);

			// act
			const response = await qfetch(`${baseUrl}/success`, {
				signal: ctx.signal,
			});
			await response.json();

			// assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"Response status should be 200",
			);
			ctx.assert.deepStrictEqual(
				calls,
				["mw2-before", "mw1-before", "mw1-after", "mw2-after"],
				"Middleware should execute in right-to-left order",
			);
		});

		it("should allow middleware to modify request headers", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			await startServer(ctx);

			const addHeader: FetchExecutor = (next) => async (input, init) => {
				const headers = new Headers(init?.headers);
				headers.set("X-Custom-Header", "test-value");
				return next(input, { ...init, headers });
			};

			const qfetch = compose(addHeader)(fetch);

			// act
			const response = await qfetch(`${baseUrl}/echo-headers`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"Response status should be 200",
			);
			ctx.assert.strictEqual(
				data.customHeader,
				"test-value",
				"Custom header should be sent to server",
			);
		});

		it("should work with no middleware", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			await startServer(ctx);
			const qfetch = compose()(fetch);

			// act
			const response = await qfetch(`${baseUrl}/success`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"Response status should be 200",
			);
			ctx.assert.strictEqual(
				data.message,
				"Success!",
				"Response should be from server",
			);
		});
	});

	describe("pipeline with real HTTP requests", () => {
		it("should apply middleware in left-to-right order with real fetch", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			await startServer(ctx);
			await resetCounter(ctx);

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

			const qfetch = pipeline(mw1, mw2)(fetch);

			// act
			const response = await qfetch(`${baseUrl}/success`, {
				signal: ctx.signal,
			});
			await response.json();

			// assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"Response status should be 200",
			);
			ctx.assert.deepStrictEqual(
				calls,
				["mw1-before", "mw2-before", "mw2-after", "mw1-after"],
				"Middleware should execute in left-to-right order",
			);
		});

		it("should allow middleware to modify request headers", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			await startServer(ctx);

			const addHeader: FetchExecutor = (next) => async (input, init) => {
				const headers = new Headers(init?.headers);
				headers.set("X-Custom-Header", "pipeline-value");
				return next(input, { ...init, headers });
			};

			const qfetch = pipeline(addHeader)(fetch);

			// act
			const response = await qfetch(`${baseUrl}/echo-headers`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"Response status should be 200",
			);
			ctx.assert.strictEqual(
				data.customHeader,
				"pipeline-value",
				"Custom header should be sent to server",
			);
		});

		it("should work with no middleware", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			await startServer(ctx);
			const qfetch = pipeline()(fetch);

			// act
			const response = await qfetch(`${baseUrl}/success`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"Response status should be 200",
			);
			ctx.assert.strictEqual(
				data.message,
				"Success!",
				"Response should be from server",
			);
		});
	});

	describe("middleware composition patterns", () => {
		it("should allow multiple middleware to modify the same request", async (ctx: TestContext) => {
			// arrange
			ctx.plan(1);
			await startServer(ctx);

			const addHeader1: FetchExecutor = (next) => async (input, init) => {
				const headers = new Headers(init?.headers);
				headers.set("X-Custom-Header", "value1");
				return next(input, { ...init, headers });
			};

			const addHeader2: FetchExecutor = (next) => async (input, init) => {
				const headers = new Headers(init?.headers);
				const existing = headers.get("X-Custom-Header") || "";
				headers.set("X-Custom-Header", `${existing},value2`);
				return next(input, { ...init, headers });
			};

			const qfetch = compose(addHeader2, addHeader1)(fetch);

			// act
			const response = await qfetch(`${baseUrl}/echo-headers`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// assert
			ctx.assert.strictEqual(
				data.customHeader,
				"value1,value2",
				"Both middleware should modify the header",
			);
		});

		it("should handle async middleware correctly", async (ctx: TestContext) => {
			// arrange
			ctx.plan(1);
			await startServer(ctx);

			const asyncDelay: FetchExecutor = (next) => async (input, init) => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				return next(input, init);
			};

			const qfetch = compose(asyncDelay)(fetch);

			// act
			const response = await qfetch(`${baseUrl}/success`, {
				signal: ctx.signal,
			});

			// assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"Response should succeed after async delay",
			);
		});
	});
});
