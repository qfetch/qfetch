import { createServer, type Server } from "node:http";
import { describe, it, type TestContext } from "node:test";

import { withRetryAfter } from "./with-retry-after.ts";

interface ServerContext {
	server: Server;
	baseUrl: string;
}

/* node:coverage disable */
describe("withRetryAfter middleware - E2E tests", { concurrency: true }, () => {
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

	describe("Successful requests", () => {
		it("should pass through successful response without retry", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetch);

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
				data.requestCount,
				1,
				"Should only make one request",
			);
		});
	});

	describe("Retry with 429 status code", () => {
		it("should retry after delay for 429 with Retry-After header", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetch);

			// act
			const response = await qfetch(`${baseUrl}/retry-429?delay=1`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// assert
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

		it("should not retry 429 without Retry-After header", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetch);

			// act
			const response = await qfetch(`${baseUrl}/no-retry-after`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// assert
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

		it("should not retry 429 with invalid Retry-After header", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetch);

			// act
			const response = await qfetch(`${baseUrl}/invalid-retry-after`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// assert
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

	describe("Retry with 503 status code", () => {
		it("should retry after delay for 503 with Retry-After header", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetch);

			// act
			const response = await qfetch(`${baseUrl}/retry-503?delay=1`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// assert
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
		it("should retry with HTTP-date format Retry-After", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetch);

			// act
			const response = await qfetch(`${baseUrl}/retry-http-date`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// assert
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
		it("should throw AbortError when Retry-After exceeds INT32_MAX", async (ctx: TestContext) => {
			// arrange
			ctx.plan(1);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetch);

			// act & assert
			await ctx.assert.rejects(
				() =>
					qfetch(`${baseUrl}/exceeds-int32`, {
						signal: ctx.signal,
					}),
				(e: unknown) => e instanceof DOMException && e.name === "AbortError",
				"Should throw AbortError when Retry-After exceeds INT32_MAX",
			);
		});
	});

	describe("maxDelayTime enforcement", () => {
		it("should throw when delay exceeds maxDelayTime", async (ctx: TestContext) => {
			// arrange
			ctx.plan(1);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({
				maxRetries: 3,
				maxDelayTime: 500, // 500ms max delay
			})(fetch);

			// act & assert
			await ctx.assert.rejects(
				() => qfetch(`${baseUrl}/retry-429?delay=2`, { signal: ctx.signal }), // 2 seconds > 500ms
				(e: unknown) => e instanceof DOMException && e.name === "AbortError",
				"Should throw AbortError when delay exceeds maxDelayTime",
			);
		});

		it("should retry when delay is within maxDelayTime", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({
				maxRetries: 3,
				maxDelayTime: 5_000, // 5 seconds max delay
			})(fetch);

			// act
			const response = await qfetch(`${baseUrl}/retry-429?delay=1`, {
				signal: ctx.signal,
			}); // 1 second < 5 seconds
			const data = await response.json();

			// assert
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
		it("should stop retrying after maxRetries is reached", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 1 })(fetch);

			// act
			const response = await qfetch(`${baseUrl}/retry-429?delay=1`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// assert
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

	describe("Zero delay", () => {
		it("should retry immediately with Retry-After: 0", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetch);

			// act
			const startTime = Date.now();
			const response = await qfetch(`${baseUrl}/zero-delay`, {
				signal: ctx.signal,
			});
			const duration = Date.now() - startTime;
			await response.json();

			// assert
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

	describe("Multiple consecutive retries", () => {
		it("should retry multiple times before success", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 5 })(fetch);

			// act
			const response = await qfetch(`${baseUrl}/multiple-retries`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// assert
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
		it("should retry immediately with past HTTP-date", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetch);

			// act
			const startTime = Date.now();
			const response = await qfetch(`${baseUrl}/past-http-date`, {
				signal: ctx.signal,
			});
			const duration = Date.now() - startTime;
			await response.json();

			// assert
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

	describe("Mixed status codes", () => {
		it("should handle mix of 429 and 503 across retries", async (ctx: TestContext) => {
			// arrange
			ctx.plan(2);
			const { baseUrl } = await createTestServer(ctx);
			const qfetch = withRetryAfter({ maxRetries: 3 })(fetch);

			// act
			const response = await qfetch(`${baseUrl}/mixed-status`, {
				signal: ctx.signal,
			});
			const data = await response.json();

			// assert
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
});
