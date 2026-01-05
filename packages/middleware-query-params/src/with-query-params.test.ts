import { describe, suite, type TestContext, test } from "node:test";

import { withQueryParam, withQueryParams } from "./with-query-params.ts";

/* node:coverage disable */

suite("withQueryParam - Unit", () => {
	describe("string inputs preserve type and format", () => {
		test("adds param to absolute URL string", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"https://example.com/users?page=1",
					"param is appended to URL",
				);
				return new Response();
			});

			const qfetch = withQueryParam("page", "1")(fetchMock);

			// Act
			await qfetch("https://example.com/users");
		});

		test("adds param to relative URL string", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"/api/users?page=1",
					"param is appended to relative URL",
				);
				return new Response();
			});

			const qfetch = withQueryParam("page", "1")(fetchMock);

			// Act
			await qfetch("/api/users");
		});

		test("preserves hash in URL string", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"/api/users?page=1#section",
					"hash is preserved after query param",
				);
				return new Response();
			});

			const qfetch = withQueryParam("page", "1")(fetchMock);

			// Act
			await qfetch("/api/users#section");
		});

		test("merges with existing query params (request takes precedence)", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"https://example.com/users?page=1&existing=yes",
					"middleware param first, request param after",
				);
				return new Response();
			});

			const qfetch = withQueryParam("page", "1")(fetchMock);

			// Act
			await qfetch("https://example.com/users?existing=yes");
		});

		test("request params take precedence over middleware params", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"https://example.com/users?page=2&page=1",
					"middleware param first, request param after (takes precedence)",
				);
				return new Response();
			});

			const qfetch = withQueryParam("page", "2")(fetchMock);

			// Act
			await qfetch("https://example.com/users?page=1");
		});

		test("encodes special characters in value", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"https://example.com/search?q=hello+world",
					"special characters are encoded",
				);
				return new Response();
			});

			const qfetch = withQueryParam("q", "hello world")(fetchMock);

			// Act
			await qfetch("https://example.com/search");
		});
	});

	describe("URL inputs preserve type", () => {
		test("returns URL object for URL input", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof URL, "input is a URL");
				ctx.assert.equal(
					input.href,
					"https://example.com/users?page=1",
					"param is appended to URL",
				);
				return new Response();
			});

			const qfetch = withQueryParam("page", "1")(fetchMock);

			// Act
			await qfetch(new URL("https://example.com/users"));
		});

		test("returns new URL object (not same reference)", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const originalUrl = new URL("https://example.com/users");
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.notStrictEqual(input, originalUrl, "returns new URL object");
				return new Response();
			});

			const qfetch = withQueryParam("page", "1")(fetchMock);

			// Act
			await qfetch(originalUrl);
		});
	});

	describe("Request inputs preserve type and properties", () => {
		test("returns Request object for Request input", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof Request, "input is a Request");
				ctx.assert.equal(
					input.url,
					"https://example.com/users?page=1",
					"param is appended to Request URL",
				);
				ctx.assert.equal(input.method, "POST", "method is preserved");
				return new Response();
			});

			const qfetch = withQueryParam("page", "1")(fetchMock);

			// Act
			await qfetch(
				new Request("https://example.com/users", { method: "POST" }),
			);
		});

		test("preserves Request headers", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof Request, "input is a Request");
				ctx.assert.equal(
					(input as Request).headers.get("Authorization"),
					"Bearer token",
					"headers are preserved",
				);
				return new Response();
			});

			const qfetch = withQueryParam("page", "1")(fetchMock);

			// Act
			await qfetch(
				new Request("https://example.com/users", {
					headers: { Authorization: "Bearer token" },
				}),
			);
		});
	});

	describe("array values with repeat format (default)", () => {
		test("repeats key for each array value", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"https://example.com/posts?tags=foo&tags=bar",
					"array values use repeated keys",
				);
				return new Response();
			});

			const qfetch = withQueryParam("tags", ["foo", "bar"])(fetchMock);

			// Act
			await qfetch("https://example.com/posts");
		});

		test("skips empty arrays", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"https://example.com/posts",
					"empty array adds nothing",
				);
				return new Response();
			});

			const qfetch = withQueryParam("tags", [])(fetchMock);

			// Act
			await qfetch("https://example.com/posts");
		});

		test("handles single-element array", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"https://example.com/posts?tags=single",
					"single-element array works",
				);
				return new Response();
			});

			const qfetch = withQueryParam("tags", ["single"])(fetchMock);

			// Act
			await qfetch("https://example.com/posts");
		});
	});

	describe("array values with brackets format", () => {
		test("appends brackets to key for array values", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"https://example.com/posts?tags%5B%5D=foo&tags%5B%5D=bar",
					"array values use bracket notation",
				);
				return new Response();
			});

			const qfetch = withQueryParam("tags", ["foo", "bar"], {
				arrayFormat: "brackets",
			})(fetchMock);

			// Act
			await qfetch("https://example.com/posts");
		});

		test("string values unchanged with brackets option", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"https://example.com/posts?page=1",
					"string values unaffected by arrayFormat",
				);
				return new Response();
			});

			const qfetch = withQueryParam("page", "1", {
				arrayFormat: "brackets",
			})(fetchMock);

			// Act
			await qfetch("https://example.com/posts");
		});
	});
});

