import { describe, suite, test, type TestContext } from "node:test";

import { withHeader, withHeaders } from "./with-headers.ts";

/* node:coverage disable */
suite("withHeader - Unit", () => {
	describe("adds single header to requests", () => {
		test("adds header to request with string URL", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(
				fetch,
				async (_input: RequestInfo | URL, init?: RequestInit) => {
					const headers = new Headers(init?.headers);
					return new Response(headers.get("X-Custom-Header"));
				},
			);
			const qfetch = withHeader("X-Custom-Header", "test-value")(fetchMock);

			// Act
			const response = await qfetch("https://example.com");
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(body, "test-value", "header is added to request");
		});

		test("adds header to request with URL object", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(
				fetch,
				async (_input: RequestInfo | URL, init?: RequestInit) => {
					const headers = new Headers(init?.headers);
					return new Response(headers.get("Content-Type"));
				},
			);
			const qfetch = withHeader("Content-Type", "application/json")(fetchMock);

			// Act
			const response = await qfetch(new URL("https://example.com"));
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				body,
				"application/json",
				"header is added to URL request",
			);
		});

		test("adds header to request with Request object", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(
				fetch,
				async (_input: RequestInfo | URL, init?: RequestInit) => {
					const headers = new Headers(init?.headers);
					return new Response(headers.get("Accept"));
				},
			);
			const qfetch = withHeader("Accept", "application/json")(fetchMock);

			// Act
			const response = await qfetch(new Request("https://example.com"));
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				body,
				"application/json",
				"header is added to Request",
			);
		});
	});

	describe("request headers take precedence", () => {
		test("does not override header in init", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(
				fetch,
				async (_input: RequestInfo | URL, init?: RequestInit) => {
					const headers = new Headers(init?.headers);
					return new Response(headers.get("Content-Type"));
				},
			);
			const qfetch = withHeader(
				"Content-Type",
				"application/json",
			)(fetchMock);

			// Act
			const response = await qfetch("https://example.com", {
				headers: { "Content-Type": "text/plain" },
			});
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				body,
				"text/plain",
				"request header takes precedence",
			);
		});

		test("does not override header in Request object", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(
				fetch,
				async (input: RequestInfo | URL, init?: RequestInit) => {
					const headers = new Headers(init?.headers);
					if (input instanceof Request) {
						for (const [key, value] of input.headers.entries()) {
							if (!headers.has(key)) headers.set(key, value);
						}
					}
					return new Response(headers.get("Authorization"));
				},
			);
			const qfetch = withHeader("Authorization", "Bearer middleware")(fetchMock);

			// Act
			const request = new Request("https://example.com", {
				headers: { Authorization: "Bearer request" },
			});
			const response = await qfetch(request);
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				body,
				"Bearer request",
				"Request header takes precedence",
			);
		});

		test("handles case-insensitive header names", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(
				fetch,
				async (_input: RequestInfo | URL, init?: RequestInit) => {
					const headers = new Headers(init?.headers);
					return new Response(headers.get("content-type"));
				},
			);
			const qfetch = withHeader(
				"Content-Type",
				"application/json",
			)(fetchMock);

			// Act
			const response = await qfetch("https://example.com", {
				headers: { "content-type": "text/html" },
			});
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(
				body,
				"text/html",
				"case-insensitive header comparison works",
			);
		});
	});

	describe("preserves other request properties", () => {
		test("preserves request method", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(
				fetch,
				async (input: RequestInfo | URL, init?: RequestInit) => {
					const method =
						init?.method ?? (input instanceof Request ? input.method : "GET");
					return new Response(method);
				},
			);
			const qfetch = withHeader("X-Custom", "value")(fetchMock);

			// Act
			const response = await qfetch("https://example.com", { method: "POST" });
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(body, "POST", "method is preserved");
		});

		test("preserves existing init headers", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(
				fetch,
				async (_input: RequestInfo | URL, init?: RequestInit) => {
					const headers = new Headers(init?.headers);
					return new Response(
						JSON.stringify({
							custom: headers.get("X-Custom"),
							existing: headers.get("X-Existing"),
						}),
					);
				},
			);
			const qfetch = withHeader("X-Custom", "new-value")(fetchMock);

			// Act
			const response = await qfetch("https://example.com", {
				headers: { "X-Existing": "existing-value" },
			});
			const body = JSON.parse(await response.text());

			// Assert
			ctx.assert.strictEqual(body.custom, "new-value", "new header is added");
			ctx.assert.strictEqual(
				body.existing,
				"existing-value",
				"existing header is preserved",
			);
		});
	});
});

