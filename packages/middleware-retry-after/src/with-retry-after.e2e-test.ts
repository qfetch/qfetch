import { createServer, type Server } from "node:http";
import { describe, suite, type TestContext, test } from "node:test";

import { withRetryAfter } from "./with-retry-after.ts";

interface ServerContext {
	server: Server;
	baseUrl: string;
}

/* node:coverage disable */
suite("withRetryAfter middleware - E2E tests", { concurrency: true }, () => {
	/**
	 * Creates an isolated HTTP server for a single test.
	 * Each test gets its own server on a random port to enable concurrent execution.
	 */
	const createTestServer = async (ctx: TestContext): Promise<ServerContext> => {
		let requestCount = 0;

		const server = createServer((req, res) => {
			requestCount++;
			const url = new URL(req.url || "/", "http://localhost");
			const path = url.pathname;

			// Route: /success - Always returns 200
			if (path === "/success") {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ message: "Success!", requestCount }));
				return;
			}

			// Route: /retry-429 - First 2 requests return 429, then 200
			if (path === "/retry-429") {
				if (requestCount <= 2) {
					const retryAfter = url.searchParams.get("delay") || "1";
					res.writeHead(429, {
						"Content-Type": "application/json",
						"Retry-After": retryAfter,
					});
					res.end(
						JSON.stringify({
							error: "Too Many Requests",
							requestCount,
							retryAfter,
						}),
					);
					return;
				}
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({ message: "Success after retry!", requestCount }),
				);
				return;
			}

			// Route: /retry-503 - First 2 requests return 503, then 200
			if (path === "/retry-503") {
				if (requestCount <= 2) {
					const retryAfter = url.searchParams.get("delay") || "1";
					res.writeHead(503, {
						"Content-Type": "application/json",
						"Retry-After": retryAfter,
					});
					res.end(
						JSON.stringify({
							error: "Service Unavailable",
							requestCount,
							retryAfter,
						}),
					);
					return;
				}
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({ message: "Success after retry!", requestCount }),
				);
				return;
			}

			// Route: /retry-http-date - Returns Retry-After as HTTP-date
			if (path === "/retry-http-date") {
				if (requestCount <= 2) {
					const futureDate = new Date(Date.now() + 1000); // 1 second from now
					const httpDate = futureDate.toUTCString();
					res.writeHead(429, {
						"Content-Type": "application/json",
						"Retry-After": httpDate,
					});
					res.end(
						JSON.stringify({
							error: "Too Many Requests",
							requestCount,
							retryAfter: httpDate,
						}),
					);
					return;
				}
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({ message: "Success after retry!", requestCount }),
				);
				return;
			}

			// Route: /no-retry-after - Returns 429 without Retry-After header
			if (path === "/no-retry-after") {
				res.writeHead(429, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						error: "Too Many Requests",
						requestCount,
						note: "No Retry-After header",
					}),
				);
				return;
			}

			// Route: /invalid-retry-after - Returns 429 with invalid Retry-After
			if (path === "/invalid-retry-after") {
				res.writeHead(429, {
					"Content-Type": "application/json",
					"Retry-After": "invalid-value",
				});
				res.end(
					JSON.stringify({
						error: "Too Many Requests",
						requestCount,
						retryAfter: "invalid-value",
					}),
				);
				return;
			}

			// Route: /max-int32 - Returns 429 with INT32_MAX value
			if (path === "/max-int32") {
				if (requestCount <= 1) {
					const delay = "2147483"; // Valid: results in INT32_MAX milliseconds
					res.writeHead(429, {
						"Content-Type": "application/json",
						"Retry-After": delay,
					});
					res.end(
						JSON.stringify({
							error: "Too Many Requests",
							requestCount,
							retryAfter: delay,
						}),
					);
					return;
				}
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({ message: "Success after retry!", requestCount }),
				);
				return;
			}

			// Route: /exceeds-int32 - Returns 429 with value exceeding INT32_MAX
			if (path === "/exceeds-int32") {
				const delay = "2147484"; // Invalid: exceeds INT32_MAX when converted to ms
				res.writeHead(429, {
					"Content-Type": "application/json",
					"Retry-After": delay,
				});
				res.end(
					JSON.stringify({
						error: "Too Many Requests",
						requestCount,
						retryAfter: delay,
					}),
				);
				return;
			}

			// Route: /zero-delay - Returns 429 with zero delay
			if (path === "/zero-delay") {
				if (requestCount <= 2) {
					res.writeHead(429, {
						"Content-Type": "application/json",
						"Retry-After": "0",
					});
					res.end(
						JSON.stringify({
							error: "Too Many Requests",
							requestCount,
							retryAfter: "0",
						}),
					);
					return;
				}
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({ message: "Success after retry!", requestCount }),
				);
				return;
			}

			// Route: /multiple-retries - Returns 429 three times before success
			if (path === "/multiple-retries") {
				if (requestCount <= 3) {
					res.writeHead(429, {
						"Content-Type": "application/json",
						"Retry-After": "1",
					});
					res.end(
						JSON.stringify({
							error: "Too Many Requests",
							requestCount,
							attempt: requestCount,
						}),
					);
					return;
				}
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						message: "Success after multiple retries!",
						requestCount,
					}),
				);
				return;
			}

			// Route: /past-http-date - Returns 429 with HTTP-date in the past
			if (path === "/past-http-date") {
				if (requestCount <= 2) {
					const pastDate = new Date(Date.now() - 10000); // 10 seconds in the past
					const httpDate = pastDate.toUTCString();
					res.writeHead(429, {
						"Content-Type": "application/json",
						"Retry-After": httpDate,
					});
					res.end(
						JSON.stringify({
							error: "Too Many Requests",
							requestCount,
							retryAfter: httpDate,
						}),
					);
					return;
				}
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({ message: "Success after retry!", requestCount }),
				);
				return;
			}

			// Route: /mixed-status - Returns 429, then 503, then 200
			if (path === "/mixed-status") {
				if (requestCount === 1) {
					res.writeHead(429, {
						"Content-Type": "application/json",
						"Retry-After": "1",
					});
					res.end(
						JSON.stringify({
							error: "Too Many Requests",
							requestCount,
						}),
					);
					return;
				}
				if (requestCount === 2) {
					res.writeHead(503, {
						"Content-Type": "application/json",
						"Retry-After": "1",
					});
					res.end(
						JSON.stringify({
							error: "Service Unavailable",
							requestCount,
						}),
					);
					return;
				}
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({ message: "Success after retry!", requestCount }),
				);
				return;
			}

			// Route: /jitter-test - Returns 429 with configurable delay for jitter testing
			if (path === "/jitter-test") {
				if (requestCount <= 1) {
					const retryAfter = url.searchParams.get("delay") || "1";
					res.writeHead(429, {
						"Content-Type": "application/json",
						"Retry-After": retryAfter,
					});
					res.end(
						JSON.stringify({
							error: "Too Many Requests",
							requestCount,
							retryAfter,
							timestamp: Date.now(),
						}),
					);
					return;
				}
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						message: "Success after retry!",
						requestCount,
						timestamp: Date.now(),
					}),
				);
				return;
			}

			// Default 404
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

	describe("successful requests", () => {
		test("passes through successful response without retry", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/success`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"Response status should be 200",
			);
			ctx.assert.strictEqual(
				data.requestCount,
				1,
				"Should only make one request",
			);
		});
	});

	describe("retry with 429 status code", () => {
		test("retries after delay for 429 with Retry-After header", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/retry-429?delay=1`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"Response status should be 200 after retries",
			);
			ctx.assert.strictEqual(
				data.requestCount,
				3,
				"Should make 3 requests (2 retries + 1 success)",
			);
		});

		test("does not retry 429 without Retry-After header", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/no-retry-after`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				429,
				"Response status should remain 429",
			);
			ctx.assert.strictEqual(
				data.requestCount,
				1,
				"Should only make one request without Retry-After header",
			);
		});

		test("does not retry 429 with invalid Retry-After header", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/invalid-retry-after`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				429,
				"Response status should remain 429",
			);
			ctx.assert.strictEqual(
				data.requestCount,
				1,
				"Should only make one request with invalid Retry-After header",
			);
		});
	});

	describe("retry with 503 status code", () => {
		test("retries after delay for 503 with Retry-After header", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/retry-503?delay=1`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"Response status should be 200 after retries",
			);
			ctx.assert.strictEqual(
				data.requestCount,
				3,
				"Should make 3 requests (2 retries + 1 success)",
			);
		});
	});

	describe("HTTP-date format", () => {
		test("retries with HTTP-date format Retry-After", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/retry-http-date`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"Response status should be 200 after retries",
			);
			ctx.assert.strictEqual(
				data.requestCount,
				3,
				"Should make 3 requests (2 retries + 1 success)",
			);
		});
	});

	describe("INT32_MAX boundary tests", () => {
		test("throws ConstraintError when Retry-After exceeds INT32_MAX", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetch);

			// Act & assert
			await ctx.assert.rejects(
				() =>
					qfetch(`${baseUrl}/exceeds-int32`, {
						signal: ctx.signal,
					}),
				(e: unknown) =>
					e instanceof DOMException && e.name === "ConstraintError",
				"Should throw ConstraintError when Retry-After exceeds INT32_MAX",
			);
		});
	});

	describe("maxDelayTime enforcement", () => {
		test("throws when delay exceeds maxDelayTime", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({
				maxRetries: 3,
				maxDelayTime: 500, // 500ms max delay
			})(fetch);

			// Act & assert
			await ctx.assert.rejects(
				() => qfetch(`${baseUrl}/retry-429?delay=2`, { signal: ctx.signal }), // 2 seconds > 500ms
				(e: unknown) =>
					e instanceof DOMException && e.name === "ConstraintError",
				"Should throw ConstraintError when delay exceeds maxDelayTime",
			);
		});

		test("retries when delay is within maxDelayTime", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({
				maxRetries: 3,
				maxDelayTime: 5_000, // 5 seconds max delay
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/retry-429?delay=1`, {
				signal: ctx.signal,
			}); // 1 second < 5 seconds
			const data = await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"Response status should be 200 after retries",
			);
			ctx.assert.strictEqual(
				data.requestCount,
				3,
				"Should make 3 requests when delay is within maxDelayTime",
			);
		});
	});

	describe("maxRetries enforcement", () => {
		test("stops retrying after maxRetries is reached", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 1 })(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/retry-429?delay=1`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				429,
				"Response status should remain 429 after exhausting retries",
			);
			ctx.assert.strictEqual(
				data.requestCount,
				2,
				"Should make 2 requests (1 initial + 1 retry)",
			);
		});
	});

	describe("zero delay", () => {
		test("retries immediately with Retry-After: 0", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetch);

			// Act
			const startTime = Date.now();
			const response = await qfetch(`${baseUrl}/zero-delay`, {
				signal: ctx.signal,
			});
			const duration = Date.now() - startTime;
			await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"Response status should be 200 after retries",
			);
			ctx.assert.ok(
				duration < 1000,
				`Should complete quickly with zero delay (actual: ${duration}ms)`,
			);
		});
	});

	describe("multiple consecutive retries", () => {
		test("retries multiple times before success", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 5 })(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/multiple-retries`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"Response status should be 200 after multiple retries",
			);
			ctx.assert.strictEqual(
				data.requestCount,
				4,
				"Should make 4 requests (3 failures + 1 success)",
			);
		});
	});

	describe("HTTP-date in the past", () => {
		test("retries immediately with past HTTP-date", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetch);

			// Act
			const startTime = Date.now();
			const response = await qfetch(`${baseUrl}/past-http-date`, {
				signal: ctx.signal,
			});
			const duration = Date.now() - startTime;
			await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"Response status should be 200 after retries",
			);
			ctx.assert.ok(
				duration < 1000,
				`Should complete quickly with past date (actual: ${duration}ms)`,
			);
		});
	});

	describe("mixed status codes", () => {
		test("handles mix of 429 and 503 across retries", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/mixed-status`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"Response status should be 200 after retries with mixed status codes",
			);
			ctx.assert.strictEqual(
				data.requestCount,
				3,
				"Should make 3 requests (429 + 503 + success)",
			);
		});
	});

	describe("jitter prevents thundering herd", () => {
		test("uses full-jitter strategy with delay longer than base", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({
				maxRetries: 3,
				maxJitter: 1_000, // 1 second max jitter
			})(fetch);

			// Act
			const startTime = Date.now();
			const response = await qfetch(`${baseUrl}/jitter-test?delay=1`, {
				signal: ctx.signal,
			}); // 1 second base delay, jitter = random(0, min(1000, 1000)) = random(0, 1000)
			const duration = Date.now() - startTime;
			await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"Response status should be 200 after retry with full-jitter",
			);
			ctx.assert.ok(
				duration >= 1000,
				`Should wait at least the base delay (actual: ${duration}ms)`,
			);
			ctx.assert.ok(
				duration <= 2500,
				`Should not exceed base + min(maxJitter, delay) + overhead (actual: ${duration}ms)`,
			);
		});

		test("retries deterministically without jitter when maxJitter is not set", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetch); // No jitter

			// Act
			const startTime = Date.now();
			const response = await qfetch(`${baseUrl}/jitter-test?delay=1`, {
				signal: ctx.signal,
			});
			const duration = Date.now() - startTime;
			await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"Response status should be 200 after retry without jitter",
			);
			ctx.assert.ok(
				duration >= 1000 && duration <= 1500,
				`Should wait approximately the base delay without jitter (actual: ${duration}ms)`,
			);
		});

		test("works with zero maxJitter (no jitter)", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({
				maxRetries: 3,
				maxJitter: 0, // Explicitly no jitter
			})(fetch);

			// Act
			const startTime = Date.now();
			const response = await qfetch(`${baseUrl}/jitter-test?delay=1`, {
				signal: ctx.signal,
			});
			const duration = Date.now() - startTime;
			await response.json();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"Response status should be 200 after retry with zero jitter",
			);
			ctx.assert.ok(
				duration >= 1000 && duration <= 1500,
				`Should wait approximately the base delay with zero jitter (actual: ${duration}ms)`,
			);
		});
	});

	describe("signal cancellation", () => {
		test("aborts immediately when signal is already aborted", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetch);
			const controller = new AbortController();
			controller.abort();

			// Act & assert
			await ctx.assert.rejects(
				() => qfetch(`${baseUrl}/success`, { signal: controller.signal }),
				(e: unknown) => e instanceof DOMException && e.name === "AbortError",
				"Should throw AbortError when signal is already aborted",
			);
		});

		test("aborts during retry delay", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetch);
			const controller = new AbortController();

			// Act
			const promise = qfetch(`${baseUrl}/retry-429?delay=5`, {
				signal: controller.signal,
			});

			// Wait a bit then abort during the retry delay
			setTimeout(() => controller.abort(), 1000);

			// Assert
			await ctx.assert.rejects(
				() => promise,
				(e: unknown) => e instanceof DOMException && e.name === "AbortError",
				"Should throw AbortError when signal is aborted during retry delay",
			);
		});

		test("aborts during initial request", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetch);
			const controller = new AbortController();

			// Act
			const promise = qfetch(`${baseUrl}/retry-429?delay=1`, {
				signal: controller.signal,
			});

			// Abort immediately before any request completes
			controller.abort();

			// Assert
			await ctx.assert.rejects(
				() => promise,
				(e: unknown) => e instanceof DOMException && e.name === "AbortError",
				"Should throw AbortError when signal is aborted during initial request",
			);
		});

		test("aborts between multiple retries", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 5 })(fetch);
			const controller = new AbortController();

			// Act
			const promise = qfetch(`${baseUrl}/multiple-retries`, {
				signal: controller.signal,
			});

			// Wait for first retry to complete, then abort during second retry delay
			setTimeout(() => controller.abort(), 1500);

			// Assert
			await ctx.assert.rejects(
				() => promise,
				(e: unknown) => e instanceof DOMException && e.name === "AbortError",
				"Should throw AbortError when signal is aborted between retries",
			);
		});

		test("propagates abort signal to underlying fetch", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetch);
			const controller = new AbortController();

			// Act
			const promise = qfetch(`${baseUrl}/success`, {
				signal: controller.signal,
			});
			controller.abort();

			// Assert
			await ctx.assert.rejects(
				() => promise,
				(e: unknown) => e instanceof DOMException && e.name === "AbortError",
				"Should propagate abort signal to underlying fetch",
			);
		});

		test("does not retry after signal is aborted", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const { baseUrl } = await createTestServer(ctx);
			let requestCount = 0;

			// Create a custom fetch that counts requests
			const countingFetch: typeof fetch = async (input, init) => {
				requestCount++;
				return fetch(input, init);
			};

			const qfetch = withRetryAfter({ maxRetries: 5 })(countingFetch);
			const controller = new AbortController();

			// Act
			const promise = qfetch(`${baseUrl}/multiple-retries`, {
				signal: controller.signal,
			});

			// Abort very quickly
			setTimeout(() => controller.abort(), 50);

			// Assert
			await ctx.assert.rejects(
				() => promise,
				(e: unknown) => {
					// Should have made at most 2 requests before abort kicked in
					const aborted = e instanceof DOMException && e.name === "AbortError";
					const limitedRequests = requestCount <= 2;
					return aborted && limitedRequests;
				},
				"Should not make additional requests after signal is aborted",
			);
		});
	});
});
