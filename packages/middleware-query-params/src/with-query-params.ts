import type { Middleware } from "@qfetch/core";

/**
 * A query parameter value - either a single string or an array of strings.
 *
 * @example
 * ```ts
 * const single: QueryParamValue = "foo";
 * const multiple: QueryParamValue = ["foo", "bar"];
 * ```
 */
export type QueryParamValue = string | string[];

/**
 * Query parameter entries as name-value pairs.
 *
 * Each key is a parameter name and each value is either a string or
 * an array of strings. Values are encoded using URLSearchParams.
 *
 * @example
 * ```ts
 * const params: QueryParamEntries = {
 *   page: "1",
 *   tags: ["foo", "bar"],
 *   search: "hello world"
 * };
 * ```
 */
export type QueryParamEntries = Record<string, QueryParamValue>;

/**
 * Configuration options for the {@link withQueryParams} middleware.
 *
 * @example
 * ```ts
 * // Use repeated keys for arrays (default)
 * const opts: QueryParamsOptions = { arrayFormat: 'repeat' };
 * // ?tags=foo&tags=bar
 *
 * // Use bracket notation for arrays
 * const opts: QueryParamsOptions = { arrayFormat: 'brackets' };
 * // ?tags[]=foo&tags[]=bar
 * ```
 */
export type QueryParamsOptions = {
	/**
	 * How to serialize array values in query parameters.
	 *
	 * - `'repeat'` (default): Repeats the key for each value (`?tags=a&tags=b`)
	 * - `'brackets'`: Appends `[]` to the key (`?tags[]=a&tags[]=b`)
	 *
	 * @default 'repeat'
	 */
	arrayFormat?: "repeat" | "brackets";
};

/**
 * Dummy base URL used for parsing relative URLs.
 * This is stripped when reconstructing the URL.
 */
const DUMMY_BASE = "http://localhost.example";

/**
 * Parses a URL string, handling both absolute and relative URLs.
 *
 * @param input - The URL string to parse
 * @returns The parsed URL and whether it was relative
 */
const parseUrl = (input: string): { url: URL; isRelative: boolean } => {
	try {
		return { url: new URL(input), isRelative: false };
	} catch {
		return { url: new URL(input, DUMMY_BASE), isRelative: true };
	}
};

/**
 * Reconstructs a URL string, preserving relative/absolute format.
 *
 * @param url - The URL object to reconstruct
 * @param isRelative - Whether the original URL was relative
 * @returns The reconstructed URL string
 */
const reconstructUrl = (url: URL, isRelative: boolean): string => {
	if (isRelative) {
		return `${url.pathname}${url.search}${url.hash}`;
	}
	return url.href;
};

/**
 * Extracts the URL string from a fetch input.
 *
 * @param input - The fetch input (string, URL, or Request)
 * @returns The URL string
 */
const getUrlString = (input: RequestInfo | URL): string => {
	if (typeof input === "string") {
		return input;
	}
	if (input instanceof URL) {
		return input.href;
	}
	return input.url;
};

/**
 * Merges middleware params with request params, giving request params precedence.
 * Middleware params are set first, then request params are appended.
 *
 * @param searchParams - The URLSearchParams to modify (will be cleared and rebuilt)
 * @param middlewareParams - The middleware parameters to set as defaults
 * @param arrayFormat - How to format array values
 */
const mergeParams = (
	searchParams: URLSearchParams,
	middlewareParams: QueryParamEntries,
	arrayFormat: "repeat" | "brackets",
): void => {
	// Save existing request params
	const requestParams = [...searchParams.entries()];

	// Clear searchParams
	requestParams.forEach(([key]) => void searchParams.delete(key));

	// Set middleware params first
	for (const [name, value] of Object.entries(middlewareParams)) {
		const values = Array.isArray(value) ? value : [value];
		if (values.length === 0) continue;
		const key =
			Array.isArray(value) && arrayFormat === "brackets" ? `${name}[]` : name;
		for (const v of values) {
			searchParams.append(key, v);
		}
	}

	// Append request params (takes precedence by appearing later)
	for (const [key, value] of requestParams) {
		searchParams.append(key, value);
	}
};

