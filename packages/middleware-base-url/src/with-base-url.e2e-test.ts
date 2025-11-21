import { createServer, type Server } from "node:http";
import { describe, it, type TestContext } from "node:test";

import { withBaseUrl } from "./with-base-url.ts";

/* node:coverage disable */

interface ServerContext {
	server: Server;
	baseUrl: string;
}

describe("withBaseUrl middleware - E2E tests", { concurrency: true }, () => {
	/**
	 * Creates an isolated HTTP server for a single test.
	 * Each test gets its own server on a random port to enable concurrent execution.
	 */
	const createTestServer = async (ctx: TestContext): Promise<ServerContext> => {
		const server = createServer((req, res) => {
			let body = "";
			req.on("data", (chunk) => {
				body += chunk.toString();
			});
			req.on("end", () => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(body || JSON.stringify({ success: true }));
			});
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

	describe("Requests with string input", () => {
		it("should successfully send JSON body with relative path", async (ctx: TestContext) => {
			// arrange
			ctx.plan(1);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withBaseUrl(`${baseUrl}/api/`)(fetch);

			// act
			const response = await qfetch("users", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "test" }),
				signal: ctx.signal,
			});
			const data = await response.json();

			// assert
			ctx.assert.deepStrictEqual(
				data,
				{ name: "test" },
				"JSON body should be sent successfully",
			);
		});

		it("should successfully send stream body with relative path", async (ctx: TestContext) => {
			// arrange
			ctx.plan(1);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withBaseUrl(`${baseUrl}/api/`)(fetch);

			// act
			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue(
						new TextEncoder().encode(JSON.stringify({ name: "test" })),
					);
					controller.close();
				},
			});
			const response = await qfetch("users", {
				method: "POST",
				body: stream,
				signal: ctx.signal,
				// @ts-expect-error: https://github.com/nodejs/node/issues/46221
				duplex: "half",
			});
			const data = await response.json();

			// assert
			ctx.assert.deepStrictEqual(
				data,
				{ name: "test" },
				"Stream body should be sent successfully",
			);
		});
	});

	describe("Requests with URL input", () => {
		it("should successfully send JSON body with relative path", async (ctx: TestContext) => {
			// arrange
			ctx.plan(1);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withBaseUrl(new URL(`${baseUrl}/api/`))(fetch);

			// act
			const response = await qfetch(new URL("users", baseUrl), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "test" }),
				signal: ctx.signal,
			});
			const data = await response.json();

			// assert
			ctx.assert.deepStrictEqual(
				data,
				{ name: "test" },
				"JSON body should be sent successfully",
			);
		});

		it("should successfully send stream body with relative path", async (ctx: TestContext) => {
			// arrange
			ctx.plan(1);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withBaseUrl(new URL(`${baseUrl}/api/`))(fetch);

			// act
			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue(
						new TextEncoder().encode(JSON.stringify({ name: "test" })),
					);
					controller.close();
				},
			});
			const response = await qfetch(new URL("users", baseUrl), {
				method: "POST",
				body: stream,
				signal: ctx.signal,
				// @ts-expect-error: https://github.com/nodejs/node/issues/46221
				duplex: "half",
			});
			const data = await response.json();

			// assert
			ctx.assert.deepStrictEqual(
				data,
				{ name: "test" },
				"Stream body should be sent successfully",
			);
		});
	});

	describe("Requests with Request input", () => {
		it("should successfully send JSON body with relative path", async (ctx: TestContext) => {
			// arrange
			ctx.plan(1);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withBaseUrl(`${baseUrl}/api/`)(fetch);

			// act
			const request = new Request(new URL("users", baseUrl), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "test" }),
				signal: ctx.signal,
			});
			const response = await qfetch(request);
			const data = await response.json();

			// assert
			ctx.assert.deepStrictEqual(
				data,
				{ name: "test" },
				"JSON body should be sent successfully",
			);
		});

		it("should successfully send stream body with relative path", async (ctx: TestContext) => {
			// arrange
			ctx.plan(1);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withBaseUrl(`${baseUrl}/api/`)(fetch);

			// act
			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue(
						new TextEncoder().encode(JSON.stringify({ name: "test" })),
					);
					controller.close();
				},
			});
			const request = new Request(new URL("users", baseUrl), {
				method: "POST",
				body: stream,
				signal: ctx.signal,
				// @ts-expect-error: https://github.com/nodejs/node/issues/46221
				duplex: "half",
			});
			const response = await qfetch(request);
			const data = await response.json();

			// assert
			ctx.assert.deepStrictEqual(
				data,
				{ name: "test" },
				"Stream body should be sent successfully",
			);
		});
	});
});
