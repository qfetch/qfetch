import { describe, suite, type TestContext, test } from "node:test";

import { ResponseError, withResponseError } from "./with-response-error.ts";

/* node:coverage disable */
suite("withResponseError - Unit", () => {
	describe("ResponseError class", () => {
		test("creates error with response metadata", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(6);
			const response = new Response("not found", {
				status: 404,
				statusText: "Not Found",
			});
			// Override url since Response constructor doesn't set it
			Object.defineProperty(response, "url", {
				value: "https://example.com/missing",
			});

			// Act
			const error = new ResponseError(response);

			// Assert
			ctx.assert.strictEqual(error.name, "ResponseError", "has correct name");
			ctx.assert.strictEqual(error.status, 404, "has status code");
			ctx.assert.strictEqual(error.statusText, "Not Found", "has status text");
			ctx.assert.strictEqual(
				error.url,
				"https://example.com/missing",
				"has url",
			);
			ctx.assert.strictEqual(error.response, response, "has response object");
			ctx.assert.strictEqual(
				error.message,
				"HTTP 404 Not Found: https://example.com/missing",
				"has formatted message",
			);
		});

		test("extends Error for proper inheritance", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const response = new Response(null, { status: 500 });

			// Act
			const error = new ResponseError(response);

			// Assert
			ctx.assert.ok(error instanceof Error, "is instance of Error");
			ctx.assert.ok(
				error instanceof ResponseError,
				"is instance of ResponseError",
			);
		});
	});

	describe("default throwing behavior", () => {
		test("throws ResponseError for status >= 400 with no options", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("not found", { status: 404 }),
			);
			const qfetch = withResponseError()(fetchMock);

			// Act & Assert
			await ctx.assert.rejects(
				qfetch("https://example.com"),
				(error: unknown) => error instanceof ResponseError,
				"throws ResponseError",
			);

			ctx.assert.strictEqual(fetchMock.mock.callCount(), 1, "calls fetch once");
		});

		test("throws for all 4xx status codes", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(5);
			const statusCodes = [400, 401, 403, 404, 422];

			for (const status of statusCodes) {
				await ctx.test(`status ${status}`, async (ctx: TestContext) => {
					// Arrange
					ctx.plan(1);
					const fetchMock = ctx.mock.fn(
						fetch,
						async () => new Response(null, { status }),
					);
					const qfetch = withResponseError()(fetchMock);

					// Act & Assert
					await ctx.assert.rejects(
						qfetch("https://example.com"),
						(error: unknown) =>
							error instanceof ResponseError && error.status === status,
						"throws ResponseError with correct status",
					);
				});
			}
		});

		test("throws for all 5xx status codes", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(4);
			const statusCodes = [500, 502, 503, 504];

			for (const status of statusCodes) {
				await ctx.test(`status ${status}`, async (ctx: TestContext) => {
					// Arrange
					ctx.plan(1);
					const fetchMock = ctx.mock.fn(
						fetch,
						async () => new Response(null, { status }),
					);
					const qfetch = withResponseError()(fetchMock);

					// Act & Assert
					await ctx.assert.rejects(
						qfetch("https://example.com"),
						(error: unknown) =>
							error instanceof ResponseError && error.status === status,
						"throws ResponseError with correct status",
					);
				});
			}
		});
	});

	describe("successful responses pass through unchanged", () => {
		test("returns response for 2xx status codes", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(5);
			const statusCodes = [200, 201, 204, 206, 299];

			for (const status of statusCodes) {
				await ctx.test(`status ${status}`, async (ctx: TestContext) => {
					// Arrange
					ctx.plan(1);
					const fetchMock = ctx.mock.fn(
						fetch,
						async () => new Response(null, { status }),
					);
					const qfetch = withResponseError()(fetchMock);

					// Act
					const response = await qfetch("https://example.com");

					// Assert
					ctx.assert.strictEqual(
						response.status,
						status,
						"returns response unchanged",
					);
				});
			}
		});

		test("returns response for 3xx redirect status codes", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			const statusCodes = [301, 302, 304];

			for (const status of statusCodes) {
				await ctx.test(`status ${status}`, async (ctx: TestContext) => {
					// Arrange
					ctx.plan(1);
					const fetchMock = ctx.mock.fn(
						fetch,
						async () => new Response(null, { status }),
					);
					const qfetch = withResponseError()(fetchMock);

					// Act
					const response = await qfetch("https://example.com");

					// Assert
					ctx.assert.strictEqual(
						response.status,
						status,
						"returns response unchanged",
					);
				});
			}
		});
	});

	describe("statusMap maps specific status codes to custom errors", () => {
		test("uses custom mapper for specific status code", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			class NotFoundError extends Error {
				constructor(url: string) {
					super(`Resource not found: ${url}`);
					this.name = "NotFoundError";
				}
			}

			const fetchMock = ctx.mock.fn(fetch, async () => {
				const response = new Response("not found", { status: 404 });
				Object.defineProperty(response, "url", {
					value: "https://example.com/missing",
				});
				return response;
			});

			const qfetch = withResponseError({
				statusMap: new Map([[404, (res) => new NotFoundError(res.url)]]),
			})(fetchMock);

			// Act & Assert
			await ctx.assert.rejects(
				qfetch("https://example.com/missing"),
				(error: unknown) =>
					error instanceof NotFoundError &&
					error.message === "Resource not found: https://example.com/missing",
				"throws custom NotFoundError",
			);
		});

		test("uses different mappers for different status codes", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			class NotFoundError extends Error {
				name = "NotFoundError";
			}
			class UnauthorizedError extends Error {
				name = "UnauthorizedError";
			}

			const statusMap = new Map([
				[404, () => new NotFoundError()],
				[401, () => new UnauthorizedError()],
			]);

			await ctx.test(
				"404 uses NotFoundError mapper",
				async (ctx: TestContext) => {
					// Arrange
					ctx.plan(1);
					const fetchMock = ctx.mock.fn(
						fetch,
						async () => new Response(null, { status: 404 }),
					);
					const qfetch = withResponseError({ statusMap })(fetchMock);

					// Act & Assert
					await ctx.assert.rejects(
						qfetch("https://example.com"),
						(error: unknown) => error instanceof NotFoundError,
						"throws NotFoundError for 404",
					);
				},
			);

			await ctx.test(
				"401 uses UnauthorizedError mapper",
				async (ctx: TestContext) => {
					// Arrange
					ctx.plan(1);
					const fetchMock = ctx.mock.fn(
						fetch,
						async () => new Response(null, { status: 401 }),
					);
					const qfetch = withResponseError({ statusMap })(fetchMock);

					// Act & Assert
					await ctx.assert.rejects(
						qfetch("https://example.com"),
						(error: unknown) => error instanceof UnauthorizedError,
						"throws UnauthorizedError for 401",
					);
				},
			);
		});

		test("falls back to defaultMapper for unmapped status codes", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			class NotFoundError extends Error {
				name = "NotFoundError";
			}

			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response(null, { status: 500 }),
			);

			const qfetch = withResponseError({
				statusMap: new Map([[404, () => new NotFoundError()]]),
			})(fetchMock);

			// Act & Assert
			await ctx.assert.rejects(
				qfetch("https://example.com"),
				(error: unknown) => error instanceof ResponseError,
				"throws ResponseError for unmapped status",
			);
		});
	});

	describe("defaultMapper customizes error for unmapped status codes", () => {
		test("uses custom default mapper for all error statuses", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			class ApiError extends Error {
				status: number;
				constructor(status: number) {
					super(`API error: ${status}`);
					this.name = "ApiError";
					this.status = status;
				}
			}

			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response(null, { status: 500 }),
			);

			const qfetch = withResponseError({
				defaultMapper: (res) => new ApiError(res.status),
			})(fetchMock);

			// Act & Assert
			await ctx.assert.rejects(
				qfetch("https://example.com"),
				(error: unknown) => error instanceof ApiError && error.status === 500,
				"throws custom ApiError",
			);
		});

		test("statusMap takes priority over defaultMapper", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			class NotFoundError extends Error {
				name = "NotFoundError";
			}
			class ApiError extends Error {
				name = "ApiError";
			}

			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response(null, { status: 404 }),
			);

			const qfetch = withResponseError({
				statusMap: new Map([[404, () => new NotFoundError()]]),
				defaultMapper: () => new ApiError(),
			})(fetchMock);

			// Act & Assert
			await ctx.assert.rejects(
				qfetch("https://example.com"),
				(error: unknown) => error instanceof NotFoundError,
				"throws NotFoundError from statusMap, not ApiError",
			);
		});
	});

	describe("throwOnStatusCode predicate controls throwing", () => {
		test("only throws when predicate returns true", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response(null, { status: 404 }),
			);

			// Only throw for 5xx errors
			const qfetch = withResponseError({
				throwOnStatusCode: (code) => code >= 500,
			})(fetchMock);

			// Act
			const response = await qfetch("https://example.com");

			// Assert
			ctx.assert.strictEqual(response.status, 404, "returns 404 response");
			ctx.assert.strictEqual(fetchMock.mock.callCount(), 1, "calls fetch once");
		});

		test("throws for 5xx when predicate only matches 5xx", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response(null, { status: 500 }),
			);

			const qfetch = withResponseError({
				throwOnStatusCode: (code) => code >= 500,
			})(fetchMock);

			// Act & Assert
			await ctx.assert.rejects(
				qfetch("https://example.com"),
				(error: unknown) => error instanceof ResponseError,
				"throws for 500",
			);
		});

		test("never throws when predicate always returns false", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response(null, { status: 500 }),
			);

			const qfetch = withResponseError({
				throwOnStatusCode: () => false,
			})(fetchMock);

			// Act
			const response = await qfetch("https://example.com");

			// Assert
			ctx.assert.strictEqual(
				response.status,
				500,
				"returns error response without throwing",
			);
		});
	});

	describe("async mappers can read response body", () => {
		test("async mapper can parse JSON body", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			class ApiError extends Error {
				code: string;
				constructor(code: string, message: string) {
					super(message);
					this.name = "ApiError";
					this.code = code;
				}
			}

			const fetchMock = ctx.mock.fn(
				fetch,
				async () =>
					new Response(
						JSON.stringify({ code: "NOT_FOUND", message: "User not found" }),
						{
							status: 404,
							headers: { "Content-Type": "application/json" },
						},
					),
			);

			const qfetch = withResponseError({
				statusMap: new Map([
					[
						404,
						async (res) => {
							const body = await res.json();
							return new ApiError(body.code, body.message);
						},
					],
				]),
			})(fetchMock);

			// Act & Assert
			await ctx.assert.rejects(
				qfetch("https://example.com"),
				(error: unknown) =>
					error instanceof ApiError &&
					error.code === "NOT_FOUND" &&
					error.message === "User not found",
				"throws ApiError with parsed body data",
			);
		});

		test("async defaultMapper can read body", async (ctx: TestContext) => {
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

			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("Something went wrong", { status: 500 }),
			);

			const qfetch = withResponseError({
				defaultMapper: async (res) => {
					const text = await res.text();
					return new ApiError(text);
				},
			})(fetchMock);

			// Act & Assert
			await ctx.assert.rejects(
				qfetch("https://example.com"),
				(error: unknown) =>
					error instanceof ApiError && error.details === "Something went wrong",
				"throws ApiError with body text",
			);
		});
	});
});