/**
 * Middleware that adds a single query parameter to outgoing fetch requests.
 *
 * Sets a default query parameter on outgoing requests. Request parameters
 * take precedence over middleware parameters when both exist.
 *
 * @remarks
 * **URL encoding:** Values are encoded using the standard URLSearchParams API,
 * which follows the application/x-www-form-urlencoded format.
 *
 * **Array handling:**
 * - `arrayFormat: 'repeat'` (default): `["a", "b"]` → `?tags=a&tags=b`
 * - `arrayFormat: 'brackets'`: `["a", "b"]` → `?tags[]=a&tags[]=b`
 * - Empty arrays are skipped entirely
 *
 * **Merge behavior:**
 * - Middleware params are set first as defaults
 * - Request params are appended after (taking precedence)
 * - Both values are kept when keys overlap (request value appears later)
 *
 * **Input handling:**
 * - **String inputs:** Returns modified string (preserves relative/absolute)
 * - **URL inputs:** Returns new URL object with modified searchParams
 * - **Request objects:** Returns new Request with modified URL
 *
 * @param name - The query parameter name
 * @param value - The query parameter value or array of values (encoded via URLSearchParams)
 * @param options - Optional configuration. See {@link QueryParamsOptions}.
 * @returns A fetch executor that adds the query parameter to requests
 *
 * @example
 * ```ts
 * import { withQueryParam } from "@qfetch/middleware-query-params";
 *
 * // Basic usage with single value
 * const qfetch = withQueryParam("page", "1")(fetch);
 * await qfetch("https://api.example.com/users");
 * // → https://api.example.com/users?page=1
 * ```
 *
 * @example
 * ```ts
 * import { withQueryParam } from "@qfetch/middleware-query-params";
 *
 * // Array values with repeated keys (default)
 * const qfetch = withQueryParam("tags", ["foo", "bar"])(fetch);
 * await qfetch("https://api.example.com/posts");
 * // → https://api.example.com/posts?tags=foo&tags=bar
 * ```
 *
 * @example
 * ```ts
 * import { withQueryParam } from "@qfetch/middleware-query-params";
 *
 * // Array values with bracket notation
 * const qfetch = withQueryParam("tags", ["foo", "bar"], { arrayFormat: "brackets" })(fetch);
 * await qfetch("https://api.example.com/posts");
 * // → https://api.example.com/posts?tags[]=foo&tags[]=bar
 * ```
 *
 * @example
 * ```ts
 * import { withQueryParam } from "@qfetch/middleware-query-params";
 * import { compose } from "@qfetch/core";
 *
 * // Composition with multiple params
 * const qfetch = compose(
 *   withQueryParam("page", "1"),
 *   withQueryParam("limit", "10")
 * )(fetch);
 * await qfetch("https://api.example.com/users");
 * // → https://api.example.com/users?page=1&limit=10
 * ```
 *
 * @see {@link withQueryParams} for setting multiple query parameters at once
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams MDN: URLSearchParams}
 */
export const withQueryParam: Middleware<
	[name: string, value: QueryParamValue, options?: QueryParamsOptions]
> = (name, value, options) => {
	const arrayFormat = options?.arrayFormat ?? "repeat";

	return (next) => async (input, init) => {
		const urlString = getUrlString(input);
		const { url, isRelative } = parseUrl(urlString);

		mergeParams(url.searchParams, { [name]: value }, arrayFormat);

		if (input instanceof Request) {
			const newUrl = reconstructUrl(url, isRelative);
			return next(new Request(newUrl, input), init);
		}

		if (input instanceof URL) {
			return next(new URL(url.href), init);
		}

		return next(reconstructUrl(url, isRelative), init);
	};
};

