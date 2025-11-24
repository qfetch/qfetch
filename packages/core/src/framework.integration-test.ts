import { createServer, type Server } from "node:http";
import { describe, suite, type TestContext, test } from "node:test";

import { compose, type FetchExecutor, pipeline } from "./framework.ts";

/* node:coverage disable */

interface ServerContext {
	server: Server;
	baseUrl: string;
}

suite("framework - Integration", { concurrency: true }, () => {
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

	describe("compose", () => {
		test("applies middleware in right-to-left order with real fetch", async (ctx: TestContext) => {
			// Arrange
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

			// Act
			const response = await qfetch(`${baseUrl}/success`, {
				signal: ctx.signal,
			});
			await response.json();

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.deepStrictEqual(
				calls,
				["mw2-before", "mw1-before", "mw1-after", "mw2-after"],
				"processes middlewares in reverse order",
			);
		});

		test("modifies request headers before sending", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);

			const addHeader: FetchExecutor = (next) => async (input, init) => {
				const headers = new Headers(init?.headers);
				headers.set("X-Custom-Header", "test-value");
				return next(input, { ...init, headers });
			};

			const qfetch = compose(addHeader)(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/echo-headers`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.customHeader,
				"test-value",
				"applies custom header to request",
			);
		});

		test("works with no middleware", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = compose()(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/success`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.message,
				"Success!",
				"returns expected response data",
			);
		});
	});

	describe("pipeline", () => {
		test("applies middleware in left-to-right order with real fetch", async (ctx: TestContext) => {
			// Arrange
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

			// Act
			const response = await qfetch(`${baseUrl}/success`, {
				signal: ctx.signal,
			});
			await response.json();

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.deepStrictEqual(
				calls,
				["mw1-before", "mw2-before", "mw2-after", "mw1-after"],
				"processes middlewares in declaration order",
			);
		});

		test("modifies request headers before sending", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);

			const addHeader: FetchExecutor = (next) => async (input, init) => {
				const headers = new Headers(init?.headers);
				headers.set("X-Custom-Header", "pipeline-value");
				return next(input, { ...init, headers });
			};

			const qfetch = pipeline(addHeader)(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/echo-headers`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.customHeader,
				"pipeline-value",
				"applies custom header to request",
			);
		});

		test("works with no middleware", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = pipeline()(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/success`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.message,
				"Success!",
				"returns expected response data",
			);
		});
	});
});
