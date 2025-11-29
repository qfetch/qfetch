import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer, type Server } from "node:http";
import { describe, suite, type TestContext, test } from "node:test";

import {
	ConstantBackoff,
	LinearBackoff,
} from "@proventuslabs/retry-strategies";

import { withRetryStatus } from "./with-retry-status.ts";

/* node:coverage disable */

interface ServerContext {
	server: Server;
	baseUrl: string;
	getRequestCount: (path: string) => number;
}

type RequestHandler = (
	req: IncomingMessage,
	res: ServerResponse,
	requestCount: number,
) => void;

suite("withRetryStatus - Integration", { concurrency: true }, () => {
	/**
	 * Creates an isolated HTTP server for a single test.
	 * Each test gets its own server on a random port to enable concurrent execution.
	 */
	const createTestServer = async (
		ctx: TestContext,
		handler?: RequestHandler,
	): Promise<ServerContext> => {
		// Track request counts for this specific server instance
		const requestCounts = new Map<string, number>();

		const server = createServer((req, res) => {
			const url = new URL(req.url || "/", "http://localhost");
			const path = url.pathname;

			// Increment request count for this path
			const count = (requestCounts.get(path) || 0) + 1;
			requestCounts.set(path, count);

			if (handler) {
				handler(req, res, count);
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
			getRequestCount: (path: string) => requestCounts.get(path) || 0,
		};
	};

	describe("successful responses", () => {
		test("completes without retrying on successful response", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx, (_req, res, count) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ message: "Success", attempt: count }));
			});

			const qfetch = withRetryStatus({
				strategy: () => new LinearBackoff(100, 1000),
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/test`, { signal: ctx.signal });
			const body = await response.json();

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				body.attempt,
				1,
				"completes on first attempt without retry",
			);
		});
	});

	describe("retryable server errors", () => {
		test("retries on 500 error then succeeds", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			const { baseUrl } = await createTestServer(ctx, (_req, res, count) => {
				if (count === 1) {
					res.writeHead(500, { "Content-Type": "text/plain" });
					res.end("Internal Server Error");
					return;
				}

				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ message: "Success", attempt: count }));
			});

			const qfetch = withRetryStatus({
				strategy: () => new ConstantBackoff(50),
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/retry-test`, {
				signal: ctx.signal,
			});
			const body = await response.json();

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				body.attempt,
				2,
				"succeeds on second attempt after retry",
			);
			ctx.assert.strictEqual(
				body.message,
				"Success",
				"returns expected response body",
			);
		});

		test("performs multiple retries with backoff strategy", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx, (_req, res, count) => {
				if (count <= 3) {
					res.writeHead(503, { "Content-Type": "text/plain" });
					res.end("Service Unavailable");
					return;
				}

				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ message: "Success", attempt: count }));
			});

			const qfetch = withRetryStatus({
				strategy: () => new LinearBackoff(50, 200),
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/multiple-retries`, {
				signal: ctx.signal,
			});
			const body = await response.json();

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				body.attempt,
				4,
				"succeeds after multiple retry attempts",
			);
		});

		test("retries on all retryable status codes", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(6);
			const retryableStatuses = [408, 429, 500, 502, 503, 504];

			for (const status of retryableStatuses) {
				await ctx.test(`status ${status}`, async (ctx: TestContext) => {
					// Arrange
					ctx.plan(1);

					const { baseUrl } = await createTestServer(
						ctx,
						(_req, res, count) => {
							if (count === 1) {
								res.writeHead(status, { "Content-Type": "text/plain" });
								res.end("Error");
								return;
							}

							res.writeHead(200, { "Content-Type": "application/json" });
							res.end(JSON.stringify({ success: true }));
						},
					);

					const qfetch = withRetryStatus({
						strategy: () => new ConstantBackoff(50),
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

	describe("non-retryable errors", () => {
		test("returns 404 without retrying", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx, (_req, res, count) => {
				res.writeHead(404, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "Not Found", attempt: count }));
			});

			const qfetch = withRetryStatus({
				strategy: () => new ConstantBackoff(50),
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/not-found`, {
				signal: ctx.signal,
			});
			const body = await response.json();

			// Assert
			ctx.assert.strictEqual(response.status, 404, "returns 404 status");
			ctx.assert.strictEqual(
				body.attempt,
				1,
				"completes on first attempt without retry",
			);
		});

		test("returns client errors without retrying", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(4);
			const clientErrors = [400, 401, 403, 422];

			for (const status of clientErrors) {
				await ctx.test(`status ${status}`, async (ctx: TestContext) => {
					// Arrange
					ctx.plan(1);

					const { baseUrl } = await createTestServer(
						ctx,
						(_req, res, count) => {
							res.writeHead(status, { "Content-Type": "application/json" });
							res.end(
								JSON.stringify({ error: "Client error", attempt: count }),
							);
						},
					);

					const qfetch = withRetryStatus({
						strategy: () => new ConstantBackoff(50),
					})(fetch);

					// Act
					const response = await qfetch(`${baseUrl}/test`, {
						signal: ctx.signal,
					});
					const body = await response.json();

					// Assert
					ctx.assert.strictEqual(
						body.attempt,
						1,
						"completes on first attempt without retry",
					);
				});
			}
		});
	});

	describe("strategy-controlled behavior", () => {
		test("stops retrying when strategy exhausts", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx, (_req, res, count) => {
				res.writeHead(500, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "Server Error", attempt: count }));
			});

			// Strategy that returns NaN after 2 attempts (initial + 2 retries = 3 total)
			let callCount = 0;
			const limitedStrategy = () => {
				return {
					nextBackoff: () => {
						callCount++;
						if (callCount > 2) {
							return Number.NaN;
						}
						return 50;
					},
					resetBackoff() {},
				};
			};

			const qfetch = withRetryStatus({
				strategy: limitedStrategy,
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/always-fails`, {
				signal: ctx.signal,
			});
			const body = await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				500,
				"returns final error response",
			);
			ctx.assert.strictEqual(
				body.attempt,
				3,
				"attempts exactly 3 times before stopping",
			);
		});
	});

	describe("abort signal integration", () => {
		test("aborts request during retry delay", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const { baseUrl } = await createTestServer(ctx, (_req, res) => {
				res.writeHead(503, { "Content-Type": "text/plain" });
				res.end("Service Unavailable");
			});

			const controller = new AbortController();
			const qfetch = withRetryStatus({
				strategy: () => new ConstantBackoff(1000), // Long delay
			})(fetch);

			// Act
			const responsePromise = qfetch(`${baseUrl}/abort-test`, {
				signal: controller.signal,
			});

			// Abort after initial request but before retry
			setTimeout(() => controller.abort(), 100);

			// Assert
			await ctx.assert.rejects(
				responsePromise,
				(error: unknown) =>
					error instanceof Error && error.name === "AbortError",
				"throws abort error when aborted during retry delay",
			);
		});
	});

	describe("custom retryable status codes", () => {
		test("retries only on custom status code 429", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			const { baseUrl } = await createTestServer(ctx, (_req, res, count) => {
				// First request returns 429 (should retry with custom config)
				if (count === 1) {
					res.writeHead(429, { "Content-Type": "text/plain" });
					res.end("Too Many Requests");
					return;
				}

				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ message: "Success", attempt: count }));
			});

			// Configure to only retry on 429
			const qfetch = withRetryStatus({
				strategy: () => new ConstantBackoff(50),
				retryableStatuses: new Set([429]),
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/custom-retry`, {
				signal: ctx.signal,
			});
			const body = await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"successfully retries on custom status 429",
			);
			ctx.assert.strictEqual(body.attempt, 2, "retries exactly once on 429");
			ctx.assert.strictEqual(
				body.message,
				"Success",
				"returns successful response",
			);
		});
	});

	describe("real-world scenarios", () => {
		test("handles intermittent network failures", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx, (_req, res, count) => {
				// Simulate intermittent failures: fail twice, then succeed
				if (count <= 2) {
					res.writeHead(502, { "Content-Type": "text/plain" });
					res.end("Bad Gateway");
					return;
				}

				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({ message: "Recovered", recoveredAfter: count }),
				);
			});

			const qfetch = withRetryStatus({
				strategy: () => new LinearBackoff(50, 500),
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/intermittent`, {
				signal: ctx.signal,
			});
			const body = await response.json();

			// Assert
			ctx.assert.strictEqual(response.status, 200, "recovers from failures");
			ctx.assert.strictEqual(
				body.recoveredAfter,
				3,
				"succeeds after failures are resolved",
			);
		});

		test("handles rate limiting with 429 responses", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx, (_req, res, count) => {
				// Simulate rate limiting for first 2 requests
				if (count <= 2) {
					res.writeHead(429, {
						"Content-Type": "text/plain",
						"Retry-After": "1",
					});
					res.end("Too Many Requests");
					return;
				}

				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ message: "Success", attempt: count }));
			});

			const qfetch = withRetryStatus({
				strategy: () => new ConstantBackoff(50),
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/rate-limited`, {
				signal: ctx.signal,
			});
			const body = await response.json();

			// Assert
			ctx.assert.strictEqual(response.status, 200, "succeeds after rate limit");
			ctx.assert.strictEqual(
				body.attempt,
				3,
				"retries until rate limit is lifted",
			);
		});

		test("handles large response bodies correctly", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const largeData = "x".repeat(10000); // 10KB of data

			const { baseUrl } = await createTestServer(ctx, (_req, res, count) => {
				if (count === 1) {
					res.writeHead(500, { "Content-Type": "text/plain" });
					res.end(largeData); // Large error response
					return;
				}

				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({ message: "Success", dataSize: largeData.length }),
				);
			});

			const qfetch = withRetryStatus({
				strategy: () => new ConstantBackoff(50),
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/large-body`, {
				signal: ctx.signal,
			});
			const body = await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"handles large response bodies",
			);
			ctx.assert.strictEqual(
				body.message,
				"Success",
				"returns correct response after retrying",
			);
		});

		test("works with POST requests and request bodies", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			let receivedBody: { test: string; value: number } | null = null;

			const { baseUrl } = await createTestServer(
				ctx,
				async (req, res, count) => {
					// Read request body
					const chunks: Buffer[] = [];
					for await (const chunk of req) {
						chunks.push(chunk);
					}
					const body = Buffer.concat(chunks).toString();
					receivedBody = JSON.parse(body) as { test: string; value: number };

					if (count === 1) {
						res.writeHead(503, { "Content-Type": "text/plain" });
						res.end("Service Unavailable");
						return;
					}

					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(
						JSON.stringify({
							message: "Received",
							data: receivedBody,
							attempt: count,
						}),
					);
				},
			);

			const qfetch = withRetryStatus({
				strategy: () => new ConstantBackoff(50),
			})(fetch);

			const requestData = { test: "data", value: 123 };

			// Act
			const response = await qfetch(`${baseUrl}/post-test`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(requestData),
				signal: ctx.signal,
			});
			const responseBody = await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"succeeds with POST request",
			);
			ctx.assert.strictEqual(
				responseBody.attempt,
				2,
				"retries POST request correctly",
			);
			ctx.assert.deepStrictEqual(
				responseBody.data,
				requestData,
				"preserves request body across retries",
			);
		});
	});
});
