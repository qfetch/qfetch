import type { FetchExecutor } from "@qfetch/core";

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
 * Appends query parameters to a URL's searchParams.
 *
 * @param searchParams - The URLSearchParams to modify
 * @param params - The parameters to append
 * @param arrayFormat - How to format array values
 */
const appendParams = (
	searchParams: URLSearchParams,
	params: QueryParamEntries,
	arrayFormat: "repeat" | "brackets",
): void => {
	for (const [name, value] of Object.entries(params)) {
		if (Array.isArray(value)) {
			if (value.length === 0) continue;
			const key = arrayFormat === "brackets" ? `${name}[]` : name;
			for (const v of value) {
				searchParams.append(key, v);
			}
		} else {
			searchParams.append(name, value);
		}
	}
};

/**
 * Middleware that adds a single query parameter to outgoing fetch requests.
 *
 * Appends a query parameter to the URL of outgoing requests. If the URL
 * already has query parameters, the new parameter is appended to the existing
 * ones.
 *
 * @remarks
 * **URL encoding:** Values are encoded using the standard URLSearchParams API,
 * which follows the application/x-www-form-urlencoded format.
 *
 * **Merge behavior:**
 * - If no query string exists → sets `?name=value`
 * - If query string exists → appends `&name=value`
 * - Duplicate keys are allowed (both values are kept)
 *
 * **Input handling:**
 * - **String inputs:** Returns modified string (preserves relative/absolute)
 * - **URL inputs:** Returns new URL object with modified searchParams
 * - **Request objects:** Returns new Request with modified URL
 *
 * @param name - The query parameter name
 * @param value - The query parameter value (encoded via URLSearchParams)
 * @returns A fetch executor that adds the query parameter to requests
 *
 * @example
 * ```ts
 * import { withQueryParam } from "@qfetch/middleware-query-params";
 *
 * // Basic usage
 * const qfetch = withQueryParam("page", "1")(fetch);
 * await qfetch("https://api.example.com/users");
 * // → https://api.example.com/users?page=1
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
export const withQueryParam = (name: string, value: string): FetchExecutor => {
	return (next) => async (input, init) => {
		const urlString = getUrlString(input);
		const { url, isRelative } = parseUrl(urlString);

		url.searchParams.append(name, value);

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
 * Appends multiple query parameters to the URL of outgoing requests. If the
 * URL already has query parameters, new parameters are appended to the
 * existing ones.
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
 * - Existing query parameters are preserved
 * - New parameters are appended
 * - Duplicate keys are allowed (both values are kept)
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
export const withQueryParams = (
	params: QueryParamEntries,
	options?: QueryParamsOptions,
): FetchExecutor => {
	const arrayFormat = options?.arrayFormat ?? "repeat";

	// Fast path: empty params (checked at creation time, not per-request)
	const isParamsEmpty = Object.keys(params).length === 0;
	if (isParamsEmpty) {
		return (next) => (input, init) => next(input, init);
	}

	return (next) => async (input, init) => {
		const urlString = getUrlString(input);
		const { url, isRelative } = parseUrl(urlString);

		appendParams(url.searchParams, params, arrayFormat);

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