suite("withQueryParams - Unit", () => {
	describe("multiple params are appended correctly", () => {
		test("adds multiple params to URL", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"https://example.com/users?page=1&limit=10",
					"multiple params are appended",
				);
				return new Response();
			});

			const qfetch = withQueryParams({ page: "1", limit: "10" })(fetchMock);

			// Act
			await qfetch("https://example.com/users");
		});

		test("passes through unchanged with empty params", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"https://example.com/users",
					"URL is unchanged with empty params",
				);
				return new Response();
			});

			const qfetch = withQueryParams({})(fetchMock);

			// Act
			await qfetch("https://example.com/users");
		});

		test("passes through unchanged with non-object params", async (ctx: TestContext) => {
			// Arrange
			const cases = [
				{ name: "null", value: null },
				{ name: "undefined", value: undefined },
				{ name: "string", value: "invalid" },
				{ name: "number", value: 123 },
				{ name: "array", value: ["a", "b"] },
			];
			ctx.plan(cases.length);

			for (const { name, value } of cases) {
				await ctx.test(name, async (subCtx: TestContext) => {
					// Arrange
					subCtx.plan(2);
					const fetchMock = subCtx.mock.fn(fetch, async (input) => {
						subCtx.assert.ok(typeof input === "string", "input is a string");
						subCtx.assert.equal(
							input,
							"https://example.com/users",
							"URL is unchanged",
						);
						return new Response();
					});

					// @ts-expect-error testing invalid input
					const qfetch = withQueryParams(value)(fetchMock);

					// Act
					await qfetch("https://example.com/users");
				});
			}
		});

		test("merges with existing query params (request takes precedence)", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"https://example.com/users?page=1&limit=10&existing=yes",
					"middleware params first, request params after",
				);
				return new Response();
			});

			const qfetch = withQueryParams({ page: "1", limit: "10" })(fetchMock);

			// Act
			await qfetch("https://example.com/users?existing=yes");
		});
	});

	describe("array values with repeat format (default)", () => {
		test("repeats key for each array value", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"https://example.com/posts?tags=typescript&tags=javascript",
					"array values use repeated keys",
				);
				return new Response();
			});

			const qfetch = withQueryParams({
				tags: ["typescript", "javascript"],
			})(fetchMock);

			// Act
			await qfetch("https://example.com/posts");
		});

		test("skips empty arrays", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"https://example.com/posts?page=1",
					"empty array is skipped",
				);
				return new Response();
			});

			const qfetch = withQueryParams({
				tags: [],
				page: "1",
			})(fetchMock);

			// Act
			await qfetch("https://example.com/posts");
		});

		test("handles mixed string and array values", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"https://example.com/posts?page=1&tags=a&tags=b",
					"mixed values handled correctly",
				);
				return new Response();
			});

			const qfetch = withQueryParams({
				page: "1",
				tags: ["a", "b"],
			})(fetchMock);

			// Act
			await qfetch("https://example.com/posts");
		});
	});

	describe("array values with brackets format", () => {
		test("appends brackets to key for array values", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"https://example.com/posts?tags%5B%5D=typescript&tags%5B%5D=javascript",
					"array values use bracket notation",
				);
				return new Response();
			});

			const qfetch = withQueryParams(
				{ tags: ["typescript", "javascript"] },
				{ arrayFormat: "brackets" },
			)(fetchMock);

			// Act
			await qfetch("https://example.com/posts");
		});

		test("string values unchanged with brackets option", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"https://example.com/posts?page=1",
					"string values unaffected by arrayFormat",
				);
				return new Response();
			});

			const qfetch = withQueryParams(
				{ page: "1" },
				{ arrayFormat: "brackets" },
			)(fetchMock);

			// Act
			await qfetch("https://example.com/posts");
		});
	});

	describe("string inputs preserve type and format", () => {
		test("preserves relative URL format", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"/api/users?page=1",
					"relative URL format preserved",
				);
				return new Response();
			});

			const qfetch = withQueryParams({ page: "1" })(fetchMock);

			// Act
			await qfetch("/api/users");
		});

		test("preserves hash in URL", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"/api/users?page=1#section",
					"hash preserved after params",
				);
				return new Response();
			});

			const qfetch = withQueryParams({ page: "1" })(fetchMock);

			// Act
			await qfetch("/api/users#section");
		});

		test("handles empty string value", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(typeof input === "string", "input is a string");
				ctx.assert.equal(
					input,
					"https://example.com/search?q=",
					"empty value creates param with no value",
				);
				return new Response();
			});

			const qfetch = withQueryParams({ q: "" })(fetchMock);

			// Act
			await qfetch("https://example.com/search");
		});
	});

	describe("URL inputs preserve type", () => {
		test("returns URL object for URL input", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof URL, "input is a URL");
				ctx.assert.equal(
					input.href,
					"https://example.com/users?page=1",
					"params appended to URL object",
				);
				return new Response();
			});

			const qfetch = withQueryParams({ page: "1" })(fetchMock);

			// Act
			await qfetch(new URL("https://example.com/users"));
		});
	});

	describe("Request inputs preserve type and properties", () => {
		test("returns Request with modified URL", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(3);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof Request, "input is a Request");
				ctx.assert.equal(
					input.url,
					"https://example.com/users?page=1",
					"params appended to Request URL",
				);
				ctx.assert.equal(input.method, "POST", "method preserved");
				return new Response();
			});

			const qfetch = withQueryParams({ page: "1" })(fetchMock);

			// Act
			await qfetch(
				new Request("https://example.com/users", { method: "POST" }),
			);
		});

		test("preserves Request headers", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof Request, "input is a Request");
				ctx.assert.equal(
					(input as Request).headers.get("X-Custom"),
					"value",
					"custom headers preserved",
				);
				return new Response();
			});

			const qfetch = withQueryParams({ page: "1" })(fetchMock);

			// Act
			await qfetch(
				new Request("https://example.com/users", {
					headers: { "X-Custom": "value" },
				}),
			);
		});
	});
});
