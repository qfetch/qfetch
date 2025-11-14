import type { Middleware } from "@qfetch/core";

/**
 * Configuration options for the {@link withRetryAfter} middleware.
 *
 * These options control how the middleware interprets and enforces
 * retry behavior when a downstream service responds with an HTTP
 * `Retry-After` header for retryable status codes (429 or 503).
 *
 * @example
 * ```ts
 * // Unlimited retries with delay ceiling
 * const opts: RetryAfterOptions = {
 *   maxDelayTime: 120_000, // 120 seconds in milliseconds
 * };
 * ```
 *
 * @example
 * ```ts
 * // Limited retries with unlimited delay
 * const opts: RetryAfterOptions = {
 *   maxRetries: 3,
 * };
 * ```
 *
 * @example
 * ```ts
 * // Both limits enforced
 * const opts: RetryAfterOptions = {
 *   maxRetries: 3,
 *   maxDelayTime: 120_000,
 * };
 * ```
 */
export type RetryAfterOptions = {
	/**
	 * The maximum number of retry attempts allowed when the downstream
	 * service responds with a retryable status (429 or 503) and a valid
	 * `Retry-After` header.
	 *
	 * - `0` means no retries at all (fail immediately on first error).
	 * - Positive integers (`>= 1`) limit the number of retry attempts.
	 * - Negative or non-numeric values mean unlimited retries.
	 * - `undefined` means unlimited retries (default behavior).
	 *
	 * @default undefined (unlimited retries)
	 *
	 * @example
	 * ```ts
	 * { maxRetries: 0 }         // no retries at all
	 * { maxRetries: 3 }         // up to 3 retry attempts
	 * { maxRetries: -5 }        // unlimited retries
	 * { maxRetries: undefined } // unlimited retries (default)
	 * ```
	 */
	maxRetries?: number;

	/**
	 * The maximum allowable delay duration (in milliseconds) for a single
	 * retry attempt. If the server's specified `Retry-After` value exceeds
	 * this ceiling, the middleware throws a `DOMException` with name `"AbortError"`
	 * and stops execution.
	 *
	 * - `0` means retry only instant requests (delay must be 0ms, otherwise abort).
	 * - Positive integers (`>= 1`) set a ceiling on retry delay duration.
	 * - Negative or non-numeric values mean unlimited delay waiting.
	 * - `undefined` means unlimited delay (default behavior).
	 *
	 * @default undefined (unlimited delay)
	 *
	 * @example
	 * ```ts
	 * { maxDelayTime: 0 }         // retry only instant requests
	 * { maxDelayTime: 120_000 }   // 120 seconds maximum delay
	 * { maxDelayTime: -100 }      // unlimited delay
	 * { maxDelayTime: undefined } // unlimited delay (default)
	 * ```
	 */
	maxDelayTime?: number;
};

/**
 * Middleware that automatically retries failed HTTP requests
 * in accordance with the semantics of the `Retry-After` header as defined in
 * [RFC 9110 §10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3).
 *
 * This middleware applies retry logic exclusively to responses with status codes
 * `429 (Too Many Requests)` or `503 (Service Unavailable)`. Upon receiving such a
 * response, it interprets the `Retry-After` header to determine the appropriate
 * delay interval, waits for that duration, and subsequently reissues
 * the original request — up to the configured maximum number of attempts and
 * within the specified maximum delay time per retry.
 *
 * ### Behavioral summary
 * - **Successful responses** (2xx) are propagated unchanged, even if a `Retry-After`
 *   header is present.
 * - **Missing or invalid `Retry-After` headers** result in no retry; the error response
 *   is returned immediately.
 * - **Numeric `Retry-After` values** are treated as delay-seconds (converted to milliseconds).
 *   Only non-negative integers matching `/^\d+$/` are valid.
 * - **HTTP-date `Retry-After` values** are interpreted as an absolute timestamp in IMF-fixdate format.
 *   Times in the past or present result in zero-delay (immediate retry).
 * - **Exceeding `maxDelayTime`**: If the computed delay exceeds the configured ceiling,
 *   a `DOMException` with name `"AbortError"` is thrown and no retry occurs.
 * - **Exceeding `maxRetries`**: Once the retry limit is reached, the middleware returns the
 *   last received response without further retries.
 * - **Default behavior**: Without configuration, the middleware retries indefinitely with
 *   unlimited delay waiting (use with caution).
 *
 * ### Important limitations
 * **Requests with streaming bodies** (e.g., `ReadableStream`) cannot be retried per the
 * standard Fetch API specification. Attempting to retry such requests will result in a
 * `TypeError` being thrown. To support retries for streamed requests, consider using an
 * additional middleware that provides a *body stream factory* capable of recreating the
 * stream for each retry attempt.
 *
 * @example
 * ```ts
 * // Unlimited retries (use with caution)
 * import { withRetryAfter } from "@qfetch/middleware-retry-after";
 *
 * const qfetch = withRetryAfter()(fetch);
 * const response = await qfetch("https://api.example.com/data");
 * ```
 *
 * @example
 * ```ts
 * // Limited retries with delay ceiling
 * import { withRetryAfter } from "@qfetch/middleware-retry-after";
 *
 * const qfetch = withRetryAfter({
 *   maxRetries: 3,
 *   maxDelayTime: 120_000, // 2 minutes
 * })(fetch);
 *
 * const response = await qfetch("https://api.example.com/data");
 * ```
 *
 * @param opts - Optional configuration parameters controlling retry behavior.
 *               See {@link RetryAfterOptions} for details.
 * @returns A middleware function compatible with `@qfetch/core` that transparently
 *          applies retry logic based on the `Retry-After` response header.
 */
