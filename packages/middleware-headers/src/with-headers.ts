import type { Middleware } from "@qfetch/core";

/**
 * Header entries as name-value pairs.
 *
 * Each key is a header name and each value is the header value.
 * Header names are case-insensitive per HTTP specification.
 *
 * @example
 * ```ts
 * const headers: HeaderEntries = {
 *   "Content-Type": "application/json",
 *   "Accept": "application/json"
 * };
 * ```
 */
export type HeaderEntries = Record<string, string>;

/**
 * Supported input formats for headers.
 *
 * - `HeaderEntries`: Plain object with header name-value pairs
 * - `Headers`: Standard Web API Headers instance
 *
 * @example
 * ```ts
 * // Plain object
 * const headers: HeadersInput = { "Content-Type": "application/json" };
 *
 * // Headers instance
 * const headers: HeadersInput = new Headers({ "Content-Type": "application/json" });
 * ```
 */
export type HeadersInput = HeaderEntries | Headers;

/**
 * Checks if the input has an existing header (case-insensitive).
 *
 * @param input - The fetch input (string, URL, or Request)
 * @param init - Optional request initialization options
 * @param name - The header name to check
 * @returns True if the header exists in init or Request
 */
const hasHeader = (
	input: RequestInfo | URL,
	init: RequestInit | undefined,
	name: string,
): boolean => {
	// Check init headers first
	if (init?.headers) {
		const headers = new Headers(init.headers);
		if (headers.has(name)) {
			return true;
		}
	}

	// Check Request headers
	return input instanceof Request && input.headers.has(name);
};

/**
 * Normalizes HeadersInput to an iterable of [name, value] pairs.
 *
 * @param headers - The headers input (object or Headers instance)
 * @returns An iterable of [name, value] pairs
 */
const normalizeHeaders = (headers: HeadersInput): Array<[string, string]> => {
	if (headers instanceof Headers) {
		const entries: Array<[string, string]> = [];
		headers.forEach((value, name) => {
			entries.push([name, value]);
		});
		return entries;
	}
	return Object.entries(headers);
};

/**
 * Checks if the headers input is empty.
 *
 * @param headers - The headers input to check
 * @returns True if headers is empty or invalid
 */
const isHeadersEmpty = (headers: HeadersInput): boolean => {
	if (!headers) return true;

	if (headers instanceof Headers) {
		// Headers has no size property, check by iterating
		let hasAny = false;
		headers.forEach(() => {
			hasAny = true;
		});
		return !hasAny;
	}

	return (
		typeof headers !== "object" ||
		Array.isArray(headers) ||
		Object.keys(headers).length === 0
	);
};

/**
 * Merges middleware headers into init, respecting existing request headers.
 * Request headers take precedence - middleware headers are only added if
 * the header doesn't already exist.
 *
 * @param input - The fetch input (string, URL, or Request)
 * @param init - Optional request initialization options
 * @param middlewareHeaders - The headers to add
 * @returns New RequestInit with merged headers
 */
const mergeHeaders = (
	input: RequestInfo | URL,
	init: RequestInit | undefined,
	middlewareHeaders: HeadersInput,
): RequestInit => {
	const mergedHeaders = new Headers(init?.headers);

	// If input is a Request, copy its headers (init headers take precedence)
	if (input instanceof Request) {
		input.headers.forEach((value, name) => {
			if (!mergedHeaders.has(name)) {
				mergedHeaders.set(name, value);
			}
		});
	}

	// Add middleware headers only if not already present
	for (const [name, value] of normalizeHeaders(middlewareHeaders)) {
		if (!hasHeader(input, init, name)) {
			mergedHeaders.set(name, value);
		}
	}

	return { ...init, headers: mergedHeaders };
};

