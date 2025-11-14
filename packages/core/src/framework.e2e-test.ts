import { createServer, type Server } from "node:http";
import { describe, it, type TestContext } from "node:test";

import { compose, type FetchExecutor, pipeline } from "./framework.ts";

interface ServerContext {
	server: Server;
	baseUrl: string;
}

/* node:coverage disable */
describe("framework - E2E tests", { concurrency: true }, () => {
	/**
	 * Creates an isolated HTTP server for a single test.
	 * Each test gets its own server on a random port to enable concurrent execution.
	 */
	const createTestServer = async (ctx: TestContext): Promise<ServerContext> => {
		const server = createServer((req, res) => {
			const url = new URL(req.url || "/", "http://localhost");
			const path = url.pathname;

			if (path === "/success") {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ message: "Success!" }));
				return;
			}

			if (path === "/echo-headers") {
				const customHeader = req.headers["x-custom-header"] || null;
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ customHeader }));
				return;
			}

			res.writeHead(404, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "Not Found" }));
		});

		const baseUrl = await new Promise<string>((resolve, reject) => {
			server.listen(0, "127.0.0.1", () => {
				const address = server.address();
				if (address && typeof address === "object") {
					resolve(`http://127.0.0.1:${address.port}`);
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

		return { server, baseUrl };
	};

	describe("compose with real HTTP requests", () => {
		it("should apply middleware in right-to-left order with real fetch", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);

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
			const { baseUrl } = await createTestServer(ctx);

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
			const { baseUrl } = await createTestServer(ctx);
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
			const { baseUrl } = await createTestServer(ctx);

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
			const { baseUrl } = await createTestServer(ctx);

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
			const { baseUrl } = await createTestServer(ctx);
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
			const { baseUrl } = await createTestServer(ctx);

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
	});
});