export const withRetryAfter: Middleware<RetryAfterOptions | undefined> = (
	opts = {},
) => {
	const statuses = new Set([429, 503]);
	const header = "Retry-After";

	const maxRetries =
		typeof opts.maxRetries === "number" &&
		opts.maxRetries >= 0 &&
		!Number.isNaN(opts.maxRetries)
			? opts.maxRetries
			: undefined;

	const maxDelayTime =
		typeof opts.maxDelayTime === "number" &&
		opts.maxDelayTime >= 0 &&
		!Number.isNaN(opts.maxDelayTime)
			? opts.maxDelayTime
			: undefined;

	return (next) => async (input, init) => {
		let response = await next(input, init);

		for (
			let attempt = 0;
			maxRetries === undefined || attempt < maxRetries;
			attempt += 1
		) {
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

			// Consume the previous response body to free resources
			// Note: If cancellation fails, the response body may remain in memory until garbage collected,
			// potentially consuming resources. However, this is a best-effort cleanup that shouldn't block retries.
			await response.body?.cancel("Retry scheduled").catch(() => {
				// Errors are swallowed as cleanup is best-effort and shouldn't block retries
			});

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
 * Regular expression matching a `Retry-After` header value expressed as
 * *delta-seconds*, as defined in [RFC 9110 §10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3).
 *
 * A valid delta-seconds value consists solely of one or more ASCII digits.
 * Example: `"120"`.
 *
 * @see RFC 9110 §10.2.3 — Retry-After
 */
const RFC_9110_DELTA_SECONDS = /^\d+$/;

/**
 * Regular expression matching a `Retry-After` header value expressed as an
 * *HTTP-date*, in the IMF-fixdate format defined by
 * [RFC 9110 §5.6.7](https://www.rfc-editor.org/rfc/rfc9110.html#section-5.6.7).
 *
 * This format corresponds to dates such as `"Wed, 21 Oct 2015 07:28:00 GMT"`.
 * The pattern enforces:
 * - A three-letter weekday abbreviation with an initial capital (e.g. `Mon`–`Sun`)
 * - A two-digit day, three-letter month, four-digit year
 * - A 24-hour time in `HH:MM:SS` format
 * - A literal `"GMT"` timezone designator
 *
 * @see RFC 9110 §5.6.7 — Date/Time Formats
 * @see RFC 9110 §10.2.3 — Retry-After
 */
const RFC_9110_HTTP_DATE =
	/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;

/**
 * Maximum signed 32-bit integer (2^31 − 1).
 *
 * Used to ensure values passed to `setTimeout` do not exceed the maximum
 * 32-bit range. `setTimeout` clamps delays above this limit, which cause
 * them to be set to `1` (immediate).
 */
const INT32_MAX = 0x7fffffff;

/**
 * Parses a `Retry-After` header according to RFC 9110 §10.2.3.
 *
 * - If the value is an integer, it is interpreted as a delay in seconds since the parsing.
 * - If the value is an HTTP-date, it is interpreted as the difference
 *   between that time and the current time.
 * - Invalid values return `null`.
 *
 * @param value - The raw `Retry-After` header value.
 * @returns The delay duration in milliseconds, or `null` if invalid.
 */
const parseRetryAfter = (value: string | null): null | number => {
	if (value === null) return null;

	if (RFC_9110_DELTA_SECONDS.test(value)) {
		const seconds = Number(value);
		const milliseconds = seconds * 1000;
		return Number.isSafeInteger(milliseconds) && milliseconds <= INT32_MAX
			? milliseconds
			: null;
	}

	if (RFC_9110_HTTP_DATE.test(value)) {
		const date = new Date(value);
		const difference = Math.max(0, date.getTime() - Date.now());
		return Number.isSafeInteger(difference) && difference <= INT32_MAX
			? difference
			: null;
	}

	return null;
};
