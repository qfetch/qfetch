import { describe, suite, type TestContext, test } from "node:test";

import { compose, pipeline } from "@qfetch/core";
import { createTestServer, type RequestHandler } from "@qfetch/test-utils";

import { withHeader, withHeaders } from "./with-headers.ts";

/* node:coverage disable */

suite("withHeader - Integration", { concurrency: true }, () => {
	describe("headers are received by server", () => {
		test("adds single header to request", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ header: req.headers["x-custom-header"] }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withHeader("X-Custom-Header", "test-value")(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/api`, { signal: ctx.signal });
			const data = (await response.json()) as { header: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.header,
				"test-value",
				"server receives custom header",
			);
		});

		test("adds Content-Type header to request", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ contentType: req.headers["content-type"] }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withHeader("Content-Type", "application/json")(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/api`, { signal: ctx.signal });
			const data = (await response.json()) as { contentType: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.contentType,
				"application/json",
				"server receives Content-Type header",
			);
		});
	});

	describe("request headers take precedence", () => {
		test("does not override existing request header", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ accept: req.headers.accept }));
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withHeader("Accept", "application/json")(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/api`, {
				signal: ctx.signal,
				headers: { Accept: "text/plain" },
			});
			const data = (await response.json()) as { accept: string };

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(
				data.accept,
				"text/plain",
				"request header takes precedence",
			);
		});
	});

	describe("HTTP methods work correctly", () => {
		test("works with POST requests", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						method: req.method,
						contentType: req.headers["content-type"],
					}),
				);
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withHeader("Content-Type", "application/json")(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/api`, {
				method: "POST",
				body: JSON.stringify({ key: "value" }),
				signal: ctx.signal,
			});
			const data = (await response.json()) as {
				method: string;
				contentType: string;
			};

			// Assert
			ctx.assert.strictEqual(response.status, 200, "returns successful status");
			ctx.assert.strictEqual(data.method, "POST", "uses POST method");
			ctx.assert.strictEqual(
				data.contentType,
				"application/json",
				"Content-Type header is sent",
			);
		});
	});
});

