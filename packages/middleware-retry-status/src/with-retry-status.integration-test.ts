import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer, type Server } from "node:http";
import { describe, suite, type TestContext, test } from "node:test";

import { upto, zero } from "@proventuslabs/retry-strategies";

import { withRetryStatus } from "./with-retry-status.ts";

/* node:coverage disable */

interface ServerContext {
	server: Server;
	baseUrl: string;
}

type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

suite("withRetryStatus - Integration", { concurrency: true }, () => {
	/**
	 * Creates an isolated HTTP server for a single test.
	 * Each test gets its own server on a random port to enable concurrent execution.
	 */
	const createTestServer = async (
		ctx: TestContext,
		handler?: RequestHandler,
	): Promise<ServerContext> => {
		const server = createServer((req, res) => {
			if (handler) {
				handler(req, res);
				return;
			}

			// Default handler
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ message: "Success!" }));
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

		return {
			server,
			baseUrl,
		};
	};

	describe("successful responses", () => {
		test("completes without retrying on successful response", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ message: "Success" }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryStatus({ strategy: () => upto(3, zero()) })(
				fetch,
			);

			// Act
			const response = await qfetch(`${baseUrl}/test`, { signal: ctx.signal });
			await response.json();

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				handler.mock.callCount(),
				1,
				"completes on first attempt without retry",
			);
		});
	});

	describe("retry with retryable status codes", () => {
		test("retries on 500 error and succeeds", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				if (handler.mock.callCount() <= 1) {
					res.writeHead(500, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Internal Server Error" }));
				} else {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ message: "Success" }));
				}
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryStatus({ strategy: () => upto(3, zero()) })(
				fetch,
			);

			// Act
			const response = await qfetch(`${baseUrl}/test`, { signal: ctx.signal });
			await response.json();

			// Assert
			ctx.assert.strictEqual(response.status, 200, "succeeds after retries");
			ctx.assert.strictEqual(
				handler.mock.callCount(),
				3,
				"makes expected number of attempts",
			);
		});

		test("retries multiple times before succeeding", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				if (handler.mock.callCount() <= 2) {
					res.writeHead(503, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Service Unavailable" }));
				} else {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ message: "Success" }));
				}
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryStatus({ strategy: () => upto(5, zero()) })(
				fetch,
			);

			// Act
			const response = await qfetch(`${baseUrl}/test`, { signal: ctx.signal });
			await response.json();

			// Assert
			ctx.assert.strictEqual(response.status, 200, "succeeds after retries");
			ctx.assert.strictEqual(
				handler.mock.callCount(),
				4,
				"makes expected number of attempts",
			);
		});

		test("retries on all default retryable status codes", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(6);
			const retryableStatuses = [408, 429, 500, 502, 503, 504];

			for (const status of retryableStatuses) {
				await ctx.test(`status ${status}`, async (ctx: TestContext) => {
					// Arrange
					ctx.plan(1);
					const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
						if (handler.mock.callCount() <= 1) {
							res.writeHead(status, { "Content-Type": "text/plain" });
							res.end("Error");
						} else {
							res.writeHead(200, { "Content-Type": "application/json" });
							res.end(JSON.stringify({ success: true }));
						}
					});

					const { baseUrl } = await createTestServer(ctx, handler);
					const qfetch = withRetryStatus({
						strategy: () => upto(3, zero()),
					})(fetch);

					// Act
					const response = await qfetch(`${baseUrl}/test`, {
						signal: ctx.signal,
					});

					// Assert
					ctx.assert.strictEqual(
						response.status,
						200,
						"retries and succeeds for status",
					);
				});
			}
		});
	});

	describe("non-retryable status codes", () => {
		test("does not retry on 404 status", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(404, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "Not Found" }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryStatus({ strategy: () => upto(3, zero()) })(
				fetch,
			);

			// Act
			const response = await qfetch(`${baseUrl}/test`, { signal: ctx.signal });
			await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				404,
				"returns original error status",
			);
			ctx.assert.strictEqual(
				handler.mock.callCount(),
				1,
				"makes only one request",
			);
		});

		test("does not retry on client error status codes", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(4);
			const clientErrors = [400, 401, 403, 422];

			for (const status of clientErrors) {
				await ctx.test(`status ${status}`, async (ctx: TestContext) => {
					// Arrange
					ctx.plan(1);
					const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
						res.writeHead(status, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "Client error" }));
					});

					const { baseUrl } = await createTestServer(ctx, handler);
					const qfetch = withRetryStatus({
						strategy: () => upto(3, zero()),
					})(fetch);

					// Act
					const response = await qfetch(`${baseUrl}/test`, {
						signal: ctx.signal,
					});
					await response.json();

					// Assert
					ctx.assert.strictEqual(
						handler.mock.callCount(),
						1,
						"makes only one request",
					);
				});
			}
		});
	});

	describe("retry limit enforcement", () => {
		test("returns last response when retry attempts exhausted", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(500, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "Server Error" }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryStatus({ strategy: () => upto(1, zero()) })(
				fetch,
			);

			// Act
			const response = await qfetch(`${baseUrl}/test`, { signal: ctx.signal });
			await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				500,
				"returns error status after retries exhausted",
			);
			ctx.assert.strictEqual(
				handler.mock.callCount(),
				2,
				"makes initial plus retry attempts",
			);
		});
	});

	describe("signal cancellation", () => {
		test("aborts during retry delay", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				if (handler.mock.callCount() <= 1) {
					res.writeHead(503, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Service Unavailable" }));
				} else {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ message: "Success" }));
				}
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			// Use a strategy with a 5 second delay to ensure abort happens during delay
			const qfetch = withRetryStatus({
				strategy: () => ({
					nextBackoff: () => 5000,
					resetBackoff: () => {},
				}),
			})(fetch);
			const controller = new AbortController();

			// Act
			const promise = qfetch(`${baseUrl}/test`, { signal: controller.signal });

			// Abort during the retry delay
			setTimeout(() => controller.abort(), 1000);

			// Assert
			await ctx.assert.rejects(
				() => promise,
				(e: unknown) => e instanceof DOMException && e.name === "AbortError",
				"throws AbortError when aborted during retry delay",
			);
		});
	});

	describe("custom retryable status codes", () => {
		test("retries only on custom status codes", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				if (handler.mock.callCount() <= 1) {
					res.writeHead(429, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Too Many Requests" }));
				} else {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ message: "Success" }));
				}
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryStatus({
				strategy: () => upto(3, zero()),
				retryableStatuses: new Set([429]),
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/test`, { signal: ctx.signal });
			await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"successfully retries on custom status 429",
			);
			ctx.assert.strictEqual(
				handler.mock.callCount(),
				3,
				"makes expected number of attempts",
			);
		});

		test("does not retry when status is not in custom set", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(500, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "Internal Server Error" }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryStatus({
				strategy: () => upto(3, zero()),
				retryableStatuses: new Set([429]), // Only 429, not 500
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/test`, { signal: ctx.signal });
			await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				500,
				"returns original error status",
			);
			ctx.assert.strictEqual(
				handler.mock.callCount(),
				1,
				"makes only one request",
			);
		});
	});
});
