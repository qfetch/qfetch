import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer, type Server } from "node:http";
import { describe, suite, type TestContext, test } from "node:test";

import { withBaseUrl } from "./with-base-url.ts";

/* node:coverage disable */

interface ServerContext {
	server: Server;
	baseUrl: string;
}

type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

suite("withBaseUrl - Integration", { concurrency: true }, () => {
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

			// Default handler - echo back request body or return success
			let body = "";
			req.on("data", (chunk) => {
				body += chunk.toString();
			});
			req.on("end", () => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(body || JSON.stringify({ success: true }));
			});
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

	describe("string inputs resolve correctly against base URL", () => {
		test("resolves relative paths against base URL", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ path: req.url }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withBaseUrl(`${baseUrl}/api/v1/`)(fetch);

			// Act
			const response = await qfetch("users", { signal: ctx.signal });
			const data = (await response.json()) as { path: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.path,
				"/api/v1/users",
				"resolves relative path correctly",
			);
		});

		test("resolves same-origin absolute paths against base URL", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ path: req.url }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withBaseUrl(`${baseUrl}/api/v1/`)(fetch);

			// Act
			const response = await qfetch("/users", { signal: ctx.signal });
			const data = (await response.json()) as { path: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.path,
				"/api/v1/users",
				"treats absolute path as relative to base",
			);
		});

		test("passes through different-origin URLs unchanged", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ success: true }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const { baseUrl: differentOrigin } = await createTestServer(ctx, handler);
			const qfetch = withBaseUrl(`${baseUrl}/api/`)(fetch);

			// Act
			const response = await qfetch(`${differentOrigin}/data`, {
				signal: ctx.signal,
			});

			// Assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"successfully calls different-origin URL",
			);
		});

		test("preserves query parameters when resolving paths", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ path: req.url }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withBaseUrl(`${baseUrl}/api/`)(fetch);

			// Act
			const response = await qfetch("users?page=1&limit=10", {
				signal: ctx.signal,
			});
			const data = (await response.json()) as { path: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.path,
				"/api/users?page=1&limit=10",
				"preserves query parameters",
			);
		});
	});

	describe("URL inputs resolve correctly against base URL", () => {
		test("resolves same-origin URL paths against base URL", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ path: req.url }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withBaseUrl(new URL(`${baseUrl}/api/v1/`))(fetch);

			// Act
			const response = await qfetch(new URL("users", baseUrl), {
				signal: ctx.signal,
			});
			const data = (await response.json()) as { path: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.path,
				"/api/v1/users",
				"resolves URL path correctly",
			);
		});

		test("resolves same-origin URL with absolute path against base", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ path: req.url }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withBaseUrl(`${baseUrl}/api/v1/`)(fetch);

			// Act
			const response = await qfetch(new URL("/users", baseUrl), {
				signal: ctx.signal,
			});
			const data = (await response.json()) as { path: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.path,
				"/api/v1/users",
				"treats absolute path as relative to base",
			);
		});

		test("passes through different-origin URLs unchanged", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ success: true }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const { baseUrl: differentOrigin } = await createTestServer(ctx, handler);
			const qfetch = withBaseUrl(`${baseUrl}/api/`)(fetch);

			// Act
			const response = await qfetch(new URL(`${differentOrigin}/data`), {
				signal: ctx.signal,
			});

			// Assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"successfully calls different-origin URL",
			);
		});

		test("preserves query parameters when resolving URLs", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ path: req.url }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withBaseUrl(`${baseUrl}/api/`)(fetch);

			// Act
			const response = await qfetch(
				new URL("/users?page=1&limit=10", baseUrl),
				{ signal: ctx.signal },
			);
			const data = (await response.json()) as { path: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.path,
				"/api/users?page=1&limit=10",
				"preserves query parameters",
			);
		});

		test("preserves hash when resolving URLs", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);

			// Mock fetch to capture the final URL being passed
			const capturedUrls: string[] = [];
			const mockFetch = ctx.mock.fn(
				async (input: URL | RequestInfo, _init?: RequestInit) => {
					if (input instanceof URL) {
						capturedUrls.push(input.toString());
					} else if (typeof input === "string") {
						capturedUrls.push(input);
					} else {
						capturedUrls.push(input.url);
					}
					return new Response(JSON.stringify({ success: true }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				},
			);

			const qfetch = withBaseUrl("http://127.0.0.1:3000/api/")(
				mockFetch as typeof fetch,
			);

			// Act
			const inputUrl = new URL("/users#section", "http://127.0.0.1:3000");
			await qfetch(inputUrl, { signal: ctx.signal });

			// Assert
			ctx.assert.strictEqual(capturedUrls.length, 1, "makes one fetch call");
			ctx.assert.strictEqual(
				capturedUrls[0]?.includes("#section"),
				true,
				"preserves hash fragment in URL",
			);
		});
	});

	describe("Request inputs resolve correctly against base URL", () => {
		test("resolves same-origin Request paths against base URL", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ path: req.url }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withBaseUrl(`${baseUrl}/api/v1/`)(fetch);

			// Act
			const request = new Request(new URL("users", baseUrl), {
				signal: ctx.signal,
			});
			const response = await qfetch(request);
			const data = (await response.json()) as { path: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.path,
				"/api/v1/users",
				"resolves Request path correctly",
			);
		});

		test("resolves same-origin Request with absolute path against base", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ path: req.url }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withBaseUrl(`${baseUrl}/api/v1/`)(fetch);

			// Act
			const request = new Request(new URL("/users", baseUrl), {
				signal: ctx.signal,
			});
			const response = await qfetch(request);
			const data = (await response.json()) as { path: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.path,
				"/api/v1/users",
				"treats absolute path as relative to base",
			);
		});

		test("passes through different-origin Requests unchanged", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ success: true }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const { baseUrl: differentOrigin } = await createTestServer(ctx, handler);
			const qfetch = withBaseUrl(`${baseUrl}/api/`)(fetch);

			// Act
			const request = new Request(`${differentOrigin}/data`, {
				signal: ctx.signal,
			});
			const response = await qfetch(request);

			// Assert
			ctx.assert.strictEqual(
				response.status,
				200,
				"successfully calls different-origin URL",
			);
		});

		test("preserves query parameters when resolving Requests", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ path: req.url }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withBaseUrl(`${baseUrl}/api/`)(fetch);

			// Act
			const request = new Request(new URL("/users?page=1", baseUrl), {
				signal: ctx.signal,
			});
			const response = await qfetch(request);
			const data = (await response.json()) as { path: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.path,
				"/api/users?page=1",
				"preserves query parameters",
			);
		});

		test("preserves hash when resolving Requests", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);

			// Mock fetch to capture the final Request being passed
			const capturedRequests: Request[] = [];
			const mockFetch = ctx.mock.fn(
				async (input: URL | RequestInfo, _init?: RequestInit) => {
					if (input instanceof Request) {
						capturedRequests.push(input);
					}
					return new Response(JSON.stringify({ success: true }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				},
			);

			const qfetch = withBaseUrl("http://127.0.0.1:3000/api/")(
				mockFetch as typeof fetch,
			);

			// Act
			const request = new Request(
				new URL("/users#section", "http://127.0.0.1:3000"),
				{
					signal: ctx.signal,
				},
			);
			await qfetch(request);

			// Assert
			ctx.assert.strictEqual(
				capturedRequests.length,
				1,
				"makes one fetch call",
			);
			ctx.assert.strictEqual(
				capturedRequests[0]?.url.includes("#section"),
				true,
				"preserves hash fragment in Request URL",
			);
		});
	});

	describe("request body handling", () => {
		test("sends JSON body successfully with relative path", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				let body = "";
				req.on("data", (chunk) => {
					body += chunk.toString();
				});
				req.on("end", () => {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(body);
				});
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withBaseUrl(`${baseUrl}/api/`)(fetch);

			// Act
			const response = await qfetch("users", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "John Doe" }),
				signal: ctx.signal,
			});
			const data = (await response.json()) as { name: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.deepStrictEqual(
				data,
				{ name: "John Doe" },
				"sends JSON body successfully",
			);
		});

		test("sends stream body successfully with relative path", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				let body = "";
				req.on("data", (chunk) => {
					body += chunk.toString();
				});
				req.on("end", () => {
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(body);
				});
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withBaseUrl(`${baseUrl}/api/`)(fetch);

			// Act
			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue(
						new TextEncoder().encode(JSON.stringify({ name: "Jane Doe" })),
					);
					controller.close();
				},
			});
			const response = await qfetch("users", {
				method: "POST",
				body: stream,
				signal: ctx.signal,
				// @ts-expect-error: https://github.com/nodejs/node/issues/46221
				duplex: "half",
			});
			const data = (await response.json()) as { name: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.deepStrictEqual(
				data,
				{ name: "Jane Doe" },
				"sends stream body successfully",
			);
		});

		test("preserves all request properties when resolving Request objects", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(4);
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
							customHeader: req.headers["x-custom-header"],
							body: JSON.parse(body),
						}),
					);
				});
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withBaseUrl(`${baseUrl}/api/`)(fetch);

			// Act
			const request = new Request(new URL("users", baseUrl), {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Custom-Header": "test-value",
				},
				body: JSON.stringify({ name: "Test User" }),
				signal: ctx.signal,
			});
			const response = await qfetch(request);
			const data = (await response.json()) as {
				method: string;
				customHeader: string;
				body: { name: string };
			};

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(data.method, "POST", "preserves request method");
			ctx.assert.strictEqual(
				data.customHeader,
				"test-value",
				"preserves custom headers",
			);
			ctx.assert.deepStrictEqual(
				data.body,
				{ name: "Test User" },
				"preserves request body",
			);
		});
	});

	describe("trailing slash behavior", () => {
		test("appends paths correctly with trailing slash in base URL", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ path: req.url }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withBaseUrl(`${baseUrl}/api/v1/`)(fetch);

			// Act
			const response = await qfetch("users", { signal: ctx.signal });
			const data = (await response.json()) as { path: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.path,
				"/api/v1/users",
				"appends path correctly with trailing slash",
			);
		});

		test("replaces last segment without trailing slash in base URL", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ path: req.url }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withBaseUrl(`${baseUrl}/api/v1`)(fetch);

			// Act
			const response = await qfetch("users", { signal: ctx.signal });
			const data = (await response.json()) as { path: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.path,
				"/api/users",
				"replaces last segment without trailing slash",
			);
		});
	});

	describe("HTTP methods", () => {
		test("handles GET requests with resolved paths", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ method: req.method, path: req.url }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withBaseUrl(`${baseUrl}/api/`)(fetch);

			// Act
			const response = await qfetch("users", { signal: ctx.signal });
			const data = (await response.json()) as { method: string; path: string };

			// Assert
			ctx.assert.strictEqual(data.method, "GET", "uses GET method by default");
			ctx.assert.strictEqual(
				data.path,
				"/api/users",
				"resolves path correctly",
			);
		});

		test("handles POST requests with resolved paths", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ method: req.method, path: req.url }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withBaseUrl(`${baseUrl}/api/`)(fetch);

			// Act
			const response = await qfetch("users", {
				method: "POST",
				signal: ctx.signal,
			});
			const data = (await response.json()) as { method: string; path: string };

			// Assert
			ctx.assert.strictEqual(data.method, "POST", "uses POST method");
			ctx.assert.strictEqual(
				data.path,
				"/api/users",
				"resolves path correctly",
			);
		});

		test("handles PUT requests with resolved paths", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ method: req.method, path: req.url }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withBaseUrl(`${baseUrl}/api/`)(fetch);

			// Act
			const response = await qfetch("users/1", {
				method: "PUT",
				signal: ctx.signal,
			});
			const data = (await response.json()) as { method: string; path: string };

			// Assert
			ctx.assert.strictEqual(data.method, "PUT", "uses PUT method");
			ctx.assert.strictEqual(
				data.path,
				"/api/users/1",
				"resolves path correctly",
			);
		});

		test("handles DELETE requests with resolved paths", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ method: req.method, path: req.url }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withBaseUrl(`${baseUrl}/api/`)(fetch);

			// Act
			const response = await qfetch("users/1", {
				method: "DELETE",
				signal: ctx.signal,
			});
			const data = (await response.json()) as { method: string; path: string };

			// Assert
			ctx.assert.strictEqual(data.method, "DELETE", "uses DELETE method");
			ctx.assert.strictEqual(
				data.path,
				"/api/users/1",
				"resolves path correctly",
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
			const qfetch = withBaseUrl(`${baseUrl}/api/`)(fetch);
			const controller = new AbortController();

			// Act
			const promise = qfetch("users", { signal: controller.signal });
			controller.abort();

			// Assert
			await ctx.assert.rejects(
				() => promise,
				(e: unknown) => e instanceof DOMException && e.name === "AbortError",
				"propagates abort to underlying fetch",
			);
		});

		test("aborts immediately when signal is already aborted", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const handler = ctx.mock.fn<RequestHandler>((_req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ success: true }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withBaseUrl(`${baseUrl}/api/`)(fetch);
			const controller = new AbortController();
			controller.abort();

			// Act & Assert
			await ctx.assert.rejects(
				() => qfetch("users", { signal: controller.signal }),
				(e: unknown) => e instanceof DOMException && e.name === "AbortError",
				"throws AbortError when signal is pre-aborted",
			);
		});
	});
});