suite("withHeaders - Integration", { concurrency: true }, () => {
	describe("headers are received by server", () => {
		test("adds multiple headers to request", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						contentType: req.headers["content-type"],
						accept: req.headers.accept,
						custom: req.headers["x-custom"],
					}),
				);
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withHeaders({
				"Content-Type": "application/json",
				Accept: "application/json",
				"X-Custom": "custom-value",
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/api`, { signal: ctx.signal });
			const data = (await response.json()) as {
				contentType: string;
				accept: string;
				custom: string;
			};

			// Assert
			ctx.assert.strictEqual(
				data.contentType,
				"application/json",
				"Content-Type header received",
			);
			ctx.assert.strictEqual(
				data.accept,
				"application/json",
				"Accept header received",
			);
			ctx.assert.strictEqual(
				data.custom,
				"custom-value",
				"custom header received",
			);
		});

		test("works with Headers instance", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						contentType: req.headers["content-type"],
						custom: req.headers["x-custom"],
					}),
				);
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const headers = new Headers();
			headers.set("Content-Type", "application/json");
			headers.set("X-Custom", "from-headers-instance");
			const qfetch = withHeaders(headers)(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/api`, { signal: ctx.signal });
			const data = (await response.json()) as {
				contentType: string;
				custom: string;
			};

			// Assert
			ctx.assert.strictEqual(
				data.contentType,
				"application/json",
				"Content-Type from Headers instance",
			);
			ctx.assert.strictEqual(
				data.custom,
				"from-headers-instance",
				"custom header from Headers instance",
			);
		});
	});

	describe("request headers take precedence", () => {
		test("does not override existing request headers", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						contentType: req.headers["content-type"],
						accept: req.headers.accept,
					}),
				);
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withHeaders({
				"Content-Type": "application/json",
				Accept: "application/json",
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/api`, {
				signal: ctx.signal,
				headers: { "Content-Type": "text/plain" },
			});
			const data = (await response.json()) as {
				contentType: string;
				accept: string;
			};

			// Assert
			ctx.assert.strictEqual(
				data.contentType,
				"text/plain",
				"request Content-Type takes precedence",
			);
			ctx.assert.strictEqual(
				data.accept,
				"application/json",
				"middleware Accept is used when not overridden",
			);
		});
	});

	describe("composition with other middlewares", () => {
		test("works with compose() right-to-left order", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						contentType: req.headers["content-type"],
						accept: req.headers.accept,
					}),
				);
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = compose(
				withHeader("Content-Type", "application/json"),
				withHeader("Accept", "application/json"),
			)(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/api`, { signal: ctx.signal });
			const data = (await response.json()) as {
				contentType: string;
				accept: string;
			};

			// Assert
			ctx.assert.strictEqual(
				data.contentType,
				"application/json",
				"Content-Type header received",
			);
			ctx.assert.strictEqual(
				data.accept,
				"application/json",
				"Accept header received",
			);
		});

		test("works with pipeline() left-to-right order", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						contentType: req.headers["content-type"],
						custom: req.headers["x-custom"],
					}),
				);
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = pipeline(
				withHeader("Content-Type", "application/json"),
				withHeader("X-Custom", "custom-value"),
			)(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/api`, { signal: ctx.signal });
			const data = (await response.json()) as {
				contentType: string;
				custom: string;
			};

			// Assert
			ctx.assert.strictEqual(
				data.contentType,
				"application/json",
				"Content-Type header received",
			);
			ctx.assert.strictEqual(
				data.custom,
				"custom-value",
				"custom header received",
			);
		});

		test("multiple withHeaders middleware can be composed", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						contentType: req.headers["content-type"],
						accept: req.headers.accept,
						custom: req.headers["x-custom"],
					}),
				);
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = compose(
				withHeaders({ "Content-Type": "application/json" }),
				withHeaders({ Accept: "application/json", "X-Custom": "value" }),
			)(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/api`, { signal: ctx.signal });
			const data = (await response.json()) as {
				contentType: string;
				accept: string;
				custom: string;
			};

			// Assert
			ctx.assert.strictEqual(
				data.contentType,
				"application/json",
				"Content-Type from first middleware",
			);
			ctx.assert.strictEqual(
				data.accept,
				"application/json",
				"Accept from second middleware",
			);
			ctx.assert.strictEqual(
				data.custom,
				"value",
				"custom from second middleware",
			);
		});
	});

	describe("HTTP methods work correctly", () => {
		test("works with PUT requests", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						method: req.method,
						contentType: req.headers["content-type"],
					}),
				);
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withHeaders({
				"Content-Type": "application/json",
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/api`, {
				method: "PUT",
				body: JSON.stringify({ key: "value" }),
				signal: ctx.signal,
			});
			const data = (await response.json()) as {
				method: string;
				contentType: string;
			};

			// Assert
			ctx.assert.strictEqual(data.method, "PUT", "uses PUT method");
			ctx.assert.strictEqual(
				data.contentType,
				"application/json",
				"Content-Type header is sent",
			);
		});

		test("works with DELETE requests", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const handler = ctx.mock.fn<RequestHandler>((req, res) => {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						method: req.method,
						custom: req.headers["x-custom"],
					}),
				);
			});

			const { baseUrl } = await createTestServer(ctx, handler);
			const qfetch = withHeaders({
				"X-Custom": "delete-request",
			})(fetch);

			// Act
			const response = await qfetch(`${baseUrl}/api/123`, {
				method: "DELETE",
				signal: ctx.signal,
			});
			const data = (await response.json()) as {
				method: string;
				custom: string;
			};

			// Assert
			ctx.assert.strictEqual(data.method, "DELETE", "uses DELETE method");
			ctx.assert.strictEqual(
				data.custom,
				"delete-request",
				"custom header is sent",
			);
		});
	});
});
