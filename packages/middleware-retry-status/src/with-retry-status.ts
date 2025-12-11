import { type BackoffStrategy, waitFor } from "@proventuslabs/retry-strategies";
import type { Middleware } from "@qfetch/core";

/**
 * Configuration options for the {@link withRetryStatus} middleware.
 *
 * Controls retry behavior for requests with retryable status codes.
 */
export type RetryStatusOptions = {
	/**
	 * Factory function that creates a backoff strategy for retry delays.
	 *
	 * The strategy determines the delay between retry attempts and when to stop retrying
	 * (by returning `NaN`). Wrap with `upto()` to limit retry attempts.
	 *
	 * @example
	 * ```typescript
	 * import { linear, upto } from "@proventuslabs/retry-strategies";
	 *
	 * strategy: () => upto(3, linear(1000, 10_000))
	 * ```
	 */
	strategy: () => BackoffStrategy;

	/**
	 * Set of HTTP status codes that should trigger automatic retries.
	 *
	 * Defaults to the standard retryable status codes: `408`, `429`, `500`, `502`, `503`, `504`.
	 * Override to customize which status codes should be retried.
	 *
	 * @default new Set([408, 429, 500, 502, 503, 504])
	 */
	retryableStatuses?: ReadonlySet<number>;
};

/**
 * Middleware that automatically retries HTTP requests based on response status codes.
 *
 * Retries requests that fail with specific HTTP status codes (by default `408 Request Timeout`,
 * `429 Too Many Requests`, `500 Internal Server Error`, `502 Bad Gateway`, `503 Service Unavailable`,
 * and `504 Gateway Timeout`) using configurable backoff strategies per
 * [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#name-status-codes).
 *
 * The middleware waits for the strategy's backoff delay, then retries the request. Use the strategy
 * to control retry limits (strategy returns `NaN` to stop). Successful responses (2xx) and
 * non-retryable status codes are returned immediately without retrying.
 *
 * @param opts - Configuration parameters. See {@link RetryStatusOptions} for details.
 * @param opts.strategy - Factory function creating a backoff strategy for retry delays.
 * @param opts.retryableStatuses - Set of HTTP status codes that trigger retries (default: `408`, `429`, `500`, `502`, `503`, `504`).
 *
 * @throws {unknown} If the request's `AbortSignal` is aborted during retry delay.
 * @throws {RangeError} If the strategy delay exceeds INT32_MAX (2147483647ms).
 *
 * @example Basic usage with default retryable statuses
 * ```ts
 * import { withRetryStatus } from "@qfetch/middleware-retry-status";
 * import { linear, upto } from "@proventuslabs/retry-strategies";
 *
 * const qfetch = withRetryStatus({
 *   strategy: () => upto(3, linear(1000, 10_000))
 * })(fetch);
 *
 * const response = await qfetch("https://api.example.com/data");
 * ```
 *
 * @example Custom retryable status codes
 * ```ts
 * import { withRetryStatus } from "@qfetch/middleware-retry-status";
 * import { exponential, upto } from "@proventuslabs/retry-strategies";
 *
 * // Retry on 429, 502 (Bad Gateway), and 503 (Service Unavailable)
 * const qfetch = withRetryStatus({
 *   strategy: () => upto(3, exponential(500, 5000, 2)),
 *   retryableStatuses: new Set([429, 502, 503])
 * })(fetch);
 *
 * const response = await qfetch("https://api.example.com/data");
 * ```
 */
export const withRetryStatus: Middleware<RetryStatusOptions> = (opts) => {
	// Get the set of retryable status codes, defaulting to the standard set
	const retryableStatuses =
		opts.retryableStatuses ?? DEFAULT_RETRYABLE_STATUSES;

	return (next) => async (input, init) => {
		// Extract the signal for this request
		const signal =
			init?.signal ?? (input instanceof Request ? input.signal : undefined);
		// Get a new strategy for this chain of retries
		const strategy = opts.strategy();

		let response = await next(input, init);

		while (true) {
			// If successful or not a retryable status, passthrough the response
			if (response.ok || !retryableStatuses.has(response.status)) break;

			// Compute the next backoff delay
			const delay = strategy.nextBackoff();

			// When the strategy says we should stop, passthrough the response
			if (Number.isNaN(delay)) break;

			// Consume the previous response body in case of retry - it is done before throws so that
			// we guarantee that the body is canceled in case of any error
			await response.body?.cancel(CANCEL_REASON).catch(() => {
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
 * The reason passed to body cancellation.
 */
export const CANCEL_REASON = "Retry scheduled";

/**
 * Default HTTP status codes that indicate a retryable condition.
 * - `408 Request Timeout`
 * - `429 Too Many Requests`
 * - `500 Internal Server Error`
 * - `502 Bad Gateway`
 * - `503 Service Unavailable`
 * - `504 Gateway Timeout`
 */
const DEFAULT_RETRYABLE_STATUSES: ReadonlySet<number> = new Set([
	408, 429, 500, 502, 503, 504,
]);
