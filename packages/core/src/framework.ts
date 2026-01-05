/**
 * A function signature compatible with the native fetch API.
 *
 * @remarks
 * This type alias represents any function that conforms to the standard `fetch` signature,
 * accepting a `RequestInfo | URL` input and optional `RequestInit`, returning a `Promise<Response>`.
 *
 * @see {@link https://fetch.spec.whatwg.org/#fetch-method Fetch Standard}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch MDN: fetch()}
 */
export type FetchFunction = typeof fetch;

/**
 * A function that wraps a fetch function with middleware logic.
 *
 * @remarks
 * Executors form the building blocks of the middleware chain. Each executor receives
 * the next function in the chain and returns a new fetch function with its logic applied.
 * This pattern enables request/response interception, transformation, and error handling.
 *
 * @param next - The next fetch function in the middleware chain
 * @returns A new fetch function with the middleware applied
 */
export type FetchExecutor = (next: FetchFunction) => FetchFunction;

/**
 * A middleware factory that creates a {@link FetchExecutor}.
 *
 * @remarks
 * The generic parameter `T` is a tuple type representing the middleware arguments:
 * - `Middleware` (no generic) - no arguments, call with `()`
 * - `Middleware<[opts: Options]>` - single required argument
 * - `Middleware<[opts?: Options]>` - single optional argument
 * - `Middleware<[name: string, value: string]>` - multiple positional arguments
 * - `Middleware<[name: string, opts?: Options]>` - mixed required and optional
 *
 * Named tuple labels provide documentation for argument names.
 *
 * @template T - Tuple type representing the middleware arguments
 *
 * @example
 * ```ts
 * // No arguments
 * const withLogger: Middleware = () => (next) => (input, init) => {
 *   console.log("Request:", input);
 *   return next(input, init);
 * };
 *
 * // Single argument
 * const withBaseUrl: Middleware<[baseUrl: string | URL]> = (baseUrl) => ...
 *
 * // Multiple arguments
 * const withHeader: Middleware<[name: string, value: string]> = (name, value) => ...
 *
 * // Optional arguments
 * const withTimeout: Middleware<[ms: number, opts?: TimeoutOptions]> = (ms, opts?) => ...
 * ```
 */
export type Middleware<T extends unknown[] = []> = (...args: T) => FetchExecutor;

/**
 * Composes middleware executors in right-to-left order (functional composition).
 *
 * @remarks
 * The last middleware listed wraps outermost (runs first on request, last on response).
 * Request flow: last middleware → ... → first middleware → fetch.
 * Response flow: fetch → first middleware → ... → last middleware.
 *
 * @param middlewares - Array of middleware executors to compose
 * @returns A function that takes a base fetch and returns the composed fetch function
 *
 * @example
 * ```ts
 * const qfetch = compose(withRetry(), withLogger())(fetch);
 * // Request: logger → retry → fetch
 * ```
 */
export const compose = (...middlewares: FetchExecutor[]): FetchExecutor => {
	return (baseFetch: FetchFunction): FetchFunction => {
		// Build the chain from right to left (last middleware wraps base fetch)
		return middlewares.reduce((next, current) => current(next), baseFetch);
	};
};

/**
 * Composes middleware executors in left-to-right order (pipeline style).
 *
 * @remarks
 * The first middleware listed wraps outermost (runs first on request, last on response).
 * Request flow: first middleware → ... → last middleware → fetch.
 * Response flow: fetch → last middleware → ... → first middleware.
 *
 * @param middlewares - Array of middleware executors to compose
 * @returns A function that takes a base fetch and returns the pipelined fetch function
 *
 * @example
 * ```ts
 * const qfetch = pipeline(withLogger(), withRetry())(fetch);
 * // Request: logger → retry → fetch
 * ```
 */
export const pipeline = (...middlewares: FetchExecutor[]): FetchExecutor => {
	return (baseFetch: FetchFunction): FetchFunction => {
		// Build the chain from left to right (first middleware wraps base fetch)
		return middlewares.reduceRight((next, current) => current(next), baseFetch);
	};
};
