import { describe, suite, type TestContext, test } from "node:test";

import { createTestServer, type RequestHandler } from "@qfetch/test-utils";

import { ResponseError, withResponseError } from "./with-response-error.ts";

/* node:coverage disable */

suite("withResponseError - Integration", { concurrency: true }, () => {
	describe("successful responses pass through unchanged", () => {
		test("returns 200 response without throwing", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ message: "Success" }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withResponseError()(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/test`, { signal: ctx.signal });
			const body = await response.json();

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.deepStrictEqual(
				body,
				{ message: "Success" },
				"returns response body",
			);
		});

		test("returns 2xx responses without throwing", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			const statusCodes = [200, 201, 204];

			for (const status of statusCodes) {
				await ctx.test(`status ${status}`, async (ctx: TestContext) => {
					// Arrange
					ctx.plan(1);
					const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
						res.writeHead(status);
						res.end();
					});

					const { baseUrl } = await createTestServer(ctx, handler);
					const qfetch = withResponseError()(fetch);

					// Act
					const response = await qfetch(`${baseUrl}/test`, {
						signal: ctx.signal,
					});

					// Assert
					ctx.assert.strictEqual(
						response.status,
						status,
						"returns response without throwing",
					);
				});
			}
		});
	});

	describe("error responses throw ResponseError by default", () => {
		test("throws ResponseError for 404 Not Found", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(404, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "Not found" }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withResponseError()(fetch);

			// Act & Assert
			try {
				await qfetch(`${baseUrl}/test`, { signal: ctx.signal });
				ctx.assert.fail("should have thrown");
			} catch (error) {
				ctx.assert.ok(error instanceof ResponseError, "throws ResponseError");
				ctx.assert.strictEqual(error.status, 404, "has correct status");
				ctx.assert.strictEqual(
					error.statusText,
					"Not Found",
					"has status text",
				);
			}
		});

		test("throws ResponseError for 500 Internal Server Error", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(500, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "Internal error" }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withResponseError()(fetch);

			// Act & Assert
			try {
				await qfetch(`${baseUrl}/test`, { signal: ctx.signal });
				ctx.assert.fail("should have thrown");
			} catch (error) {
				ctx.assert.ok(error instanceof ResponseError, "throws ResponseError");
				ctx.assert.strictEqual(error.status, 500, "has correct status");
			}
		});

		test("throws for all 4xx and 5xx status codes", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(6);
			const errorStatuses = [400, 401, 403, 404, 500, 503];

			for (const status of errorStatuses) {
				await ctx.test(`status ${status}`, async (ctx: TestContext) => {
					// Arrange
					ctx.plan(1);
					const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
						res.writeHead(status);
						res.end("Error");
					});

					const { baseUrl } = await createTestServer(ctx, handler);
					const qfetch = withResponseError()(fetch);

					// Act & Assert
					await ctx.assert.rejects(
						qfetch(`${baseUrl}/test`, { signal: ctx.signal }),
						(error: unknown) =>
							error instanceof ResponseError && error.status === status,
						"throws ResponseError with correct status",
					);
				});
			}
		});
	});

	describe("statusMap provides custom error mapping", () => {
		test("uses custom error for mapped status code", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			class NotFoundError extends Error {
				constructor(url: string) {
					super(`Resource not found: ${url}`);
					this.name = "NotFoundError";
				}
			}

			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(404);
				res.end("Not found");
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withResponseError({
				statusMap: new Map([[404, (res) => new NotFoundError(res.url)]]),
			})(fetch);

			// Act & Assert
			try {
				await qfetch(`${baseUrl}/test`, { signal: ctx.signal });
				ctx.assert.fail("should have thrown");
			} catch (error) {
				ctx.assert.ok(error instanceof NotFoundError, "throws custom error");
				ctx.assert.ok(error.message.includes("/test"), "error contains URL");
			}
		});

		test("falls back to ResponseError for unmapped status", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			class NotFoundError extends Error {
				name = "NotFoundError";
			}

			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(500);
				res.end("Server error");
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withResponseError({
				statusMap: new Map([[404, () => new NotFoundError()]]),
			})(fetch);

			// Act & Assert
			await ctx.assert.rejects(
				qfetch(`${baseUrl}/test`, { signal: ctx.signal }),
				(error: unknown) => error instanceof ResponseError,
				"throws ResponseError for unmapped status",
			);
		});
	});

	describe("async error mappers can read response body", () => {
		test("async mapper parses JSON error body", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			class ApiError extends Error {
				code: string;
				constructor(code: string, message: string) {
					super(message);
					this.name = "ApiError";
					this.code = code;
				}
			}

			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(400, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						code: "VALIDATION_ERROR",
						message: "Invalid input",
					}),
				);
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withResponseError({
				statusMap: new Map([
					[
						400,
						async (res) => {
							const body = await res.json();
							return new ApiError(body.code, body.message);
						},
					],
				]),
			})(fetch);

			// Act & Assert
			try {
				await qfetch(`${baseUrl}/test`, { signal: ctx.signal });
				ctx.assert.fail("should have thrown");
			} catch (error) {
				ctx.assert.ok(error instanceof ApiError, "throws ApiError");
				ctx.assert.strictEqual(
					error.code,
					"VALIDATION_ERROR",
					"has error code from body",
				);
			}
		});

		test("async defaultMapper reads text body", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			class ApiError extends Error {
				details: string;
				constructor(details: string) {
					super(`API Error: ${details}`);
					this.name = "ApiError";
					this.details = details;
				}
			}

			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(500, { "Content-Type": "text/plain" });
				res.end("Database connection failed");
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withResponseError({
				defaultMapper: async (res) => {
					const text = await res.text();
					return new ApiError(text);
				},
			})(fetch);

			// Act & Assert
			try {
				await qfetch(`${baseUrl}/test`, { signal: ctx.signal });
				ctx.assert.fail("should have thrown");
			} catch (error) {
				ctx.assert.ok(
					error instanceof ApiError &&
						error.details === "Database connection failed",
					"throws ApiError with body text",
				);
			}
		});
	});

	describe("throwOnStatusCode predicate controls throwing", () => {
		test("does not throw for 4xx when predicate only matches 5xx", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(404);
				res.end("Not found");
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withResponseError({
				throwOnStatusCode: (code) => code >= 500,
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/test`, { signal: ctx.signal });

			// Assert
			ctx.assert.strictEqual(
				response.status,
				404,
				"returns 404 response without throwing",
			);
		});

		test("throws for 5xx when predicate matches 5xx", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(500);
				res.end("Server error");
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withResponseError({
				throwOnStatusCode: (code) => code >= 500,
			})(fetch);

			// Act & Assert
			await ctx.assert.rejects(
				qfetch(`${baseUrl}/test`, { signal: ctx.signal }),
				(error: unknown) => error instanceof ResponseError,
				"throws ResponseError for 500",
			);
		});

		test("never throws when predicate always returns false", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(500);
				res.end("Server error");
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withResponseError({
				throwOnStatusCode: () => false,
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/test`, { signal: ctx.signal });

			// Assert
			ctx.assert.strictEqual(
				response.status,
				500,
				"returns error response without throwing",
			);
		});
	});

	describe("ResponseError preserves response for body reading", () => {
		test("response body can be read from thrown error", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(400, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						errors: ["field1 is required", "field2 is invalid"],
					}),
				);
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withResponseError()(fetch);

			// Act & Assert
			try {
				await qfetch(`${baseUrl}/test`, { signal: ctx.signal });
				ctx.assert.fail("should have thrown");
			} catch (error) {
				if (!(error instanceof ResponseError)) {
					ctx.assert.fail("expected ResponseError");
					return;
				}
				const body = await error.response.json();
				ctx.assert.deepStrictEqual(
					body,
					{ errors: ["field1 is required", "field2 is invalid"] },
					"can read response body from error",
				);
			}
		});
	});
});