suite("withHeaders - Unit", () => {
	describe("adds multiple headers to requests", () => {
		test("adds headers from plain object", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(
				fetch,
				async (_input: RequestInfo | URL, init?: RequestInit) => {
					const headers = new Headers(init?.headers);
					return new Response(
						JSON.stringify({
							contentType: headers.get("Content-Type"),
							accept: headers.get("Accept"),
						}),
					);
				},
			);
			const qfetch = withHeaders({
				"Content-Type": "application/json",
				Accept: "application/json",
			})(fetchMock);

			// Act
			const response = await qfetch("https://example.com");
			const body = JSON.parse(await response.text());

			// Assert
			ctx.assert.strictEqual(
				body.contentType,
				"application/json",
				"Content-Type header is added",
			);
			ctx.assert.strictEqual(
				body.accept,
				"application/json",
				"Accept header is added",
			);
		});

		test("adds headers from Headers instance", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(
				fetch,
				async (_input: RequestInfo | URL, init?: RequestInit) => {
					const headers = new Headers(init?.headers);
					return new Response(
						JSON.stringify({
							contentType: headers.get("Content-Type"),
							custom: headers.get("X-Custom"),
						}),
					);
				},
			);
			const headersInput = new Headers();
			headersInput.set("Content-Type", "application/json");
			headersInput.set("X-Custom", "custom-value");
			const qfetch = withHeaders(headersInput)(fetchMock);

			// Act
			const response = await qfetch("https://example.com");
			const body = JSON.parse(await response.text());

			// Assert
			ctx.assert.strictEqual(
				body.contentType,
				"application/json",
				"Content-Type from Headers instance",
			);
			ctx.assert.strictEqual(
				body.custom,
				"custom-value",
				"custom header from Headers instance",
			);
		});
	});

	describe("request headers take precedence", () => {
		test("does not override existing headers from init", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(
				fetch,
				async (_input: RequestInfo | URL, init?: RequestInit) => {
					const headers = new Headers(init?.headers);
					return new Response(
						JSON.stringify({
							contentType: headers.get("Content-Type"),
							accept: headers.get("Accept"),
						}),
					);
				},
			);
			const qfetch = withHeaders({
				"Content-Type": "application/json",
				Accept: "application/json",
			})(fetchMock);

			// Act
			const response = await qfetch("https://example.com", {
				headers: { "Content-Type": "text/plain" },
			});
			const body = JSON.parse(await response.text());

			// Assert
			ctx.assert.strictEqual(
				body.contentType,
				"text/plain",
				"request Content-Type takes precedence",
			);
			ctx.assert.strictEqual(
				body.accept,
				"application/json",
				"middleware Accept is added (not in request)",
			);
		});

		test("does not override headers from Request object", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(
				fetch,
				async (input: RequestInfo | URL, init?: RequestInit) => {
					const headers = new Headers(init?.headers);
					if (input instanceof Request) {
						for (const [key, value] of input.headers.entries()) {
							if (!headers.has(key)) headers.set(key, value);
						}
					}
					return new Response(
						JSON.stringify({
							auth: headers.get("Authorization"),
							custom: headers.get("X-Custom"),
						}),
					);
				},
			);
			const qfetch = withHeaders({
				Authorization: "Bearer middleware",
				"X-Custom": "middleware-value",
			})(fetchMock);

			// Act
			const request = new Request("https://example.com", {
				headers: { Authorization: "Bearer request" },
			});
			const response = await qfetch(request);
			const body = JSON.parse(await response.text());

			// Assert
			ctx.assert.strictEqual(
				body.auth,
				"Bearer request",
				"Request Authorization takes precedence",
			);
			ctx.assert.strictEqual(
				body.custom,
				"middleware-value",
				"middleware X-Custom is added",
			);
		});
	});

	describe("handles empty and invalid inputs", () => {
		test("passes through unchanged with empty object", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withHeaders({})(fetchMock);

			// Act
			const response = await qfetch("https://example.com");
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(body, "ok", "request passes through unchanged");
		});

		test("passes through unchanged with empty Headers instance", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
			const qfetch = withHeaders(new Headers())(fetchMock);

			// Act
			const response = await qfetch("https://example.com");
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(body, "ok", "request passes through unchanged");
		});

		test("passes through with non-object input", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(4);

			await ctx.test("null", async (ctx: TestContext) => {
				ctx.plan(1);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				// @ts-expect-error testing invalid input
				const qfetch = withHeaders(null)(fetchMock);
				const response = await qfetch("https://example.com");
				ctx.assert.strictEqual(await response.text(), "ok", "handles null");
			});

			await ctx.test("undefined", async (ctx: TestContext) => {
				ctx.plan(1);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				// @ts-expect-error testing invalid input
				const qfetch = withHeaders(undefined)(fetchMock);
				const response = await qfetch("https://example.com");
				ctx.assert.strictEqual(
					await response.text(),
					"ok",
					"handles undefined",
				);
			});

			await ctx.test("string", async (ctx: TestContext) => {
				ctx.plan(1);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				// @ts-expect-error testing invalid input
				const qfetch = withHeaders("invalid")(fetchMock);
				const response = await qfetch("https://example.com");
				ctx.assert.strictEqual(await response.text(), "ok", "handles string");
			});

			await ctx.test("array", async (ctx: TestContext) => {
				ctx.plan(1);
				const fetchMock = ctx.mock.fn(fetch, async () => new Response("ok"));
				// @ts-expect-error testing invalid input
				const qfetch = withHeaders(["invalid"])(fetchMock);
				const response = await qfetch("https://example.com");
				ctx.assert.strictEqual(await response.text(), "ok", "handles array");
			});
		});
	});

	describe("works with different input types", () => {
		test("works with string URL", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(
				fetch,
				async (_input: RequestInfo | URL, init?: RequestInit) => {
					const headers = new Headers(init?.headers);
					return new Response(headers.get("X-Custom"));
				},
			);
			const qfetch = withHeaders({ "X-Custom": "value" })(fetchMock);

			// Act
			const response = await qfetch("https://example.com");
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(body, "value", "works with string URL");
		});

		test("works with URL object", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(
				fetch,
				async (_input: RequestInfo | URL, init?: RequestInit) => {
					const headers = new Headers(init?.headers);
					return new Response(headers.get("X-Custom"));
				},
			);
			const qfetch = withHeaders({ "X-Custom": "value" })(fetchMock);

			// Act
			const response = await qfetch(new URL("https://example.com"));
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(body, "value", "works with URL object");
		});

		test("works with Request object", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(
				fetch,
				async (_input: RequestInfo | URL, init?: RequestInit) => {
					const headers = new Headers(init?.headers);
					return new Response(headers.get("X-Custom"));
				},
			);
			const qfetch = withHeaders({ "X-Custom": "value" })(fetchMock);

			// Act
			const response = await qfetch(new Request("https://example.com"));
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(body, "value", "works with Request object");
		});
	});

	describe("preserves request properties", () => {
		test("preserves method from init", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(
				fetch,
				async (input: RequestInfo | URL, init?: RequestInit) => {
					const method =
						init?.method ?? (input instanceof Request ? input.method : "GET");
					return new Response(method);
				},
			);
			const qfetch = withHeaders({ "X-Custom": "value" })(fetchMock);

			// Act
			const response = await qfetch("https://example.com", { method: "DELETE" });
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(body, "DELETE", "method is preserved");
		});

		test("preserves body from init", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(
				fetch,
				async (_input: RequestInfo | URL, init?: RequestInit) => {
					return new Response(init?.body as string);
				},
			);
			const qfetch = withHeaders({ "Content-Type": "application/json" })(
				fetchMock,
			);

			// Act
			const response = await qfetch("https://example.com", {
				method: "POST",
				body: '{"key":"value"}',
			});
			const body = await response.text();

			// Assert
			ctx.assert.strictEqual(body, '{"key":"value"}', "body is preserved");
		});
	});
});
