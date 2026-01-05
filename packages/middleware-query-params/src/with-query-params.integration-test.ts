import { describe, suite, type TestContext, test } from "node:test";

import { createTestServer, type RequestHandler } from "@qfetch/test-utils";

import { withQueryParam, withQueryParams } from "./with-query-params.ts";

/* node:coverage disable */

suite("withQueryParam - Integration", { concurrency: true }, () => {
	describe("query params are received by server", () => {
		test("adds single param to request URL", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ url: req.url }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withQueryParam("page", "1")(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/users`, { signal: ctx.signal });
			const data = (await response.json()) as { url: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.url,
				"/users?page=1",
				"server receives query param",
			);
		});

		test("merges with existing query params (request takes precedence)", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ url: req.url }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withQueryParam("limit", "10")(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/users?page=1`, {
				signal: ctx.signal,
			});
			const data = (await response.json()) as { url: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.url,
				"/users?limit=10&page=1",
				"middleware param first, request param after",
			);
		});

		test("encodes special characters properly", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				const url = new URL(req.url || "/", "http://localhost");
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ q: url.searchParams.get("q") }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withQueryParam("q", "hello world")(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/search`, {
				signal: ctx.signal,
			});
			const data = (await response.json()) as { q: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.q,
				"hello world",
				"server receives decoded value",
			);
		});
	});

	describe("HTTP methods work correctly", () => {
		test("works with POST requests", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ method: req.method, url: req.url }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withQueryParam("token", "abc123")(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/api/data`, {
				method: "POST",
				signal: ctx.signal,
			});
			const data = (await response.json()) as { method: string; url: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(data.method, "POST", "uses POST method");
			ctx.assert.strictEqual(
				data.url,
				"/api/data?token=abc123",
				"query param added to POST URL",
			);
		});
	});

	describe("array values are handled correctly", () => {
		test("sends repeated keys for array values (default)", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				const url = new URL(req.url || "/", "http://localhost");
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ tags: url.searchParams.getAll("tags") }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withQueryParam("tags", ["foo", "bar"])(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/posts`, { signal: ctx.signal });
			const data = (await response.json()) as { tags: string[] };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.deepStrictEqual(
				data.tags,
				["foo", "bar"],
				"server receives array as repeated keys",
			);
		});

		test("sends bracket notation for array values", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				const url = new URL(req.url || "/", "http://localhost");
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ tags: url.searchParams.getAll("tags[]") }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withQueryParam("tags", ["foo", "bar"], {
				arrayFormat: "brackets",
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/posts`, { signal: ctx.signal });
			const data = (await response.json()) as { tags: string[] };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.deepStrictEqual(
				data.tags,
				["foo", "bar"],
				"server receives array with bracket notation",
			);
		});

		test("skips empty arrays", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ url: req.url }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withQueryParam("tags", [])(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/posts`, { signal: ctx.signal });
			const data = (await response.json()) as { url: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.url,
				"/posts",
				"empty array not included in URL",
			);
		});
	});
});

suite("withQueryParams - Integration", { concurrency: true }, () => {
	describe("multiple params are received by server", () => {
		test("adds multiple params to request URL", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ url: req.url }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withQueryParams({ page: "1", limit: "10" })(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/users`, { signal: ctx.signal });
			const data = (await response.json()) as { url: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.url,
				"/users?page=1&limit=10",
				"server receives multiple params",
			);
		});

		test("passes through unchanged with empty params", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ url: req.url }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withQueryParams({})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/users`, { signal: ctx.signal });
			const data = (await response.json()) as { url: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.url,
				"/users",
				"URL unchanged with empty params",
			);
		});
	});

	describe("array values are handled correctly", () => {
		test("sends repeated keys for array values (default)", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				const url = new URL(req.url || "/", "http://localhost");
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ tags: url.searchParams.getAll("tags") }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withQueryParams({
				tags: ["typescript", "javascript"],
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/posts`, { signal: ctx.signal });
			const data = (await response.json()) as { tags: string[] };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.deepStrictEqual(
				data.tags,
				["typescript", "javascript"],
				"server receives array as repeated keys",
			);
		});

		test("sends bracket notation for array values", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				const url = new URL(req.url || "/", "http://localhost");
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ tags: url.searchParams.getAll("tags[]") }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withQueryParams(
				{ tags: ["typescript", "javascript"] },
				{ arrayFormat: "brackets" },
			)(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/posts`, { signal: ctx.signal });
			const data = (await response.json()) as { tags: string[] };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.deepStrictEqual(
				data.tags,
				["typescript", "javascript"],
				"server receives array with bracket notation",
			);
		});

		test("skips empty arrays", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ url: req.url }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withQueryParams({
				tags: [],
				page: "1",
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/posts`, { signal: ctx.signal });
			const data = (await response.json()) as { url: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.url,
				"/posts?page=1",
				"empty array not included in URL",
			);
		});
	});

	describe("Request input type handling", () => {
		test("works with Request objects", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						method: req.method,
						url: req.url,
						auth: req.headers.authorization,
					}),
				);
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withQueryParams({ page: "1" })(fetch);

			// Act
			const request = new Request(`${baseUrl}/users`, {
				method: "POST",
				headers: { Authorization: "Bearer token" },
				signal: ctx.signal,
			});
			const response = await qfetch(request);
			const data = (await response.json()) as {
				method: string;
				url: string;
				auth: string;
			};

			// Assert
			ctx.assert.strictEqual(data.method, "POST", "method preserved");
			ctx.assert.strictEqual(
				data.url,
				"/users?page=1",
				"query param added to Request URL",
			);
			ctx.assert.strictEqual(data.auth, "Bearer token", "headers preserved");
		});
	});

	describe("URL input type handling", () => {
		test("works with URL objects", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ url: req.url }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withQueryParams({ page: "1" })(fetch);

			// Act
			const response = await qfetch(new URL(`${baseUrl}/users`), {
				signal: ctx.signal,
			});
			const data = (await response.json()) as { url: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.url,
				"/users?page=1",
				"query param added to URL object",
			);
		});
	});

	describe("signal handling", () => {
		test("propagates abort signal to underlying fetch", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ success: true }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withQueryParams({ page: "1" })(fetch);
			const controller = new AbortController();

			// Act
			const promise = qfetch(`${baseUrl}/users`, { signal: controller.signal });
			controller.abort();

			// Assert
			await ctx.assert.rejects(
				() => promise,
				(e: unknown) => e instanceof DOMException && e.name === "AbortError",
				"propagates abort to underlying fetch",
			);
		});
	});
});
