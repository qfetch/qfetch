import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer, type Server } from "node:http";
import { describe, suite, type TestContext, test } from "node:test";

import { fullJitter, upto, zero } from "@proventuslabs/retry-strategies";

import { withRetryAfter } from "./with-retry-after.ts";

/* node:coverage disable */

interface ServerContext {
	server: Server;
	baseUrl: string;
}

type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

suite("withRetryAfter - Integration", { concurrency: true }, () => {
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
			const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(fetch);

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

	describe("retry with 429 status code", () => {
		test("retries after delay when Retry-After header is present", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				if (handler.mock.callCount() <= 1) {
					res.writeHead(429, {
						"Content-Type": "application/json",
						"Retry-After": "1",
					});
					res.end(JSON.stringify({ error: "Too Many Requests" }));
				} else {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ message: "Success" }));
				}
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(fetch);

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

		test("does not retry when Retry-After header is missing", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(429, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						error: "Too Many Requests",
						note: "No Retry-After header",
					}),
				);
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/test`, { signal: ctx.signal });
			await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				429,
				"returns original error status",
			);
			ctx.assert.strictEqual(
				handler.mock.callCount(),
				1,
				"makes only one request",
			);
		});

		test("does not retry when Retry-After header is invalid", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(429, {
					"Content-Type": "application/json",
					"Retry-After": "invalid-value",
				});
				res.end(
					JSON.stringify({
						error: "Too Many Requests",
						retryAfter: "invalid-value",
					}),
				);
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/test`, { signal: ctx.signal });
			await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				429,
				"returns original error status",
			);
			ctx.assert.strictEqual(
				handler.mock.callCount(),
				1,
				"makes only one request",
			);
		});
	});

	describe("retry with 503 status code", () => {
		test("retries after delay when Retry-After header is present", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				if (handler.mock.callCount() <= 1) {
					res.writeHead(503, {
						"Content-Type": "application/json",
						"Retry-After": "1",
					});
					res.end(JSON.stringify({ error: "Service Unavailable" }));
				} else {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ message: "Success" }));
				}
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(fetch);

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
	});

	describe("HTTP-date format", () => {
		test("retries when Retry-After is HTTP-date", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				if (handler.mock.callCount() <= 1) {
					const futureDate = new Date(Date.now() + 1000); // 1 second from now
					const httpDate = futureDate.toUTCString();
					res.writeHead(429, {
						"Content-Type": "application/json",
						"Retry-After": httpDate,
					});
					res.end(
						JSON.stringify({
							error: "Too Many Requests",
							retryAfter: httpDate,
						}),
					);
				} else {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ message: "Success" }));
				}
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(fetch);

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
	});

	describe("INT32_MAX boundary tests", () => {
		test("throws RangeError when delay exceeds INT32_MAX", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				const delay = "2147484"; // Invalid: exceeds INT32_MAX when converted to ms
				res.writeHead(429, {
					"Content-Type": "application/json",
					"Retry-After": delay,
				});
				res.end(
					JSON.stringify({
						error: "Too Many Requests",
						retryAfter: delay,
					}),
				);
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(fetch);

			// Act & Assert
			await ctx.assert.rejects(
				() => qfetch(`${baseUrl}/test`, { signal: ctx.signal }),
				(e: unknown) => e instanceof RangeError,
				"throws RangeError for excessive delay",
			);
		});
	});

	describe("maxServerDelay enforcement", () => {
		test("throws when delay exceeds maxServerDelay", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(429, {
					"Content-Type": "application/json",
					"Retry-After": "2", // 2 seconds
				});
				res.end(JSON.stringify({ error: "Too Many Requests" }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryAfter({
				strategy: () => upto(3, zero()),
				maxServerDelay: 500, // 500ms max delay
			})(fetch);

			// Act & Assert
			await ctx.assert.rejects(
				() => qfetch(`${baseUrl}/test`, { signal: ctx.signal }),
				(e: unknown) =>
					e instanceof DOMException && e.name === "ConstraintError",
				"throws ConstraintError when server delay exceeds limit",
			);
		});

		test("retries when delay is within maxServerDelay", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				if (handler.mock.callCount() <= 1) {
					res.writeHead(429, {
						"Content-Type": "application/json",
						"Retry-After": "1", // 1 second
					});
					res.end(JSON.stringify({ error: "Too Many Requests" }));
				} else {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ message: "Success" }));
				}
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryAfter({
				strategy: () => upto(3, zero()),
				maxServerDelay: 5_000, // 5 seconds max delay
			})(fetch);

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
	});

	describe("retry limit enforcement", () => {
		test("stops retrying after max retries exhausted", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(429, {
					"Content-Type": "application/json",
					"Retry-After": "1",
				});
				res.end(JSON.stringify({ error: "Too Many Requests" }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryAfter({ strategy: () => upto(1, zero()) })(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/test`, { signal: ctx.signal });
			await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				429,
				"returns error status after retries exhausted",
			);
			ctx.assert.strictEqual(
				handler.mock.callCount(),
				2,
				"makes initial plus retry attempts",
			);
		});
	});

	describe("zero delay", () => {
		test("retries immediately when Retry-After is 0", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				if (handler.mock.callCount() <= 2) {
					res.writeHead(429, {
						"Content-Type": "application/json",
						"Retry-After": "0",
					});
					res.end(
						JSON.stringify({
							error: "Too Many Requests",
							retryAfter: "0",
						}),
					);
				} else {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ message: "Success" }));
				}
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(fetch);

			// Act
			const startTime = Date.now();
			const response = await qfetch(`${baseUrl}/test`, { signal: ctx.signal });
			const duration = Date.now() - startTime;
			await response.json();

			// Assert
			ctx.assert.strictEqual(response.status, 200, "succeeds after retries");
			ctx.assert.ok(
				duration < 1000,
				`completes quickly with zero delay (actual: ${duration}ms)`,
			);
		});
	});

	describe("multiple consecutive retries", () => {
		test("retries multiple times before succeeding", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				if (handler.mock.callCount() <= 2) {
					res.writeHead(429, {
						"Content-Type": "application/json",
						"Retry-After": "1",
					});
					res.end(
						JSON.stringify({
							error: "Too Many Requests",
						}),
					);
				} else {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(
						JSON.stringify({
							message: "Success after multiple retries!",
						}),
					);
				}
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryAfter({ strategy: () => upto(5, zero()) })(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/test`, { signal: ctx.signal });
			await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"succeeds after multiple retries",
			);
			ctx.assert.strictEqual(
				handler.mock.callCount(),
				4,
				"makes expected number of attempts",
			);
		});
	});

	describe("past HTTP-date handling", () => {
		test("retries immediately when HTTP-date is in the past", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				if (handler.mock.callCount() <= 2) {
					const pastDate = new Date(Date.now() - 10000); // 10 seconds in the past
					const httpDate = pastDate.toUTCString();
					res.writeHead(429, {
						"Content-Type": "application/json",
						"Retry-After": httpDate,
					});
					res.end(
						JSON.stringify({
							error: "Too Many Requests",
							retryAfter: httpDate,
						}),
					);
				} else {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ message: "Success" }));
				}
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(fetch);

			// Act
			const startTime = Date.now();
			const response = await qfetch(`${baseUrl}/test`, { signal: ctx.signal });
			const duration = Date.now() - startTime;
			await response.json();

			// Assert
			ctx.assert.strictEqual(response.status, 200, "succeeds after retries");
			ctx.assert.ok(
				duration < 1000,
				`completes quickly with past date (actual: ${duration}ms)`,
			);
		});
	});

	describe("mixed status codes", () => {
		test("handles different retryable status codes across attempts", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				if (handler.mock.callCount() === 0) {
					res.writeHead(429, {
						"Content-Type": "application/json",
						"Retry-After": "1",
					});
					res.end(
						JSON.stringify({
							error: "Too Many Requests",
						}),
					);
				} else if (handler.mock.callCount() === 1) {
					res.writeHead(503, {
						"Content-Type": "application/json",
						"Retry-After": "1",
					});
					res.end(
						JSON.stringify({
							error: "Service Unavailable",
						}),
					);
				} else {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ message: "Success" }));
				}
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/test`, { signal: ctx.signal });
			await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"succeeds after mixed status retries",
			);
			ctx.assert.strictEqual(
				handler.mock.callCount(),
				3,
				"makes expected number of attempts",
			);
		});
	});

	describe("backoff strategy integration", () => {
		test("applies additional backoff delay from strategy", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				if (handler.mock.callCount() <= 1) {
					res.writeHead(429, {
						"Content-Type": "application/json",
						"Retry-After": "1",
					});
					res.end(
						JSON.stringify({
							error: "Too Many Requests",
							timestamp: Date.now(),
						}),
					);
				} else {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(
						JSON.stringify({
							message: "Success",
							timestamp: Date.now(),
						}),
					);
				}
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryAfter({
				strategy: () => upto(3, fullJitter(0, 1_000)), // up to 1 second jitter
			})(fetch);

			// Act
			const startTime = Date.now();
			const response = await qfetch(`${baseUrl}/test`, { signal: ctx.signal });
			const duration = Date.now() - startTime;
			await response.json();

			// Assert
			ctx.assert.strictEqual(response.status, 200, "succeeds after retry");
			ctx.assert.ok(
				duration >= 1000,
				`waits at least base delay (actual: ${duration}ms)`,
			);
			ctx.assert.ok(
				duration <= 2500,
				`does not exceed base plus max jitter plus overhead (actual: ${duration}ms)`,
			);
		});

		test("retries with server delay only when strategy adds no delay", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				if (handler.mock.callCount() <= 0) {
					res.writeHead(429, {
						"Content-Type": "application/json",
						"Retry-After": "1",
					});
					res.end(JSON.stringify({ error: "Too Many Requests" }));
				} else {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ message: "Success" }));
				}
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(fetch);

			// Act
			const startTime = Date.now();
			const response = await qfetch(`${baseUrl}/test`, { signal: ctx.signal });
			const duration = Date.now() - startTime;
			await response.json();

			// Assert
			ctx.assert.strictEqual(response.status, 200, "succeeds after retry");
			ctx.assert.ok(
				duration >= 1000 && duration <= 1500,
				`waits approximately server delay without additional backoff (actual: ${duration}ms)`,
			);
		});
	});

	describe("signal cancellation", () => {
		test("aborts immediately when signal is already aborted", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ message: "Success" }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(fetch);
			const controller = new AbortController();
			controller.abort();

			// Act & Assert
			await ctx.assert.rejects(
				() => qfetch(`${baseUrl}/test`, { signal: controller.signal }),
				(e: unknown) => e instanceof DOMException && e.name === "AbortError",
				"throws AbortError when signal is pre-aborted",
			);
		});

		test("aborts during retry delay", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				if (handler.mock.callCount() <= 1) {
					res.writeHead(429, {
						"Content-Type": "application/json",
						"Retry-After": "5", // 5 seconds
					});
					res.end(JSON.stringify({ error: "Too Many Requests" }));
				} else {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ message: "Success" }));
				}
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(fetch);
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

		test("aborts during initial request", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(429, {
					"Content-Type": "application/json",
					"Retry-After": "1",
				});
				res.end(JSON.stringify({ error: "Too Many Requests" }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(fetch);
			const controller = new AbortController();

			// Act
			const promise = qfetch(`${baseUrl}/test`, { signal: controller.signal });

			// Abort immediately
			controller.abort();

			// Assert
			await ctx.assert.rejects(
				() => promise,
				(e: unknown) => e instanceof DOMException && e.name === "AbortError",
				"throws AbortError when aborted during initial request",
			);
		});

		test("aborts between multiple retries", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				if (handler.mock.callCount() <= 3) {
					res.writeHead(429, {
						"Content-Type": "application/json",
						"Retry-After": "1",
					});
					res.end(
						JSON.stringify({
							error: "Too Many Requests",
						}),
					);
				} else {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ message: "Success" }));
				}
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryAfter({ strategy: () => upto(5, zero()) })(fetch);
			const controller = new AbortController();

			// Act
			const promise = qfetch(`${baseUrl}/test`, { signal: controller.signal });

			// Abort during second retry delay
			setTimeout(() => controller.abort(), 1500);

			// Assert
			await ctx.assert.rejects(
				() => promise,
				(e: unknown) => e instanceof DOMException && e.name === "AbortError",
				"throws AbortError when aborted between retries",
			);
		});

		test("propagates abort signal to underlying fetch", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ message: "Success" }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withRetryAfter({ strategy: () => upto(3, zero()) })(fetch);
			const controller = new AbortController();

			// Act
			const promise = qfetch(`${baseUrl}/test`, { signal: controller.signal });
			controller.abort();

			// Assert
			await ctx.assert.rejects(
				() => promise,
				(e: unknown) => e instanceof DOMException && e.name === "AbortError",
				"propagates abort to underlying fetch",
			);
		});

		test("stops retrying after signal is aborted", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				if (handler.mock.callCount() <= 3) {
					res.writeHead(429, {
						"Content-Type": "application/json",
						"Retry-After": "1",
					});
					res.end(
						JSON.stringify({
							error: "Too Many Requests",
						}),
					);
				} else {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ message: "Success" }));
				}
			});

			const { baseUrl } = await createTestServer(ctx, handler);

			const qfetch = withRetryAfter({ strategy: () => upto(5, zero()) })(fetch);
			const controller = new AbortController();

			// Act
			const promise = qfetch(`${baseUrl}/test`, { signal: controller.signal });

			// Abort quickly
			setTimeout(() => controller.abort(), 50);

			// Assert
			await ctx.assert.rejects(
				() => promise,
				(e: unknown) => {
					const aborted = e instanceof DOMException && e.name === "AbortError";
					const limitedRequests = handler.mock.callCount() <= 2;
					return aborted && limitedRequests;
				},
				"makes limited requests before abort takes effect",
			);
		});
	});
});
