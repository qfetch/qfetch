import { type BackoffStrategy, waitFor } from "@proventuslabs/retry-strategies";
import type { Middleware } from "@qfetch/core";

/**
 * Configuration options for the {@link withRetryStatus } middleware.
 *
 * Controls retry behavior for failed HTTP requests based on status codes. This middleware
 * automatically retries requests that fail with retryable status codes (408, 429, 500, 502, 503, 504)
 * using a configurable backoff strategy.
 *
 * @example
 * ```ts
 * import { LinearBackoff, upto } from "@proventuslabs/retry-strategies";
 *
 * // Linear backoff with unlimited retries (strategy determines when to stop)
 * const opts: RetryStatusOptions = {
 *   strategy: () => new LinearBackoff(1000, 10000)
 * };
 *
 * // Linear backoff with maximum 3 retries
 * const optsLimited: RetryStatusOptions = {
 *   strategy: () => upto(3, new LinearBackoff(1000, 10000))
 * };
 * ```
 */
export type RetryStatusOptions = {
	/**
	 * Factory function that creates a backoff strategy for retry delays.
	 *
	 * The strategy determines how long to wait between retry attempts and when to stop
	 * retrying (by returning `NaN`). A new strategy instance is created for each request
	 * chain to ensure independent retry timing.
	 *
	 * To limit the number of retries, wrap the strategy with the `upto()` function from
	 * `@proventuslabs/retry-strategies`:
	 *
	 * @example
	 * ```ts
	 * import { LinearBackoff, upto } from "@proventuslabs/retry-strategies";
	 *
	 * // Limit to 3 retries
	 * strategy: () => upto(3, new LinearBackoff(1000, 10000))
	 * ```
	 */
	strategy: () => BackoffStrategy;
};

/**
 * Middleware that automatically retries failed HTTP requests based on response status codes that
 * can be interpreted as transient errors.
 *
 * ### Behavioral summary
 * - **Automatic retry on transient failures**: Retries requests that fail with retryable
 *   status codes (408, 429, 500, 502, 503, 504). Successful responses (2xx) and non-retryable
 *   errors (e.g., 400, 401, 404, 501) are returned immediately without retries.
 * - **Configurable backoff strategy**: Uses a provided backoff strategy to compute delays
 *   between retry attempts. The strategy controls both the delay duration and when to stop
 *   retrying (by returning `NaN`).
 * - **Retry limit control**: Limit the number of retry attempts by wrapping your strategy
 *   with the `upto()` function from `@proventuslabs/retry-strategies`. The middleware
 *   continues retrying until the strategy returns `NaN`.
 * - **Request body cleanup**: Automatically cancels the response body stream before retrying
 *   to prevent memory leaks. This is a best-effort operation that won't block retries if
 *   cancellation fails.
 * - **AbortSignal support**: Respects `AbortSignal` from the request to allow cancellation
 *   during retry delays. If the signal is aborted, the wait is interrupted and an error
 *   is thrown.
 *
 * ### Retryable status codes
 * The following HTTP status codes trigger automatic retries (per [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#name-status-codes)):
 * - `408 Request Timeout`
 * - `429 Too Many Requests`
 * - `500 Internal Server Error`
 * - `502 Bad Gateway`
 * - `503 Service Unavailable`
 * - `504 Gateway Timeout`
 *
 * ### Important limitations
 * - **No automatic `Retry-After` header handling**: The middleware does not automatically
 *   parse or respect `Retry-After` response headers. The backoff strategy is solely responsible
 *   for computing retry delays. To respect `Retry-After` headers, use a separate middleware that
 *   parses the header and combines it with this middleware.
 * - **Non-idempotent requests**: The middleware retries all requests regardless of HTTP
 *   method. Be cautious when using with non-idempotent methods (POST, PATCH) as retries
 *   may cause duplicate operations if the initial request partially succeeded.
 * - **Request body consumption**: If the request has a body stream that can only be read
 *   once (e.g., a `ReadableStream`), retries will fail. Use repeatable body types
 *   (string, Blob, FormData) or implement request cloning separately.
 * - **Memory considerations**: Failed response bodies are cancelled before retrying, but
 *   if cancellation fails, the body may remain in memory until garbage collected.
 *
 * @param opts - Configuration parameters controlling retry behavior and backoff strategy.
 *               See {@link RetryStatusOptions} for details.
 *
 * @throws {unknown} The reason of the AbortSignal if the operation is aborted (generally {@link DOMException} `AbortError`).
 * @throws {RangeError} If the strategy delay exceeds INT32_MAX (2147483647ms, approximately 24.8 days).
 *
 * @example
 * ```ts
 * // Linear backoff with maximum 5 retries
 * import { withRetryStatus } from "@qfetch/middleware-retry-status";
 * import { LinearBackoff, upto } from "@proventuslabs/retry-strategies";
 *
 * const qfetch = withRetryStatus({
 *   strategy: () => upto(5, new LinearBackoff(1000, 10000))
 * })(fetch);
 *
 * const response = await qfetch("https://api.example.com/data");
 * ```
 *
 * @example
 * ```ts
 * // Linear backoff with unlimited retries
 * import { withRetryStatus } from "@qfetch/middleware-retry-status";
 * import { LinearBackoff } from "@proventuslabs/retry-strategies";
 *
 * const qfetch = withRetryStatus({
 *   strategy: () => new LinearBackoff(1000, 10000)
 * })(fetch);
 *
 * const response = await qfetch("https://api.example.com/data");
 * ```
 */
export const withRetryStatus: Middleware<RetryStatusOptions> = (opts) => {
	return (next) => async (input, init) => {
		// Extract the signal for this request
		const signal =
			init?.signal ?? (input instanceof Request ? input.signal : undefined);
		// Get a new strategy for this chain of retries
		const strategy = opts.strategy();

		let response = await next(input, init);

		while (true) {
			// If successful or not a retryable status, passthrough the response
			if (response.ok || !RETRYABLE_STATUSES.has(response.status)) break;

			// Compute the next backoff delay
			const delay = strategy.nextBackoff();

			// When the strategy says we should stop, passthrough the response
			if (Number.isNaN(delay)) break;

			// Consume the previous response body in case of retry - it is done before throws so that
			// we guarantee that the body is canceled in case of any error
			await response.body?.cancel("Retry scheduled").catch(() => {
				// Note: If cancellation fails, the response body may remain in memory until garbage collected,
				// potentially consuming resources. However, this is a best-effort cleanup that shouldn't block retries.
			});

			// Wait before retrying
			await waitFor(delay, signal);

			// Retry the original request
			response = await next(input, init);
		}

		return response;
	};
};

/**
 * HTTP status codes that indicate a retryable condition.
 * - `408 Request Timeout`
 * - `429 Too Many Requests`
 * - `500 Internal Server Error`
 * - `502 Bad Gateway`
 * - `503 Service Unavailable`
 * - `504 Gateway Timeout`
 */
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([
	408, 429, 500, 502, 503, 504,
]);