/**
 * Middleware that adds multiple query parameters to outgoing fetch requests.
 *
 * Sets default query parameters on outgoing requests. Request parameters
 * take precedence over middleware parameters when both exist.
 *
 * @remarks
 * **URL encoding:** Values are encoded using the standard URLSearchParams API,
 * which follows the application/x-www-form-urlencoded format.
 *
 * **Array handling:**
 * - `arrayFormat: 'repeat'` (default): `{ tags: ["a", "b"] }` → `?tags=a&tags=b`
 * - `arrayFormat: 'brackets'`: `{ tags: ["a", "b"] }` → `?tags[]=a&tags[]=b`
 * - Empty arrays are skipped entirely
 *
 * **Merge behavior:**
 * - Middleware params are set first as defaults
 * - Request params are appended after (taking precedence)
 * - Both values are kept when keys overlap (request value appears later)
 * - Empty params object `{}` passes request through unchanged
 *
 * **Input handling:**
 * - **String inputs:** Returns modified string (preserves relative/absolute)
 * - **URL inputs:** Returns new URL object with modified searchParams
 * - **Request objects:** Returns new Request with modified URL
 *
 * @param params - Object with parameter name-value pairs. See {@link QueryParamEntries}.
 * @param options - Optional configuration. See {@link QueryParamsOptions}.
 * @returns A fetch executor that adds the query parameters to requests
 *
 * @example
 * ```ts
 * import { withQueryParams } from "@qfetch/middleware-query-params";
 *
 * // Basic usage with multiple params
 * const qfetch = withQueryParams({
 *   page: "1",
 *   limit: "10",
 *   sort: "name"
 * })(fetch);
 *
 * await qfetch("https://api.example.com/users");
 * // → https://api.example.com/users?page=1&limit=10&sort=name
 * ```
 *
 * @example
 * ```ts
 * import { withQueryParams } from "@qfetch/middleware-query-params";
 *
 * // Array values with repeated keys (default)
 * const qfetch = withQueryParams({
 *   tags: ["typescript", "javascript"]
 * })(fetch);
 *
 * await qfetch("https://api.example.com/posts");
 * // → https://api.example.com/posts?tags=typescript&tags=javascript
 * ```
 *
 * @example
 * ```ts
 * import { withQueryParams } from "@qfetch/middleware-query-params";
 *
 * // Array values with bracket notation
 * const qfetch = withQueryParams(
 *   { tags: ["typescript", "javascript"] },
 *   { arrayFormat: 'brackets' }
 * )(fetch);
 *
 * await qfetch("https://api.example.com/posts");
 * // → https://api.example.com/posts?tags[]=typescript&tags[]=javascript
 * ```
 *
 * @example
 * ```ts
 * import { withQueryParams } from "@qfetch/middleware-query-params";
 * import { compose } from "@qfetch/core";
 *
 * // Composition with other middlewares
 * const qfetch = compose(
 *   withQueryParams({ api_key: "secret123" }),
 *   withBaseUrl("https://api.example.com")
 * )(fetch);
 *
 * await qfetch("/users");
 * // → https://api.example.com/users?api_key=secret123
 * ```
 *
 * @see {@link withQueryParam} for setting a single query parameter
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams MDN: URLSearchParams}
 */
export const withQueryParams: Middleware<
	[params: QueryParamEntries, options?: QueryParamsOptions]
> = (params, options) => {
	const arrayFormat = options?.arrayFormat ?? "repeat";

	// Fast path: empty params (checked at creation time, not per-request)
	const isParamsEmpty = Object.keys(params).length === 0;
	if (isParamsEmpty) {
		return (next) => (input, init) => next(input, init);
	}

	return (next) => async (input, init) => {
		const urlString = getUrlString(input);
		const { url, isRelative } = parseUrl(urlString);

		mergeParams(url.searchParams, params, arrayFormat);

		if (input instanceof Request) {
			const newUrl = reconstructUrl(url, isRelative);
			return next(new Request(newUrl, input), init);
		}

		if (input instanceof URL) {
			return next(new URL(url.href), init);
		}

		return next(reconstructUrl(url, isRelative), init);
	};
};
