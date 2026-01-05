import { describe, suite, type TestContext, test } from "node:test";

import { createTestServer, type RequestHandler } from "@qfetch/test-utils";

import { withCookie, withCookies } from "./with-cookies.ts";

/* node:coverage disable */

suite("withCookie - Integration", { concurrency: true }, () => {
	describe("sends cookie header to server", () => {
		test("sends single cookie with string URL", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ cookie: req.headers.cookie }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withCookie("session", "abc123")(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/api/data`, {
				signal: ctx.signal,
			});
			const data = (await response.json()) as { cookie: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.cookie,
				"session=abc123",
				"server receives cookie header",
			);
		});

		test("sends single cookie with URL object", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ cookie: req.headers.cookie }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withCookie("token", "xyz789")(fetch);

			// Act
			const response = await qfetch(new URL(`${baseUrl}/api/data`), {
				signal: ctx.signal,
			});
			const data = (await response.json()) as { cookie: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.cookie,
				"token=xyz789",
				"server receives cookie header",
			);
		});

		test("sends single cookie with Request object", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ cookie: req.headers.cookie }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withCookie("auth", "secret")(fetch);

			// Act
			const request = new Request(`${baseUrl}/api/data`, {
				signal: ctx.signal,
			});
			const response = await qfetch(request);
			const data = (await response.json()) as { cookie: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.cookie,
				"auth=secret",
				"server receives cookie header",
			);
		});
	});

	describe("merges with existing cookies", () => {
		test("appends to existing cookie header from init", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ cookie: req.headers.cookie }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withCookie("session", "abc123")(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/api/data`, {
				headers: { Cookie: "existing=value" },
				signal: ctx.signal,
			});
			const data = (await response.json()) as { cookie: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.cookie,
				"existing=value; session=abc123",
				"server receives merged cookies",
			);
		});

		test("appends to existing cookie header from Request object", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ cookie: req.headers.cookie }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withCookie("session", "abc123")(fetch);

			// Act
			const request = new Request(`${baseUrl}/api/data`, {
				headers: { Cookie: "existing=value" },
				signal: ctx.signal,
			});
			const response = await qfetch(request);
			const data = (await response.json()) as { cookie: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.cookie,
				"existing=value; session=abc123",
				"server receives merged cookies",
			);
		});
	});

	describe("HTTP methods", () => {
		test("sends cookie with POST request", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({ method: req.method, cookie: req.headers.cookie }),
				);
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withCookie("csrf", "token123")(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/api/data`, {
				method: "POST",
				signal: ctx.signal,
			});
			const data = (await response.json()) as {
				method: string;
				cookie: string;
			};

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(data.method, "POST", "uses POST method");
			ctx.assert.strictEqual(
				data.cookie,
				"csrf=token123",
				"server receives cookie header",
			);
		});

		test("sends cookie with PUT request and body", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				let body = "";
				req.on("data", (chunk) => {
					body += chunk.toString();
				});
				req.on("end", () => {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(
						JSON.stringify({
							method: req.method,
							cookie: req.headers.cookie,
							body: JSON.parse(body),
						}),
					);
				});
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withCookie("session", "abc123")(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/api/users/1`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "Updated" }),
				signal: ctx.signal,
			});
			const data = (await response.json()) as {
				method: string;
				cookie: string;
				body: { name: string };
			};

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.cookie,
				"session=abc123",
				"server receives cookie header",
			);
			ctx.assert.deepStrictEqual(
				data.body,
				{ name: "Updated" },
				"body is preserved",
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
			const qfetch = withCookie("session", "abc123")(fetch);
			const controller = new AbortController();

			// Act
			const promise = qfetch(`${baseUrl}/api/data`, {
				signal: controller.signal,
			});
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

suite("withCookies - Integration", { concurrency: true }, () => {
	describe("sends multiple cookies to server", () => {
		test("sends multiple cookies with string URL", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ cookie: req.headers.cookie }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withCookies({
				session: "abc123",
				theme: "dark",
				lang: "en-US",
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/api/data`, {
				signal: ctx.signal,
			});
			const data = (await response.json()) as { cookie: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.cookie,
				"session=abc123; theme=dark; lang=en-US",
				"server receives all cookies",
			);
		});

		test("sends multiple cookies with Request object", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ cookie: req.headers.cookie }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withCookies({ session: "abc123", theme: "dark" })(fetch);

			// Act
			const request = new Request(`${baseUrl}/api/data`, {
				signal: ctx.signal,
			});
			const response = await qfetch(request);
			const data = (await response.json()) as { cookie: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.cookie,
				"session=abc123; theme=dark",
				"server receives all cookies",
			);
		});
	});

	describe("merges with existing cookies", () => {
		test("appends multiple cookies to existing header", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ cookie: req.headers.cookie }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withCookies({ session: "abc123", theme: "dark" })(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/api/data`, {
				headers: { Cookie: "existing=value" },
				signal: ctx.signal,
			});
			const data = (await response.json()) as { cookie: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.cookie,
				"existing=value; session=abc123; theme=dark",
				"server receives merged cookies",
			);
		});
	});

	describe("handles edge cases", () => {
		test("throws when passed empty cookies object", (ctx: TestContext) => {
			// Arrange & Act & Assert
			ctx.plan(1);
			ctx.assert.throws(
				() => withCookies({}),
				TypeError,
				"throws TypeError for empty cookies object",
			);
		});

		test("handles cookies with special characters", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ cookie: req.headers.cookie }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withCookies({
				data: "hello%20world",
				path: "/api/v1",
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/api/data`, {
				signal: ctx.signal,
			});
			const data = (await response.json()) as { cookie: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.cookie,
				"data=hello%20world; path=/api/v1",
				"cookies with special characters are sent correctly",
			);
		});
	});
});
