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
export type FetchFn = typeof fetch;

/**
 * A function that wraps a fetch function with middleware logic.
 *
 * @remarks
 * Middleware executors form the building blocks of the middleware chain. Each executor
 * receives the next function in the chain and returns a new fetch function with its
 * logic applied. This pattern enables request/response interception, transformation,
 * and error handling.
 *
 * @param next - The next fetch function in the middleware chain
 * @returns A new fetch function with the middleware applied
 *
 * @example
 * ```ts
 * // A simple logging middleware
 * function withLogger(): MiddlewareExecutor {
 *   return (next) => async (input, init) => {
 *     console.log("Request:", input);
 *     const response = await next(input, init);
 *     console.log("Response:", response.status);
 *     return response;
 *   };
 * }
 * ```
 */
export type MiddlewareExecutor = (next: FetchFn) => FetchFn;

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
export function compose(
	...middlewares: MiddlewareExecutor[]
): MiddlewareExecutor {
	return (baseFetch: FetchFn): FetchFn => {
		// Build the chain from right to left (last middleware wraps base fetch)
		return middlewares.reduce((next, current) => current(next), baseFetch);
	};
}

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
export function pipeline(
	...middlewares: MiddlewareExecutor[]
): MiddlewareExecutor {
	return (baseFetch: FetchFn): FetchFn => {
		// Build the chain from left to right (first middleware wraps base fetch)
		return middlewares.reduceRight((next, current) => current(next), baseFetch);
	};
}
