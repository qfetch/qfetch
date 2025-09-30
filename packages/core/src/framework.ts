/**
 * A function signature compatible with the native fetch API
 */
export type FetchFunction = typeof fetch;

/**
 * A function that wraps a fetch function with middleware logic
 * @param next - The next fetch function in the middleware chain
 * @returns A new fetch function with the middleware applied
 */
export type FetchExecutor = (next: FetchFunction) => FetchFunction;

/**
 * A middleware factory that creates a MiddlewareExecutor
 * - If no options are needed, returns a function that creates the executor
 * - If options are optional, accepts an optional parameter
 * - If options are required, requires the parameter
 *
 * @template T - The type of options the middleware accepts
 * @example
 * ```typescript
 * // No options middleware
 * const withLogger: Middleware = () => (next) => (input, init) => {
 *   console.log('Request:', input);
 *   return next(input, init);
 * };
 *
 * // With options middleware
 * const withRetry: Middleware<{ maxRetries: number }> = (opts) => (next) =>
 *   async (input, init) => {
 *     for (let i = 0; i <= opts.maxRetries; i++) {
 *       try { return await next(input, init); }
 *       catch (e) { if (i === opts.maxRetries) throw e; }
 *     }
 *   };
 * ```
 */
export type Middleware<T = never> = [T] extends [never]
	? () => FetchExecutor
	: undefined extends T
		? (opts?: T) => FetchExecutor
		: (opts: T) => FetchExecutor;

/**
 * Composes multiple middleware executors into a single fetch function,
 * but applies them in right-to-left order (composition style).
 *
 * This means the last middleware in the list receives the request first
 * and is closest to the base fetch, wrapping back to the first middleware.
 *
 * @param middlewares - Array of middleware executors to compose
 * @returns A function that takes a base fetch and returns the composed fetch function
 *
 * @example
 * ```typescript
 * const qfetch = compose(
 *   withLogger(),
 *   withRetry({ maxRetries: 3 })
 * )(fetch);
 *
 * // retries -> logs
 * ```
 */
export const compose = (...middlewares: FetchExecutor[]): FetchExecutor => {
	return (baseFetch: FetchFunction): FetchFunction => {
		// Build the chain from right to left (last middleware wraps base fetch)
		return middlewares.reduce((next, current) => current(next), baseFetch);
	};
};

/**
 * Composes multiple middleware executors into a single fetch function,
 * but applies them in left-to-right order (pipeline style).
 *
 * This means the first middleware receives the request first,
 * and the last middleware wraps closest to the base fetch.
 *
 * @param middlewares - Array of middleware executors to compose
 * @returns A function that takes a base fetch and returns the pipelined fetch function
 *
 * @example
 * ```typescript
 * const qfetch = pipeline(
 *   withLogger(),
 *   withRetry({ maxRetries: 3 })
 * )(fetch);
 *
 * // logs -> retries
 * ```
 */
export const pipeline = (...middlewares: FetchExecutor[]): FetchExecutor => {
	return (baseFetch: FetchFunction): FetchFunction => {
		// Build the chain from left to right (first middleware wraps base fetch)
		return middlewares.reduceRight((next, current) => current(next), baseFetch);
	};
};

// TODO: should we decorate and add a `context` key so middleware can store data cross-middleware per request?
// declare global {
// 	interface RequestInit {
// 		context?: Record<string, unknown>;
// 	}
// }
