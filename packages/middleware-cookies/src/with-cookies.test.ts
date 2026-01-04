import { describe, suite, type TestContext, test } from "node:test";

import { withCookie, withCookies } from "./with-cookies.ts";

/* node:coverage disable */

suite("withCookie - Unit", () => {
	describe("sets Cookie header on outgoing requests", () => {
		test("sets cookie header with string URL input", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async (_input, init) => {
				const headers = new Headers(init?.headers);
				ctx.assert.equal(
					headers.get("Cookie"),
					"session=abc123",
					"cookie header is set correctly",
				);
				return new Response();
			});

			const qfetch = withCookie("session", "abc123")(fetchMock);

			// Act
			await qfetch("https://example.com");
		});

		test("sets cookie header with URL object input", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async (_input, init) => {
				const headers = new Headers(init?.headers);
				ctx.assert.equal(
					headers.get("Cookie"),
					"token=xyz789",
					"cookie header is set correctly",
				);
				return new Response();
			});

			const qfetch = withCookie("token", "xyz789")(fetchMock);

			// Act
			await qfetch(new URL("https://example.com"));
		});

		test("sets cookie header with Request object input", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(2);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.ok(input instanceof Request, "input is a Request");
				ctx.assert.equal(
					(input as Request).headers.get("Cookie"),
					"auth=secret",
					"cookie header is set on Request",
				);
				return new Response();
			});

			const qfetch = withCookie("auth", "secret")(fetchMock);

			// Act
			await qfetch(new Request("https://example.com"));
		});
	});

	describe("merges with existing Cookie headers", () => {
		test("appends to existing cookie header from init", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async (_input, init) => {
				const headers = new Headers(init?.headers);
				ctx.assert.equal(
					headers.get("Cookie"),
					"existing=value; session=abc123",
					"cookie is appended to existing header",
				);
				return new Response();
			});

			const qfetch = withCookie("session", "abc123")(fetchMock);

			// Act
			await qfetch("https://example.com", {
				headers: { Cookie: "existing=value" },
			});
		});

		test("appends to existing cookie header from Request object", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.equal(
					(input as Request).headers.get("Cookie"),
					"existing=value; session=abc123",
					"cookie is appended to existing Request header",
				);
				return new Response();
			});

			const qfetch = withCookie("session", "abc123")(fetchMock);

			// Act
			await qfetch(
				new Request("https://example.com", {
					headers: { Cookie: "existing=value" },
				}),
			);
		});
	});

	describe("handles edge cases", () => {
		test("handles cookie values with special characters", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async (_input, init) => {
				const headers = new Headers(init?.headers);
				ctx.assert.equal(
					headers.get("Cookie"),
					"data=hello%20world",
					"cookie with special characters is set correctly",
				);
				return new Response();
			});

			const qfetch = withCookie("data", "hello%20world")(fetchMock);

			// Act
			await qfetch("https://example.com");
		});

		test("handles empty cookie value", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async (_input, init) => {
				const headers = new Headers(init?.headers);
				ctx.assert.equal(
					headers.get("Cookie"),
					"empty=",
					"empty cookie value is set correctly",
				);
				return new Response();
			});

			const qfetch = withCookie("empty", "")(fetchMock);

			// Act
			await qfetch("https://example.com");
		});
	});
});

suite("withCookies - Unit", () => {
	describe("sets multiple cookies on outgoing requests", () => {
		test("sets multiple cookies from object", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async (_input, init) => {
				const headers = new Headers(init?.headers);
				ctx.assert.equal(
					headers.get("Cookie"),
					"session=abc123; theme=dark",
					"multiple cookies are set correctly",
				);
				return new Response();
			});

			const qfetch = withCookies({ session: "abc123", theme: "dark" })(
				fetchMock,
			);

			// Act
			await qfetch("https://example.com");
		});

		test("sets single cookie from object", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async (_input, init) => {
				const headers = new Headers(init?.headers);
				ctx.assert.equal(
					headers.get("Cookie"),
					"session=abc123",
					"single cookie from object is set correctly",
				);
				return new Response();
			});

			const qfetch = withCookies({ session: "abc123" })(fetchMock);

			// Act
			await qfetch("https://example.com");
		});

		test("sets cookies with Request object input", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.equal(
					(input as Request).headers.get("Cookie"),
					"session=abc123; theme=dark",
					"cookies are set on Request",
				);
				return new Response();
			});

			const qfetch = withCookies({ session: "abc123", theme: "dark" })(
				fetchMock,
			);

			// Act
			await qfetch(new Request("https://example.com"));
		});
	});

	describe("merges with existing Cookie headers", () => {
		test("appends to existing cookie header from init", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async (_input, init) => {
				const headers = new Headers(init?.headers);
				ctx.assert.equal(
					headers.get("Cookie"),
					"existing=value; session=abc123; theme=dark",
					"cookies are appended to existing header",
				);
				return new Response();
			});

			const qfetch = withCookies({ session: "abc123", theme: "dark" })(
				fetchMock,
			);

			// Act
			await qfetch("https://example.com", {
				headers: { Cookie: "existing=value" },
			});
		});

		test("appends to existing cookie header from Request object", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async (input) => {
				ctx.assert.equal(
					(input as Request).headers.get("Cookie"),
					"existing=value; session=abc123; theme=dark",
					"cookies are appended to existing Request header",
				);
				return new Response();
			});

			const qfetch = withCookies({ session: "abc123", theme: "dark" })(
				fetchMock,
			);

			// Act
			await qfetch(
				new Request("https://example.com", {
					headers: { Cookie: "existing=value" },
				}),
			);
		});
	});

	describe("handles edge cases", () => {
		test("handles empty cookies object", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async (_input, init) => {
				const headers = new Headers(init?.headers);
				ctx.assert.equal(
					headers.get("Cookie"),
					null,
					"no cookie header is set for empty object",
				);
				return new Response();
			});

			const qfetch = withCookies({})(fetchMock);

			// Act
			await qfetch("https://example.com");
		});

		test("preserves existing cookies when adding empty object", async (ctx: TestContext) => {
			// Arrange
			ctx.plan(1);
			const fetchMock = ctx.mock.fn(fetch, async (_input, init) => {
				const headers = new Headers(init?.headers);
				ctx.assert.equal(
					headers.get("Cookie"),
					"existing=value",
					"existing cookie is preserved",
				);
				return new Response();
			});

			const qfetch = withCookies({})(fetchMock);

			// Act
			await qfetch("https://example.com", {
				headers: { Cookie: "existing=value" },
			});
		});
	});
});
