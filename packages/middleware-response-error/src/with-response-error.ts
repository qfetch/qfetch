import type { Middleware } from "@qfetch/core";

/**
 * Function that creates an error from a response.
 * Can be sync or async to allow reading response body.
 *
 * @param response - The fetch response that triggered the error
 * @returns The error to throw, or a Promise resolving to the error
 */
export type ResponseErrorMapper = (
	response: Response,
) => unknown | Promise<unknown>;

/**
 * Configuration options for the {@link withResponseError} middleware.
 *
 * All options are optional, allowing zero-config usage that throws
 * {@link ResponseError} for any response with status code >= 400.
 */
export type ResponseErrorOptions = {
	/**
	 * Maps specific status codes to custom error mappers.
	 *
	 * When a response matches a status code in this map, the corresponding
	 * mapper function is called to create the error. This takes priority
	 * over {@link defaultMapper}.
	 *
	 * @example
	 * ```ts
	 * statusMap: new Map([
	 *   [404, (res) => new NotFoundError(res.url)],
	 *   [401, async (res) => new AuthError(await res.json())]
	 * ])
	 * ```
	 */
	statusMap?: Map<number, ResponseErrorMapper>;

	/**
	 * Creates errors for status codes not in {@link statusMap}.
	 *
	 * @default (response) => new ResponseError(response)
	 */
	defaultMapper?: ResponseErrorMapper;

	/**
	 * Determines whether to throw for a given status code.
	 *
	 * @default (code) => code >= 400
	 */
	throwOnStatusCode?: (code: number) => boolean;
};

/**
 * Default error thrown for failed HTTP responses.
 *
 * Contains response metadata for error handling. The full {@link Response}
 * object is preserved, allowing consumers to read the body if needed.
 *
 * @example
 * ```ts
 * try {
 *   await qfetch("/api/users/123");
 * } catch (error) {
 *   if (error instanceof ResponseError) {
 *     console.log(error.status); // 404
 *     console.log(error.url); // "/api/users/123"
 *     const body = await error.response.json();
 *   }
 * }
 * ```
 */
export class ResponseError extends Error {
	/**
	 * The HTTP status code of the response.
	 */
	readonly status: number;

	/**
	 * The HTTP status text of the response.
	 */
	readonly statusText: string;

	/**
	 * The URL of the request that failed.
	 */
	readonly url: string;

	/**
	 * The full response object, allowing body reading if needed.
	 */
	readonly response: Response;

	constructor(response: Response) {
		super(`HTTP ${response.status} ${response.statusText}: ${response.url}`);
		this.name = "ResponseError";
		this.status = response.status;
		this.statusText = response.statusText;
		this.url = response.url;
		this.response = response;
	}
}

/**
 * Middleware that throws errors for HTTP responses based on their status codes.
 *
 * By default, throws a {@link ResponseError} for any response with status code >= 400.
 * Provides flexible error customization through status-specific mappers and a default
 * fallback, allowing consumers to standardize error handling across their application.
 *
 * @remarks
 * Error mappers can be sync or async, allowing you to read the response body
 * when creating custom errors.
 *
 * @param opts - Configuration options. See {@link ResponseErrorOptions} for details.
 *
 * @example
 * ```ts
 * // Zero-config usage - throws ResponseError for status >= 400
 * const qfetch = withResponseError()(fetch);
 *
 * // Custom error mapping
 * const qfetch = withResponseError({
 *   statusMap: new Map([
 *     [404, (res) => new NotFoundError(res.url)],
 *     [401, async (res) => new AuthError(await res.json())]
 *   ]),
 *   throwOnStatusCode: (code) => code >= 400
 * })(fetch);
 * ```
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Response/ok MDN: Response.ok}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Status MDN: HTTP Status Codes}
 */
export const withResponseError: Middleware<[opts?: ResponseErrorOptions]> = (
	opts = {},
) => {
	const {
		statusMap = new Map(),
		defaultMapper = (response) => new ResponseError(response),
		throwOnStatusCode = (code) => code >= 400,
	} = opts;

	return (next) => async (input, init) => {
		const response = await next(input, init);

		// Check if this status code should throw
		if (!throwOnStatusCode(response.status)) {
			return response;
		}

		// Use specific mapper if available, otherwise default
		const mapper = statusMap.get(response.status) ?? defaultMapper;

		// Await mapper result (works for both sync and async)
		throw await mapper(response);
	};
};
