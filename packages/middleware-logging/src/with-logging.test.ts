import { describe, suite, type TestContext, test } from "node:test";

import type { LogEntry, Logger } from "./with-logging.ts";
import { withLogging } from "./with-logging.ts";

/* node:coverage disable */

suite("withLogging - Unit", () => {
	describe("request information is captured correctly", () => {
		test("logs URL, method, and headers for string input", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(5);
			let captured: LogEntry | undefined;
			const logger: Logger = (entry) => {
				captured = entry;
			};
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withLogging({ logger })(fetchMock);

			// Act
			await qfetch("https://example.com/api", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});

			// Assert
			ctx.assert.ok(captured, "logger was called");
			ctx.assert.strictEqual(
				captured.request.url,
				"https://example.com/api",
				"captures URL",
			);
			ctx.assert.strictEqual(
				captured.request.method,
				"POST",
				"captures method",
			);
			ctx.assert.strictEqual(
				captured.request.headers["content-type"],
				"application/json",
				"captures headers",
			);
			ctx.assert.ok(captured.timestamp, "includes timestamp");
		});

		test("logs URL from Request object", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			let captured: LogEntry | undefined;
			const logger: Logger = (entry) => {
				captured = entry;
			};
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withLogging({ logger })(fetchMock);
			const request = new Request("https://example.com/users", {
				method: "DELETE",
			});

			// Act
			await qfetch(request);

			// Assert
			ctx.assert.ok(captured, "logger was called");
			ctx.assert.strictEqual(
				captured.request.url,
				"https://example.com/users",
				"captures URL from Request",
			);
			ctx.assert.strictEqual(
				captured.request.method,
				"DELETE",
				"captures method from Request",
			);
		});

		test("logs URL from URL object", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			let captured: LogEntry | undefined;
			const logger: Logger = (entry) => {
				captured = entry;
			};
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withLogging({ logger })(fetchMock);

			// Act
			await qfetch(new URL("https://example.com/path"));

			// Assert
			ctx.assert.ok(captured, "logger was called");
			ctx.assert.strictEqual(
				captured.request.url,
				"https://example.com/path",
				"captures URL from URL object",
			);
			ctx.assert.strictEqual(
				captured.request.method,
				"GET",
				"defaults to GET method",
			);
		});

		test("merges headers from Request and init", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			let captured: LogEntry | undefined;
			const logger: Logger = (entry) => {
				captured = entry;
			};
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withLogging({ logger })(fetchMock);
			const request = new Request("https://example.com", {
				headers: { "X-Original": "value1" },
			});

			// Act
			await qfetch(request, {
				headers: { "X-Override": "value2" },
			});

			// Assert
			ctx.assert.ok(captured, "logger was called");
			ctx.assert.strictEqual(
				captured.request.headers["x-original"],
				"value1",
				"includes original Request headers",
			);
			ctx.assert.strictEqual(
				captured.request.headers["x-override"],
				"value2",
				"includes init headers",
			);
		});
	});

	describe("response information is captured correctly", () => {
		test("logs status, statusText, and ok for successful response", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(4);
			let captured: LogEntry | undefined;
			const logger: Logger = (entry) => {
				captured = entry;
			};
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200, statusText: "OK" }),
			);
			const qfetch = withLogging({ logger })(fetchMock);

			// Act
			await qfetch("https://example.com");

			// Assert
			ctx.assert.ok(captured?.response, "response is captured");
			ctx.assert.strictEqual(captured.response.status, 200, "captures status");
			ctx.assert.strictEqual(
				captured.response.statusText,
				"OK",
				"captures statusText",
			);
			ctx.assert.strictEqual(captured.response.ok, true, "captures ok flag");
		});

		test("logs response headers", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			let captured: LogEntry | undefined;
			const logger: Logger = (entry) => {
				captured = entry;
			};
			const responseHeaders = new Headers({
				"Content-Type": "application/json",
				"X-Request-Id": "abc123",
			});
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { headers: responseHeaders }),
			);
			const qfetch = withLogging({ logger })(fetchMock);

			// Act
			await qfetch("https://example.com");

			// Assert
			ctx.assert.strictEqual(
				captured?.response?.headers["content-type"],
				"application/json",
				"captures response content-type",
			);
			ctx.assert.strictEqual(
				captured?.response?.headers["x-request-id"],
				"abc123",
				"captures custom response header",
			);
		});

		test("logs error responses with ok=false", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			let captured: LogEntry | undefined;
			const logger: Logger = (entry) => {
				captured = entry;
			};
			const fetchMock = ctx.mock.fn(
				fetch,
				async () =>
					new Response("not found", { status: 404, statusText: "Not Found" }),
			);
			const qfetch = withLogging({ logger })(fetchMock);

			// Act
			await qfetch("https://example.com");

			// Assert
			ctx.assert.strictEqual(
				captured?.response?.status,
				404,
				"captures error status",
			);
			ctx.assert.strictEqual(
				captured?.response?.ok,
				false,
				"ok is false for error responses",
			);
		});
	});

	describe("timing information is captured", () => {
		test("logs duration in milliseconds", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			let captured: LogEntry | undefined;
			const logger: Logger = (entry) => {
				captured = entry;
			};
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withLogging({ logger })(fetchMock);

			// Act
			await qfetch("https://example.com");

			// Assert
			ctx.assert.ok(captured, "logger was called");
			ctx.assert.strictEqual(
				typeof captured.durationMs,
				"number",
				"durationMs is a number",
			);
		});

		test("logs ISO 8601 timestamp", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			let captured: LogEntry | undefined;
			const logger: Logger = (entry) => {
				captured = entry;
			};
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withLogging({ logger })(fetchMock);

			// Act
			await qfetch("https://example.com");

			// Assert
			ctx.assert.ok(captured, "logger was called");
			ctx.assert.ok(
				/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(captured.timestamp),
				"timestamp is ISO 8601 format",
			);
		});
	});

	describe("error handling logs failures correctly", () => {
		test("logs error when fetch throws", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			let captured: LogEntry | undefined;
			const logger: Logger = (entry) => {
				captured = entry;
			};
			const testError = new Error("Network failure");
			const fetchMock = ctx.mock.fn(fetch, async () => {
				throw testError;
			});
			const qfetch = withLogging({ logger })(fetchMock);

			// Act & Assert
			await ctx.assert.rejects(
				qfetch("https://example.com"),
				testError,
				"rethrows the original error",
			);
			ctx.assert.ok(captured, "logger was called");
			ctx.assert.strictEqual(
				captured.error,
				testError,
				"captures the error in log entry",
			);
		});

		test("logs request info even when fetch fails", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			let captured: LogEntry | undefined;
			const logger: Logger = (entry) => {
				captured = entry;
			};
			const fetchMock = ctx.mock.fn(fetch, async () => {
				throw new Error("Failed");
			});
			const qfetch = withLogging({ logger })(fetchMock);

			// Act
			try {
				await qfetch("https://example.com/failing", { method: "PUT" });
			} catch {
				// Expected
			}

			// Assert
			ctx.assert.strictEqual(
				captured?.request.url,
				"https://example.com/failing",
				"captures URL on error",
			);
			ctx.assert.strictEqual(
				captured?.request.method,
				"PUT",
				"captures method on error",
			);
		});

		test("response is undefined when fetch fails", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			let captured: LogEntry | undefined;
			const logger: Logger = (entry) => {
				captured = entry;
			};
			const fetchMock = ctx.mock.fn(fetch, async () => {
				throw new Error("Failed");
			});
			const qfetch = withLogging({ logger })(fetchMock);

			// Act
			try {
				await qfetch("https://example.com");
			} catch {
				// Expected
			}

			// Assert
			ctx.assert.strictEqual(
				captured?.response,
				undefined,
				"response is undefined on error",
			);
		});
	});

	describe("header redaction protects sensitive information", () => {
		test("redacts authorization header by default", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			let captured: LogEntry | undefined;
			const logger: Logger = (entry) => {
				captured = entry;
			};
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withLogging({ logger })(fetchMock);

			// Act
			await qfetch("https://example.com", {
				headers: { Authorization: "Bearer secret-token" },
			});

			// Assert
			ctx.assert.strictEqual(
				captured?.request.headers.authorization,
				"[REDACTED]",
				"authorization header is redacted",
			);
		});

		test("redacts cookie header by default", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			let captured: LogEntry | undefined;
			const logger: Logger = (entry) => {
				captured = entry;
			};
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withLogging({ logger })(fetchMock);

			// Act
			await qfetch("https://example.com", {
				headers: { Cookie: "session=abc123" },
			});

			// Assert
			ctx.assert.strictEqual(
				captured?.request.headers.cookie,
				"[REDACTED]",
				"cookie header is redacted",
			);
		});

		test("redacts set-cookie response header by default", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			let captured: LogEntry | undefined;
			const logger: Logger = (entry) => {
				captured = entry;
			};
			const responseHeaders = new Headers({
				"Set-Cookie": "session=secret",
			});
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { headers: responseHeaders }),
			);
			const qfetch = withLogging({ logger })(fetchMock);

			// Act
			await qfetch("https://example.com");

			// Assert
			ctx.assert.strictEqual(
				captured?.response?.headers["set-cookie"],
				"[REDACTED]",
				"set-cookie header is redacted",
			);
		});

		test("redacts custom headers specified in options", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			let captured: LogEntry | undefined;
			const logger: Logger = (entry) => {
				captured = entry;
			};
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withLogging({
				logger,
				redactHeaders: ["x-api-key", "x-secret"],
			})(fetchMock);

			// Act
			await qfetch("https://example.com", {
				headers: { "X-API-Key": "my-key", "X-Secret": "my-secret" },
			});

			// Assert
			ctx.assert.strictEqual(
				captured?.request.headers["x-api-key"],
				"[REDACTED]",
				"custom header is redacted",
			);
			ctx.assert.strictEqual(
				captured?.request.headers["x-secret"],
				"[REDACTED]",
				"another custom header is redacted",
			);
		});

		test("redaction is case-insensitive", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			let captured: LogEntry | undefined;
			const logger: Logger = (entry) => {
				captured = entry;
			};
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withLogging({
				logger,
				redactHeaders: ["X-API-KEY"],
			})(fetchMock);

			// Act
			await qfetch("https://example.com", {
				headers: { "x-api-key": "secret" },
			});

			// Assert
			ctx.assert.strictEqual(
				captured?.request.headers["x-api-key"],
				"[REDACTED]",
				"redaction works regardless of case",
			);
		});
	});

	describe("header inclusion can be configured", () => {
		test("excludes request headers when includeRequestHeaders is false", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			let captured: LogEntry | undefined;
			const logger: Logger = (entry) => {
				captured = entry;
			};
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withLogging({
				logger,
				includeRequestHeaders: false,
			})(fetchMock);

			// Act
			await qfetch("https://example.com", {
				headers: { "Content-Type": "application/json" },
			});

			// Assert
			ctx.assert.deepStrictEqual(
				captured?.request.headers,
				{},
				"request headers are empty",
			);
		});

		test("excludes response headers when includeResponseHeaders is false", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			let captured: LogEntry | undefined;
			const logger: Logger = (entry) => {
				captured = entry;
			};
			const responseHeaders = new Headers({
				"Content-Type": "application/json",
			});
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { headers: responseHeaders }),
			);
			const qfetch = withLogging({
				logger,
				includeResponseHeaders: false,
			})(fetchMock);

			// Act
			await qfetch("https://example.com");

			// Assert
			ctx.assert.deepStrictEqual(
				captured?.response?.headers,
				{},
				"response headers are empty",
			);
		});
	});

	describe("default logger outputs JSON to console", () => {
		test("uses console.log when no logger is provided", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const consoleMock = ctx.mock.method(console, "log", () => {});
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withLogging({})(fetchMock);

			// Act
			await qfetch("https://example.com");

			// Assert
			ctx.assert.strictEqual(
				consoleMock.mock.callCount(),
				1,
				"console.log called once",
			);
			const logArg = consoleMock.mock.calls[0]?.arguments[0] as string;
			const parsed = JSON.parse(logArg);
			ctx.assert.strictEqual(
				parsed.request.url,
				"https://example.com",
				"logs valid JSON with request URL",
			);
		});

		test("works with no options provided", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const consoleMock = ctx.mock.method(console, "log", () => {});
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withLogging()(fetchMock);

			// Act
			await qfetch("https://example.com");

			// Assert
			ctx.assert.strictEqual(
				consoleMock.mock.callCount(),
				1,
				"logs even with undefined options",
			);
		});
	});

	describe("middleware passes through response correctly", () => {
		test("returns the original response unchanged", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const originalResponse = new Response("test body", {
				status: 201,
				statusText: "Created",
			});
			const fetchMock = ctx.mock.fn(fetch, async () => originalResponse);
			const qfetch = withLogging({ logger: () => {} })(fetchMock);

			// Act
			const response = await qfetch("https://example.com");
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				response.status,
				201,
				"response status is preserved",
			);
			ctx.assert.strictEqual(body, "test body", "response body is preserved");
		});

		test("passes input and init to the next middleware", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withLogging({ logger: () => {} })(fetchMock);

			// Act
			await qfetch("https://example.com/path", {
				method: "PATCH",
				body: "data",
			});

			// Assert
			const call = fetchMock.mock.calls[0];
			ctx.assert.strictEqual(
				call?.arguments[0],
				"https://example.com/path",
				"passes input to next",
			);
			ctx.assert.deepStrictEqual(
				call?.arguments[1],
				{ method: "PATCH", body: "data" },
				"passes init to next",
			);
		});
	});
});