/**
 * Middleware that adds a single header to outgoing fetch requests.
 *
 * Sets a default header on outgoing requests. Request headers take precedence
 * over middleware headers - if the same header already exists in the request,
 * the middleware header is not applied.
 *
 * @remarks
 * **Header names:** Case-insensitive per HTTP specification. `Content-Type` and
 * `content-type` are treated as the same header.
 *
 * **Merge behavior:**
 * - Request headers take precedence (no override)
 * - Middleware headers are only added if not already present
 * - Works with both string URLs and Request objects
 *
 * @param name - The header name
 * @param value - The header value
 * @returns A fetch executor that adds the header to requests
 *
 * @example
 * ```ts
 * import { withHeader } from "@qfetch/middleware-headers";
 *
 * // Add Content-Type header
 * const qfetch = withHeader("Content-Type", "application/json")(fetch);
 * await qfetch("https://api.example.com/users");
 * // Request includes: Content-Type: application/json
 * ```
 *
 * @example
 * ```ts
 * import { withHeader } from "@qfetch/middleware-headers";
 * import { compose } from "@qfetch/core";
 *
 * // Compose multiple headers
 * const qfetch = compose(
 *   withHeader("Content-Type", "application/json"),
 *   withHeader("Accept", "application/json")
 * )(fetch);
 * ```
 *
 * @example
 * ```ts
 * import { withHeader } from "@qfetch/middleware-headers";
 *
 * // Request headers take precedence
 * const qfetch = withHeader("Content-Type", "application/json")(fetch);
 * await qfetch("https://api.example.com/users", {
 *   headers: { "Content-Type": "text/plain" }
 * });
 * // Request uses: Content-Type: text/plain (request value wins)
 * ```
 *
 * @see {@link withHeaders} for setting multiple headers at once
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Headers MDN: Headers}
 */
export const withHeader: Middleware<[name: string, value: string]> = (
	name,
	value,
) => {
	return (next) => async (input, init) => {
		// Skip if header already exists in request
		if (hasHeader(input, init, name)) {
			return next(input, init);
		}

		const mergedInit = mergeHeaders(input, init, { [name]: value });
		return next(input, mergedInit);
	};
};

/**
 * Middleware that adds multiple headers to outgoing fetch requests.
 *
 * Sets default headers on outgoing requests. Request headers take precedence
 * over middleware headers - if a header already exists in the request,
 * the middleware header is not applied.
 *
 * @remarks
 * **Input formats:**
 * - Plain object: `{ "Content-Type": "application/json" }`
 * - Headers instance: `new Headers({ "Content-Type": "application/json" })`
 *
 * **Header names:** Case-insensitive per HTTP specification. `Content-Type` and
 * `content-type` are treated as the same header.
 *
 * **Merge behavior:**
 * - Request headers take precedence (no override)
 * - Middleware headers are only added if not already present
 * - Empty headers object `{}` passes request through unchanged
 * - Works with both string URLs and Request objects
 *
 * @param headers - Object or Headers instance with header name-value pairs
 * @returns A fetch executor that adds the headers to requests
 *
 * @example
 * ```ts
 * import { withHeaders } from "@qfetch/middleware-headers";
 *
 * // Add multiple headers with plain object
 * const qfetch = withHeaders({
 *   "Content-Type": "application/json",
 *   "Accept": "application/json",
 *   "X-Request-ID": "abc123"
 * })(fetch);
 *
 * await qfetch("https://api.example.com/users");
 * ```
 *
 * @example
 * ```ts
 * import { withHeaders } from "@qfetch/middleware-headers";
 *
 * // Using Headers instance
 * const defaultHeaders = new Headers();
 * defaultHeaders.set("Content-Type", "application/json");
 * defaultHeaders.set("Accept", "application/json");
 *
 * const qfetch = withHeaders(defaultHeaders)(fetch);
 * ```
 *
 * @example
 * ```ts
 * import { withHeaders } from "@qfetch/middleware-headers";
 * import { withBaseUrl } from "@qfetch/middleware-base-url";
 * import { compose } from "@qfetch/core";
 *
 * // Composition with other middlewares
 * const qfetch = compose(
 *   withHeaders({
 *     "Content-Type": "application/json",
 *     "Accept": "application/json"
 *   }),
 *   withBaseUrl("https://api.example.com")
 * )(fetch);
 *
 * await qfetch("/users");
 * ```
 *
 * @see {@link withHeader} for setting a single header
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Headers MDN: Headers}
 */
export const withHeaders: Middleware<[headers: HeadersInput]> = (headers) => {
	// Fast path: empty headers (checked at creation time, not per-request)
	if (isHeadersEmpty(headers)) {
		return (next) => (input, init) => next(input, init);
	}

	return (next) => async (input, init) => {
		const mergedInit = mergeHeaders(input, init, headers);
		return next(input, mergedInit);
	};
};
