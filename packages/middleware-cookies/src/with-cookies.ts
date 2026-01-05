import type { FetchExecutor } from "@qfetch/core";

/**
 * Cookie entries as name-value pairs.
 *
 * Each key is a cookie name and each value is the cookie value.
 * Values are sent as-is without encoding - ensure values are properly
 * encoded if they contain special characters.
 *
 * @example
 * ```ts
 * const cookies: CookieEntries = {
 *   session: "abc123",
 *   theme: "dark",
 *   lang: "en-US"
 * };
 * ```
 */
export type CookieEntries = Record<string, string>;

/**
 * Serializes cookies object to Cookie header format.
 *
 * @param cookies - Object with cookie name-value pairs
 * @returns Cookie header string in `name=value; name=value` format
 */
const serializeCookies = (cookies: CookieEntries): string => {
	return Object.entries(cookies)
		.map(([name, value]) => `${name}=${value}`)
		.join("; ");
};

/**
 * Merges new cookies with existing Cookie header value.
 *
 * @param existing - Existing Cookie header value or null
 * @param newCookies - New cookies to append
 * @returns Merged cookie string
 */
const mergeCookies = (existing: string | null, newCookies: string): string => {
	if (!newCookies) return existing ?? "";
	if (!existing) return newCookies;
	return `${existing}; ${newCookies}`;
};

/**
 * Gets existing headers from input or init.
 *
 * @param input - Request input (string, URL, or Request)
 * @param init - Optional RequestInit with headers
 * @returns Headers source to use for building merged headers
 */
const getExistingHeaders = (
	input: RequestInfo | URL,
	init?: RequestInit,
): HeadersInit | undefined => {
	if (input instanceof Request) {
		return input.headers;
	}
	return init?.headers;
};

/**
 * Middleware that sets a single cookie on outgoing fetch requests.
 *
 * Adds a cookie to the `Cookie` header of outgoing requests. If the request
 * already has a `Cookie` header, the new cookie is appended to the existing
 * cookies.
 *
 * @remarks
 * **Server-side only:** In browsers, the `Cookie` header is a
 * {@link https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name forbidden header name}
 * and cannot be set manually. This middleware is intended for server-side
 * environments (Node.js, Deno, Bun, edge runtimes) where cookies need to be
 * forwarded or set programmatically.
 *
 * **Merge behavior:**
 * - If no `Cookie` header exists → sets `name=value`
 * - If `Cookie` header exists → appends `; name=value`
 *
 * **Input handling:**
 * - **String/URL inputs:** Cookie is added via `init.headers`
 * - **Request objects:** A new Request is created with merged headers
 *
 * @param name - The cookie name
 * @param value - The cookie value (sent as-is, encode if needed)
 * @returns A fetch executor that adds the cookie to requests
 *
 * @example
 * ```ts
 * import { withCookie } from "@qfetch/middleware-cookies";
 *
 * // Basic usage
 * const qfetch = withCookie("session", "abc123")(fetch);
 * await qfetch("https://api.example.com/data");
 * // → Cookie: session=abc123
 * ```
 *
 * @example
 * ```ts
 * import { withCookie } from "@qfetch/middleware-cookies";
 * import { compose } from "@qfetch/core";
 *
 * // Composition with multiple cookies
 * const qfetch = compose(
 *   withCookie("session", "abc123"),
 *   withCookie("theme", "dark")
 * )(fetch);
 * await qfetch("https://api.example.com/data");
 * // → Cookie: session=abc123; theme=dark
 * ```
 *
 * @see {@link withCookies} for setting multiple cookies at once
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cookie MDN: Cookie header}
 */
export const withCookie = (name: string, value: string): FetchExecutor => {
	const cookieString = `${name}=${value}`;

	return (next) => async (input, init) => {
		const headers = new Headers(getExistingHeaders(input, init));
		const existingCookie = headers.get("Cookie");
		headers.set("Cookie", mergeCookies(existingCookie, cookieString));

		if (input instanceof Request) {
			return next(new Request(input, { headers }));
		}
		return next(input, { ...init, headers });
	};
};

/**
 * Middleware that sets multiple cookies on outgoing fetch requests.
 *
 * Adds multiple cookies to the `Cookie` header of outgoing requests. If the
 * request already has a `Cookie` header, new cookies are appended to the
 * existing cookies.
 *
 * @remarks
 * **Server-side only:** In browsers, the `Cookie` header is a
 * {@link https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name forbidden header name}
 * and cannot be set manually. This middleware is intended for server-side
 * environments (Node.js, Deno, Bun, edge runtimes) where cookies need to be
 * forwarded or set programmatically.
 *
 * **Merge behavior:**
 * - If no `Cookie` header exists → sets `name1=value1; name2=value2`
 * - If `Cookie` header exists → appends `; name1=value1; name2=value2`
 *
 * **Input handling:**
 * - **String/URL inputs:** Cookies are added via `init.headers`
 * - **Request objects:** A new Request is created with merged headers
 *
 * @param cookies - Object with cookie name-value pairs. See {@link CookieEntries}.
 * @returns A fetch executor that adds the cookies to requests
 * @throws {TypeError} If the cookies object is empty
 *
 * @example
 * ```ts
 * import { withCookies } from "@qfetch/middleware-cookies";
 *
 * // Basic usage with multiple cookies
 * const qfetch = withCookies({
 *   session: "abc123",
 *   theme: "dark",
 *   lang: "en-US"
 * })(fetch);
 *
 * await qfetch("https://api.example.com/data");
 * // → Cookie: session=abc123; theme=dark; lang=en-US
 * ```
 *
 * @example
 * ```ts
 * import { withCookies } from "@qfetch/middleware-cookies";
 * import { compose } from "@qfetch/core";
 *
 * // Composition with other middlewares
 * const qfetch = compose(
 *   withCookies({ session: "abc123" }),
 *   withBaseUrl("https://api.example.com")
 * )(fetch);
 *
 * await qfetch("/data");
 * // → https://api.example.com/data with Cookie: session=abc123
 * ```
 *
 * @example
 * ```ts
 * import { withCookies } from "@qfetch/middleware-cookies";
 *
 * // Forwarding cookies from an incoming request (e.g., in a server handler)
 * function handleRequest(req: Request) {
 *   const cookies = parseCookies(req.headers.get("Cookie"));
 *   const qfetch = withCookies(cookies)(fetch);
 *   return qfetch("https://api.internal.com/data");
 * }
 * ```
 *
 * @see {@link withCookie} for setting a single cookie
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cookie MDN: Cookie header}
 */
export const withCookies = (cookies: CookieEntries): FetchExecutor => {
	if (!cookies || Object.keys(cookies).length === 0) {
		throw new TypeError("withCookies requires at least one cookie");
	}

	const cookieString = serializeCookies(cookies);

	return (next) => async (input, init) => {
		const headers = new Headers(getExistingHeaders(input, init));
		const existingCookie = headers.get("Cookie");
		headers.set("Cookie", mergeCookies(existingCookie, cookieString));

		const isRequest = input instanceof Request;
		return !isRequest
			? next(input, { ...init, headers })
			: next(new Request(input, { headers }));
	};
};
