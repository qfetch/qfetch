import type { Middleware } from "@qfetch/core";

type _FetchParameters = Parameters<typeof fetch>;
type _FetchReturn = Awaited<ReturnType<typeof fetch>>;

/**
 * Configuration options for the {@link withRetryAfter} middleware.
 *
 * These options control how the middleware interprets and enforces
 * retry behavior when a downstream service responds with an HTTP
 * `Retry-After` header for retryable status codes (429 or 503).
 *
 * @example
 * ```ts
 * const opts: RetryAfterOptions = {
 *   maxRetries: 3,
 *   maxDelayTime: 120_000, // 120 seconds in milliseconds
 * };
 * ```
 */
export type RetryAfterOptions = {
	/**
	 * The maximum number of retry attempts allowed when the downstream
	 * service responds with a retryable status (429 or 503) and a valid
	 * `Retry-After` header.
	 *
	 * - A non-numeric, negative, or `null` value disables retries entirely.
	 *
	 * @default 0 (no retries)
	 *
	 * @example
	 * ```ts
	 * { maxRetries: 3 } // up to 3 retry attempts
	 * ```
	 */
	maxRetries?: number;

	/**
	 * The maximum allowable delay duration (in milliseconds) for a single
	 * retry attempt. If the server’s specified `Retry-After` value exceeds
	 * this ceiling, the middleware raises an error and stops execution.
	 *
	 * - A non-numeric, negative, or `null` value means no ceiling is enforced.
	 * - If unset, long delays are permitted.
	 *
	 * @default undefined (no maximum)
	 *
	 * @example
	 * ```ts
	 * { maxDelayTime: 120_000 } // 120 seconds maximum delay
	 * ```
	 */
	maxDelayTime?: number;
};

/**
 * Middleware that automatically retries failed HTTP requests
 * based on the `Retry-After` header, following the semantics defined
 * in [RFC 9110 §10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3).
 *
 * This middleware applies retry logic only for responses with status
 * `429 (Too Many Requests)` or `503 (Service Unavailable)`. It interprets
 * the `Retry-After` header, calculates the appropriate delay, waits for
 * that duration, and retries the original request — up to the configured
 * maximum number of attempts and within the configured maximum wait time.
 *
 * ### Behavior summary
 * - Successful responses are passed through unchanged, even if they
 *   include a `Retry-After` header.
 * - Invalid or missing `Retry-After` headers result in no retry.
 * - Numeric `Retry-After` values represent seconds.
 * - HTTP-date `Retry-After` values are interpreted as an absolute future
 *   time; past or present dates result in a zero-delay retry.
 * - Exceeding `maxDelayTime` raises an `AbortError`.
 * - Exceeding `maxRetries` stops retrying and returns the last response.
 *
 * @example
 * ```ts
 * import { withRetryAfter } from "@qfetch/middleware-retry-after";
 *
 * const qfetch = withRetryAfter({ maxRetries: 3, maxDelayTime: 120_000 })(fetch);
 *
 * const response = await qfetch("https://api.example.com/data");
 * ```
 *
 * @param opts - Optional retry configuration. See {@link RetryAfterOptions}.
 * @returns A middleware function compatible with `@qfetch/core` that
 *          transparently applies retry logic based on the `Retry-After` header.
 */
export const withRetryAfter: Middleware<RetryAfterOptions | undefined> = (
	opts = {},
) => {
	const statuses = new Set([429, 503]);
	const header = "Retry-After";

	let { maxRetries = 0, maxDelayTime } = opts;
	if (typeof maxRetries !== "number") maxRetries = 0;
	if (typeof maxDelayTime !== "number") maxDelayTime = undefined;

	return (next) => async (input, init) => {
		let response = await next(input, init);

		for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
			// If successful or not a retryable status, passthrough the response
			if (response.ok || !statuses.has(response.status)) {
				break;
			}

			// Check for Retry-After header
			const delay = parseRetryAfter(response.headers.get(header));

			// If no Retry-After header, passthrough the response
			if (delay === null) break;

			// Enforce ceiling on retry delay
			if (maxDelayTime !== undefined && delay > maxDelayTime)
				throw new DOMException(
					`Exceeded maximum ceiling for Retry-After value: expected up to ${maxDelayTime}, received ${delay}`,
					"AbortError",
				);

			// Wait before retrying (zero or negative number executes immediately)
			await waitFor(delay);

			// Retry the original request
			response = await next(input, init);
		}

		return response;
	};
};

/**
 * Wait for the specified amount of time.
 *
 * @param delay - Duration to wait in milliseconds. Negative values are treated as zero.
 * @returns A promise that resolves after the delay has elapsed.
 */
const waitFor = (delay: number): Promise<void> => {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, delay);
	});
};

/**
 * Parses a `Retry-After` header according to RFC 9110 §10.2.3.
 *
 * - If the value is an integer, it is interpreted as a delay in seconds.
 * - If the value is an HTTP-date, it is interpreted as the difference
 *   between that time and the current time (in milliseconds).
 * - Invalid, malformed, or past-date values return `null` or `0` as appropriate.
 *
 * @param value - The raw `Retry-After` header value.
 * @returns The delay duration in milliseconds, or `null` if invalid.
 */
const parseRetryAfter = (value: string | null): null | number => {
	if (value === null) return null;

	const asNumeric = new Number(value);
	if (!Number.isNaN(asNumeric) && Number.isSafeInteger(asNumeric)) {
		return asNumeric.valueOf() * 1000; // convert seconds to milliseconds
	}

	const asDate = new Date(value);
	if (!Number.isNaN(asDate.getTime())) {
		return asDate.getTime() - Date.now();
	}

	return null;
};
