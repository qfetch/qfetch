import { describe, suite, type TestContext, test } from "node:test";

import { constant, upto } from "@proventuslabs/retry-strategies";
import { createTestServer } from "@qfetch/test-utils";

import { withAuthorization } from "./with-authorization.ts";

/* node:coverage disable */

suite("withAuthorization - Integration", { concurrency: true }, () => {
	describe("authorization header injection with real HTTP requests", () => {
		test("adds authorization header to successful requests", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			let receivedAuthHeader: string | undefined;
			const { baseUrl } = await createTestServer(ctx, (req, res) => {
				receivedAuthHeader = req.headers.authorization;
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ message: "Success!" }));
			});

			const tokenProvider = {
				getToken: async () => ({
					accessToken: "integration-test-token",
					tokenType: "Bearer",
				}),
			};

			const qfetch = withAuthorization({
				tokenProvider,
				strategy: () => upto(1, constant(0)),
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/api/data`, {
				signal: ctx.signal,
			});

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				receivedAuthHeader,
				"Bearer integration-test-token",
				"server receives authorization header",
			);
		});

		test("retries on 401 with fresh token from real server", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			let requestCount = 0;
			const receivedTokens: string[] = [];

			const { baseUrl } = await createTestServer(ctx, (req, res) => {
				requestCount++;
				receivedTokens.push(req.headers.authorization || "");

				if (requestCount === 1) {
					// First request returns 401
					res.writeHead(401, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Unauthorized" }));
					return;
				}

				// Second request succeeds
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ message: "Authenticated!" }));
			});

			let tokenCallCount = 0;
			const tokenProvider = {
				getToken: async () => {
					tokenCallCount++;
					return {
						accessToken: `token-${tokenCallCount}`,
						tokenType: "Bearer",
					};
				},
			};

			const qfetch = withAuthorization({
				tokenProvider,
				strategy: () => upto(1, constant(0)),
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/api/secure`, {
				signal: ctx.signal,
			});

			// Assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"returns successful status after retry",
			);
			ctx.assert.strictEqual(requestCount, 2, "server receives two requests");
			ctx.assert.deepStrictEqual(
				receivedTokens,
				["Bearer token-1", "Bearer token-2"],
				"server receives different tokens on each request",
			);
		});

		test("preserves existing authorization header", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			let receivedAuthHeader: string | undefined;
			const { baseUrl } = await createTestServer(ctx, (req, res) => {
				receivedAuthHeader = req.headers.authorization;
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ message: "Success!" }));
			});

			const tokenProvider = {
				getToken: async () => ({
					accessToken: "should-not-be-used",
					tokenType: "Bearer",
				}),
			};

			const qfetch = withAuthorization({
				tokenProvider,
				strategy: () => upto(1, constant(0)),
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/api/data`, {
				headers: { Authorization: "Bearer existing-token" },
				signal: ctx.signal,
			});

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				receivedAuthHeader,
				"Bearer existing-token",
				"server receives existing authorization header",
			);
		});

		test("returns 401 after retry limit exceeded", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			let requestCount = 0;

			const { baseUrl } = await createTestServer(ctx, (_req, res) => {
				requestCount++;
				res.writeHead(401, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "Unauthorized" }));
			});

			const tokenProvider = {
				getToken: async () => ({
					accessToken: "always-rejected-token",
					tokenType: "Bearer",
				}),
			};

			const qfetch = withAuthorization({
				tokenProvider,
				strategy: () => upto(2, constant(0)), // Allow 2 retries
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/api/secure`, {
				signal: ctx.signal,
			});

			// Assert
			ctx.assert.strictEqual(
				response.status,
				401,
				"returns 401 after retries exhausted",
			);
			ctx.assert.strictEqual(
				requestCount,
				3,
				"server receives initial request plus 2 retries",
			);
		});
	});

	describe("error handling with real HTTP requests", () => {
		test("propagates token provider errors", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const { baseUrl } = await createTestServer(ctx, (_req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ message: "Success!" }));
			});

			const providerError = new Error("Token refresh failed");
			const tokenProvider = {
				getToken: async () => {
					throw providerError;
				},
			};

			const qfetch = withAuthorization({
				tokenProvider,
				strategy: () => upto(1, constant(0)),
			})(fetch);

			// Act & Assert
			await ctx.assert.rejects(
				qfetch(`${baseUrl}/api/data`, { signal: ctx.signal }),
				(error: unknown) => error === providerError,
				"propagates token provider error",
			);
		});
	});
});
