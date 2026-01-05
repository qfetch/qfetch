import { describe, suite, type TestContext, test } from "node:test";

import { createStrategyMock, flushMicrotasks } from "@qfetch/test-utils";

import {
	type AuthorizationToken,
	CANCEL_REASON,
	type TokenProvider,
	withAuthorization,
} from "./with-authorization.ts";

/* node:coverage disable */

/**
 * Creates a mock token provider for testing.
 * Returns both the provider and a reference to the mock function for assertions.
 */
const createTokenProviderMock = (
	ctx: TestContext,
	tokens: AuthorizationToken[],
): { provider: TokenProvider; mock: ReturnType<typeof ctx.mock.fn> } => {
	let callCount = 0;
	const mockFn = ctx.mock.fn(async () => {
		const token = tokens.at(callCount++);
		if (!token) {
			return tokens.at(-1) as AuthorizationToken;
		}
		return token;
	});
	return {
		provider: { getToken: mockFn },
		mock: mockFn,
	};
};

suite("withAuthorization - Unit", () => {
	describe("authorization header is correctly injected into requests", () => {
		test("adds Authorization header with Bearer token type", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (_input, init) => {
				const headers = new Headers(init?.headers);
				return new Response(headers.get("Authorization"));
			});
			const { provider: tokenProvider } = createTokenProviderMock(ctx, [
				{ accessToken: "test-token", tokenType: "Bearer" },
			]);
			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, []),
			})(fetchMock);

			// Act
			const response = await qfetch("https://example.com");
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"calls fetch exactly once",
			);
			ctx.assert.strictEqual(
				body,
				"Bearer test-token",
				"sets correct Authorization header",
			);
		});

		test("adds Authorization header with Basic token type", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async (_input, init) => {
				const headers = new Headers(init?.headers);
				return new Response(headers.get("Authorization"));
			});
			const { provider: tokenProvider } = createTokenProviderMock(ctx, [
				{ accessToken: "dXNlcjpwYXNz", tokenType: "Basic" },
			]);
			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, []),
			})(fetchMock);

			// Act
			const response = await qfetch("https://example.com");
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				body,
				"Basic dXNlcjpwYXNz",
				"sets correct Basic Authorization header",
			);
		});

		test("adds Authorization header with custom token type", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async (_input, init) => {
				const headers = new Headers(init?.headers);
				return new Response(headers.get("Authorization"));
			});
			const { provider: tokenProvider } = createTokenProviderMock(ctx, [
				{ accessToken: "my-api-key", tokenType: "Token" },
			]);
			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, []),
			})(fetchMock);

			// Act
			const response = await qfetch("https://example.com");
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				body,
				"Token my-api-key",
				"sets correct custom Authorization header",
			);
		});
	});

	describe("existing Authorization headers are preserved", () => {
		test("does not override Authorization header from init options", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (_input, init) => {
				const headers = new Headers(init?.headers);
				return new Response(headers.get("Authorization"));
			});
			const { provider: tokenProvider, mock: tokenProviderMock } =
				createTokenProviderMock(ctx, [
					{ accessToken: "new-token", tokenType: "Bearer" },
				]);
			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, []),
			})(fetchMock);

			// Act
			const response = await qfetch("https://example.com", {
				headers: { Authorization: "Bearer existing-token" },
			});
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				body,
				"Bearer existing-token",
				"preserves existing Authorization header",
			);
			ctx.assert.strictEqual(
				tokenProviderMock.mock.callCount(),
				0,
				"does not call token provider when header exists",
			);
		});

		test("does not override Authorization header from Request object", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input, init) => {
				// When Request is passed through unchanged, headers are on the Request object
				const headers =
					input instanceof Request ? input.headers : new Headers(init?.headers);
				return new Response(headers.get("Authorization"));
			});
			const { provider: tokenProvider, mock: tokenProviderMock } =
				createTokenProviderMock(ctx, [
					{ accessToken: "new-token", tokenType: "Bearer" },
				]);
			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, []),
			})(fetchMock);
			const request = new Request("https://example.com", {
				headers: { Authorization: "Bearer request-token" },
			});

			// Act
			const response = await qfetch(request);
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				body,
				"Bearer request-token",
				"preserves Authorization header from Request",
			);
			ctx.assert.strictEqual(
				tokenProviderMock.mock.callCount(),
				0,
				"does not call token provider when Request has header",
			);
		});

		test("does not override Authorization header from Headers object", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async (_input, init) => {
				const headers = new Headers(init?.headers);
				return new Response(headers.get("Authorization"));
			});
			const { provider: tokenProvider } = createTokenProviderMock(ctx, [
				{ accessToken: "new-token", tokenType: "Bearer" },
			]);
			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, []),
			})(fetchMock);
			const headers = new Headers();
			headers.set("Authorization", "Bearer headers-token");

			// Act
			const response = await qfetch("https://example.com", { headers });
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				body,
				"Bearer headers-token",
				"preserves Authorization header from Headers object",
			);
		});
	});

	describe("request properties are preserved during header injection", () => {
		test("preserves other headers when adding Authorization", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (_input, init) => {
				const headers = new Headers(init?.headers);
				return new Response(
					JSON.stringify({
						auth: headers.get("Authorization"),
						contentType: headers.get("Content-Type"),
					}),
				);
			});
			const { provider: tokenProvider } = createTokenProviderMock(ctx, [
				{ accessToken: "test-token", tokenType: "Bearer" },
			]);
			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, []),
			})(fetchMock);

			// Act
			const response = await qfetch("https://example.com", {
				headers: { "Content-Type": "application/json" },
			});
			const body = await response.json();

			// Assert
			ctx.assert.strictEqual(
				body.auth,
				"Bearer test-token",
				"adds Authorization header",
			);
			ctx.assert.strictEqual(
				body.contentType,
				"application/json",
				"preserves Content-Type header",
			);
		});

		test("preserves headers from Request object when adding Authorization", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (_input, init) => {
				const headers = new Headers(init?.headers);
				return new Response(
					JSON.stringify({
						auth: headers.get("Authorization"),
						custom: headers.get("X-Custom-Header"),
					}),
				);
			});
			const { provider: tokenProvider } = createTokenProviderMock(ctx, [
				{ accessToken: "test-token", tokenType: "Bearer" },
			]);
			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, []),
			})(fetchMock);
			const request = new Request("https://example.com", {
				headers: { "X-Custom-Header": "custom-value" },
			});

			// Act
			const response = await qfetch(request);
			const body = await response.json();

			// Assert
			ctx.assert.strictEqual(
				body.auth,
				"Bearer test-token",
				"adds Authorization header",
			);
			ctx.assert.strictEqual(
				body.custom,
				"custom-value",
				"preserves custom header from Request",
			);
		});

		test("init headers take precedence over Request headers for same key", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async (_input, init) => {
				const headers = new Headers(init?.headers);
				return new Response(headers.get("X-Custom-Header"));
			});
			const { provider: tokenProvider } = createTokenProviderMock(ctx, [
				{ accessToken: "test-token", tokenType: "Bearer" },
			]);
			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, []),
			})(fetchMock);
			const request = new Request("https://example.com", {
				headers: { "X-Custom-Header": "request-value" },
			});

			// Act
			const response = await qfetch(request, {
				headers: { "X-Custom-Header": "init-value" },
			});
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				body,
				"init-value",
				"init headers take precedence over Request headers",
			);
		});

		test("works with string URLs", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const { provider: tokenProvider } = createTokenProviderMock(ctx, [
				{ accessToken: "test-token", tokenType: "Bearer" },
			]);
			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, []),
			})(fetchMock);

			// Act
			await qfetch("https://example.com/api/data");

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"successfully makes request with string URL",
			);
		});

		test("works with URL objects", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const { provider: tokenProvider } = createTokenProviderMock(ctx, [
				{ accessToken: "test-token", tokenType: "Bearer" },
			]);
			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, []),
			})(fetchMock);

			// Act
			await qfetch(new URL("https://example.com/api/data"));

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"successfully makes request with URL object",
			);
		});

		test("works with Request objects", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const { provider: tokenProvider } = createTokenProviderMock(ctx, [
				{ accessToken: "test-token", tokenType: "Bearer" },
			]);
			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, []),
			})(fetchMock);

			// Act
			await qfetch(new Request("https://example.com/api/data"));

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"successfully makes request with Request object",
			);
		});
	});

	describe("token provider validation ensures correct token format", () => {
		test("throws TypeError when token is missing accessToken", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const tokenProvider = {
				getToken: async () => ({ tokenType: "Bearer" }) as AuthorizationToken,
			};
			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, []),
			})(fetchMock);

			// Act & Assert
			await ctx.assert.rejects(
				qfetch("https://example.com"),
				TypeError,
				"throws TypeError for missing accessToken",
			);
		});

		test("throws TypeError when token is missing tokenType", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const tokenProvider = {
				getToken: async () => ({ accessToken: "token" }) as AuthorizationToken,
			};
			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, []),
			})(fetchMock);

			// Act & Assert
			await ctx.assert.rejects(
				qfetch("https://example.com"),
				TypeError,
				"throws TypeError for missing tokenType",
			);
		});

		test("throws TypeError when token is null", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const tokenProvider = {
				getToken: async () => null as unknown as AuthorizationToken,
			};
			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, []),
			})(fetchMock);

			// Act & Assert
			await ctx.assert.rejects(
				qfetch("https://example.com"),
				TypeError,
				"throws TypeError for null token",
			);
		});

		test("throws TypeError when accessToken is not a string", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const tokenProvider = {
				getToken: async () =>
					({
						accessToken: 123,
						tokenType: "Bearer",
					}) as unknown as AuthorizationToken,
			};
			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, []),
			})(fetchMock);

			// Act & Assert
			await ctx.assert.rejects(
				qfetch("https://example.com"),
				TypeError,
				"throws TypeError for non-string accessToken",
			);
		});

		test("propagates errors from token provider", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const providerError = new Error("Token refresh failed");
			const tokenProvider = {
				getToken: async () => {
					throw providerError;
				},
			};
			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, []),
			})(fetchMock);

			// Act & Assert
			await ctx.assert.rejects(
				qfetch("https://example.com"),
				(error: unknown) => error === providerError,
				"propagates token provider error",
			);
		});
	});

	describe("401 responses trigger automatic retry with fresh token", () => {
		test("retries once on 401 and succeeds with new token", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			fetchMock.mock.mockImplementationOnce(
				async () => new Response("unauthorized", { status: 401 }),
			);
			const { provider: tokenProvider, mock: tokenProviderMock } =
				createTokenProviderMock(ctx, [
					{ accessToken: "expired-token", tokenType: "Bearer" },
					{ accessToken: "fresh-token", tokenType: "Bearer" },
				]);
			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, [0]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(0);
			const response = await responsePromise;

			// Assert
			ctx.assert.strictEqual(fetchMock.mock.callCount(), 2, "retries once");
			ctx.assert.strictEqual(
				tokenProviderMock.mock.callCount(),
				2,
				"requests fresh token on retry",
			);
			ctx.assert.strictEqual(
				response.status,
				200,
				"returns successful response",
			);
		});

		test("performs multiple retries until success", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			let callCount = 0;
			const fetchMock = ctx.mock.fn(fetch, async () => {
				callCount++;
				if (callCount <= 2) {
					return new Response("unauthorized", { status: 401 });
				}
				return new Response("ok", { status: 200 });
			});

			const { provider: tokenProvider } = createTokenProviderMock(ctx, [
				{ accessToken: "token-1", tokenType: "Bearer" },
				{ accessToken: "token-2", tokenType: "Bearer" },
				{ accessToken: "token-3", tokenType: "Bearer" },
			]);

			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, [100, 200]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(100);
			await flushMicrotasks();
			ctx.mock.timers.tick(200);
			const response = await responsePromise;

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				3,
				"retries twice before success",
			);
			ctx.assert.strictEqual(
				response.status,
				200,
				"returns successful response",
			);
		});

		test("returns 401 response when strategy exhausts attempts", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("still unauthorized", { status: 401 }),
			);
			const { provider: tokenProvider } = createTokenProviderMock(ctx, [
				{ accessToken: "token-1", tokenType: "Bearer" },
				{ accessToken: "token-2", tokenType: "Bearer" },
			]);
			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, [100, Number.NaN]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(100);
			const response = await responsePromise;
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				2,
				"makes initial request plus one retry",
			);
			ctx.assert.strictEqual(response.status, 401, "returns 401 response");
			ctx.assert.strictEqual(
				body,
				"still unauthorized",
				"returns final response body",
			);
		});

		test("does not retry when strategy signals exhaustion immediately", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("unauthorized", { status: 401 }),
			);
			const { provider: tokenProvider } = createTokenProviderMock(ctx, [
				{ accessToken: "token", tokenType: "Bearer" },
			]);
			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, [Number.NaN]),
			})(fetchMock);

			// Act
			const response = await qfetch("https://example.com");

			// Assert
			ctx.assert.strictEqual(fetchMock.mock.callCount(), 1, "does not retry");
			ctx.assert.strictEqual(response.status, 401, "returns 401 response");
		});
	});

	describe("non-401 responses are not retried", () => {
		test("does not retry on successful responses", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			const { provider: tokenProvider } = createTokenProviderMock(ctx, [
				{ accessToken: "token", tokenType: "Bearer" },
			]);
			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, [100]),
			})(fetchMock);

			// Act
			await qfetch("https://example.com");

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"does not retry on success",
			);
		});

		test("does not retry on 2xx status codes", async (ctx: TestContext) => {
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
					const { provider: tokenProvider } = createTokenProviderMock(ctx, [
						{ accessToken: "token", tokenType: "Bearer" },
					]);
					const qfetch = withAuthorization({
						tokenProvider,
						strategy: createStrategyMock(ctx, [100]),
					})(fetchMock);

					// Act
					await qfetch("https://example.com");

					// Assert
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						1,
						"does not retry",
					);
				});
			}
		});

		test("does not retry on other 4xx status codes", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(5);
			const statusCodes = [400, 403, 404, 422, 429];

			for (const status of statusCodes) {
				await ctx.test(`status ${status}`, async (ctx: TestContext) => {
					// Arrange
					ctx.plan(1);
					const fetchMock = ctx.mock.fn(
						fetch,
						async () => new Response(null, { status }),
					);
					const { provider: tokenProvider } = createTokenProviderMock(ctx, [
						{ accessToken: "token", tokenType: "Bearer" },
					]);
					const qfetch = withAuthorization({
						tokenProvider,
						strategy: createStrategyMock(ctx, [100]),
					})(fetchMock);

					// Act
					await qfetch("https://example.com");

					// Assert
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						1,
						"does not retry",
					);
				});
			}
		});

		test("does not retry on 5xx status codes", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(5);
			const statusCodes = [500, 501, 502, 503, 504];

			for (const status of statusCodes) {
				await ctx.test(`status ${status}`, async (ctx: TestContext) => {
					// Arrange
					ctx.plan(1);
					const fetchMock = ctx.mock.fn(
						fetch,
						async () => new Response(null, { status }),
					);
					const { provider: tokenProvider } = createTokenProviderMock(ctx, [
						{ accessToken: "token", tokenType: "Bearer" },
					]);
					const qfetch = withAuthorization({
						tokenProvider,
						strategy: createStrategyMock(ctx, [100]),
					})(fetchMock);

					// Act
					await qfetch("https://example.com");

					// Assert
					ctx.assert.strictEqual(
						fetchMock.mock.callCount(),
						1,
						"does not retry",
					);
				});
			}
		});
	});

	describe("backoff strategy controls retry attempts and delays", () => {
		test("uses fresh strategy state for each top-level request", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			const strategyFactory = ctx.mock.fn(createStrategyMock(ctx, [0]));

			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			const { provider: tokenProvider } = createTokenProviderMock(ctx, [
				{ accessToken: "token", tokenType: "Bearer" },
			]);

			const qfetch = withAuthorization({
				tokenProvider,
				strategy: strategyFactory,
			})(fetchMock);

			// Act - first request
			const promise1 = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(0);
			await promise1;

			// Act - second request
			const promise2 = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(0);
			await promise2;

			// Assert
			ctx.assert.strictEqual(
				strategyFactory.mock.callCount(),
				2,
				"creates strategy once per request",
			);
		});

		test("waits for strategy-specified delay between retries", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			fetchMock.mock.mockImplementationOnce(
				async () => new Response(null, { status: 401 }),
			);
			const { provider: tokenProvider } = createTokenProviderMock(ctx, [
				{ accessToken: "token-1", tokenType: "Bearer" },
				{ accessToken: "token-2", tokenType: "Bearer" },
			]);
			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, [5000]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();

			// Assert - not yet retried
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"initial request completed",
			);

			// Act - advance time but not enough
			ctx.mock.timers.tick(4999);
			await flushMicrotasks();

			// Assert - still not retried
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"waits for full delay before retry",
			);

			// Act - complete the delay
			ctx.mock.timers.tick(1);
			await responsePromise;
		});

		test("uses different delays for each retry attempt", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response(null, { status: 401 }),
			);
			const { provider: tokenProvider } = createTokenProviderMock(ctx, [
				{ accessToken: "token-1", tokenType: "Bearer" },
				{ accessToken: "token-2", tokenType: "Bearer" },
				{ accessToken: "token-3", tokenType: "Bearer" },
				{ accessToken: "token-4", tokenType: "Bearer" },
			]);
			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, [1000, 2000, 3000, Number.NaN]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(1000); // First retry after 1s
			await flushMicrotasks();
			ctx.mock.timers.tick(2000); // Second retry after 2s
			await flushMicrotasks();
			ctx.mock.timers.tick(3000); // Third retry after 3s
			await responsePromise;

			// Assert
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				4,
				"completes all retries with different delays",
			);
		});
	});

	describe("request state is correctly managed during retry", () => {
		test("cancels the response body before retrying the request", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			const testStream = new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode("unauthorized"));
					controller.close();
				},
			});
			const cancelMock = ctx.mock.method(testStream, "cancel", async () => {});

			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			fetchMock.mock.mockImplementationOnce(
				async () => new Response(testStream, { status: 401 }),
			);

			const { provider: tokenProvider } = createTokenProviderMock(ctx, [
				{ accessToken: "token-1", tokenType: "Bearer" },
				{ accessToken: "token-2", tokenType: "Bearer" },
			]);

			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, [0]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(0);
			await responsePromise;

			// Assert
			ctx.assert.strictEqual(
				cancelMock.mock.callCount(),
				1,
				"calls cancel on response body",
			);
			ctx.assert.deepStrictEqual(
				cancelMock.mock.calls[0]?.arguments,
				[CANCEL_REASON],
				"passes CANCEL_REASON to cancel",
			);
		});

		test("continues retry when body cancellation fails", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			const testStream = new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode("unauthorized"));
					controller.close();
				},
			});
			const cancelMock = ctx.mock.method(testStream, "cancel", async () => {
				throw new Error("Cancel failed");
			});

			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			fetchMock.mock.mockImplementationOnce(
				async () => new Response(testStream, { status: 401 }),
			);

			const { provider: tokenProvider } = createTokenProviderMock(ctx, [
				{ accessToken: "token-1", tokenType: "Bearer" },
				{ accessToken: "token-2", tokenType: "Bearer" },
			]);

			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, [0]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(0);
			const response = await responsePromise;

			// Assert
			ctx.assert.strictEqual(
				cancelMock.mock.callCount(),
				1,
				"attempts to cancel response body",
			);
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				2,
				"continues with retry despite cancel error",
			);
			ctx.assert.strictEqual(
				response.status,
				200,
				"returns successful response",
			);
		});

		test("handles null response body gracefully without cancellation", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });
			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			fetchMock.mock.mockImplementationOnce(
				async () => new Response(null, { status: 401 }),
			);
			const { provider: tokenProvider } = createTokenProviderMock(ctx, [
				{ accessToken: "token-1", tokenType: "Bearer" },
				{ accessToken: "token-2", tokenType: "Bearer" },
			]);
			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, [0]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com");
			await flushMicrotasks();
			ctx.mock.timers.tick(0);
			const response = await responsePromise;

			// Assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"handles null body without error",
			);
		});

		test("respects abort signal and aborts the fetch request", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			fetchMock.mock.mockImplementationOnce(
				async () => new Response(null, { status: 401 }),
			);
			const { provider: tokenProvider } = createTokenProviderMock(ctx, [
				{ accessToken: "token-1", tokenType: "Bearer" },
				{ accessToken: "token-2", tokenType: "Bearer" },
			]);
			const controller = new AbortController();

			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, [5000]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch("https://example.com", {
				signal: controller.signal,
			});
			await flushMicrotasks();

			// Assert - initial call completed
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"completes initial request",
			);

			// Act - abort during wait
			controller.abort();
			ctx.mock.timers.tick(5000);

			// Assert - throws abort error
			await ctx.assert.rejects(
				responsePromise,
				(error: unknown) => {
					return error instanceof Error && error.name === "AbortError";
				},
				"throws abort error when signal is aborted",
			);
		});

		test("respects abort signal from Request object", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			const fetchMock = ctx.mock.fn(
				fetch,
				async () => new Response("ok", { status: 200 }),
			);
			fetchMock.mock.mockImplementationOnce(
				async () => new Response(null, { status: 401 }),
			);
			const { provider: tokenProvider } = createTokenProviderMock(ctx, [
				{ accessToken: "token-1", tokenType: "Bearer" },
				{ accessToken: "token-2", tokenType: "Bearer" },
			]);
			const controller = new AbortController();
			const request = new Request("https://example.com", {
				signal: controller.signal,
			});

			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, [5000]),
			})(fetchMock);

			// Act
			const responsePromise = qfetch(request);
			await flushMicrotasks();

			// Assert - initial call completed
			ctx.assert.strictEqual(
				fetchMock.mock.callCount(),
				1,
				"completes initial request",
			);

			// Act - abort during wait
			controller.abort();
			ctx.mock.timers.tick(5000);

			// Assert
			await ctx.assert.rejects(
				responsePromise,
				(error: unknown) =>
					error instanceof Error && error.name === "AbortError",
				"extracts and respects signal from Request object",
			);
		});
	});

	describe("token refresh on 401 retry always fetches new token", () => {
		test("gets fresh token on retry even when initial request had existing auth header", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			ctx.mock.timers.enable({ apis: ["setTimeout"] });

			let callCount = 0;
			const fetchMock = ctx.mock.fn(fetch, async (_input, init) => {
				callCount++;
				const headers = new Headers(init?.headers);
				if (callCount === 1) {
					// First call uses existing header, returns 401
					return new Response("unauthorized", { status: 401 });
				}
				// Retry gets fresh token
				return new Response(headers.get("Authorization"), { status: 200 });
			});

			const { provider: tokenProvider, mock: tokenProviderMock } =
				createTokenProviderMock(ctx, [
					{ accessToken: "fresh-token", tokenType: "Bearer" },
				]);

			const qfetch = withAuthorization({
				tokenProvider,
				strategy: createStrategyMock(ctx, [0]),
			})(fetchMock);

			// Act - make request with existing auth header
			const responsePromise = qfetch("https://example.com", {
				headers: { Authorization: "Bearer existing-token" },
			});
			await flushMicrotasks();
			ctx.mock.timers.tick(0);
			const response = await responsePromise;
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(fetchMock.mock.callCount(), 2, "retries once");
			ctx.assert.strictEqual(
				tokenProviderMock.mock.callCount(),
				1,
				"gets fresh token on retry",
			);
			ctx.assert.strictEqual(
				body,
				"Bearer fresh-token",
				"retry uses fresh token from provider",
			);
		});
	});
});
