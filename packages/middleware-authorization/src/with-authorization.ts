import { type BackoffStrategy, waitFor } from "@proventuslabs/retry-strategies";
import type { Middleware } from "@qfetch/core";

/**
 * Token credentials returned by a {@link TokenProvider}.
 *
 * Contains both the access token value and its type (authorization scheme),
 * allowing full control over the `Authorization` header format.
 *
 * @example
 * ```ts
 * const token: AuthorizationToken = {
 *   accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
 *   tokenType: "Bearer"
 * };
 * // Results in header: "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 * ```
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc6750.html RFC 6750 - Bearer Token Usage}
 * @see {@link https://www.rfc-editor.org/rfc/rfc7617.html RFC 7617 - Basic Authentication}
 */
export type AuthorizationToken = {
	/**
	 * The credential value to include in the `Authorization` header.
	 *
	 * This is the actual token string (e.g., JWT, API key, base64-encoded credentials).
	 */
	accessToken: string;

	/**
	 * The authorization scheme (e.g., `"Bearer"`, `"Basic"`, `"Token"`).
	 *
	 * Combined with `accessToken` to form the header value: `<tokenType> <accessToken>`.
	 *
	 * @see {@link https://www.iana.org/assignments/http-authschemes/http-authschemes.xhtml IANA HTTP Authentication Schemes}
	 */
	tokenType: string;
};

/**
 * Provider interface for retrieving authorization credentials.
 *
 * Implement this interface to supply tokens to the {@link withAuthorization} middleware.
 * The provider is called before each request and on retry after 401 responses,
 * allowing for token refresh or rotation.
 *
 * @example
 * ```ts
 * // Static token provider
 * const staticProvider: TokenProvider = {
 *   getToken: async () => ({
 *     accessToken: "my-api-key",
 *     tokenType: "Bearer"
 *   })
 * };
 * ```
 *
 * @example
 * ```ts
 * // Refreshing token provider (e.g., for OAuth)
 * class OAuthTokenProvider implements TokenProvider {
 *   private accessToken: string;
 *   private refreshToken: string;
 *
 *   async getToken(): Promise<AuthorizationToken> {
 *     if (this.isExpired()) {
 *       await this.refresh();
 *     }
 *     return { accessToken: this.accessToken, tokenType: "Bearer" };
 *   }
 * }
 * ```
 */
export type TokenProvider = {
	/**
	 * Retrieves the current authorization credentials.
	 *
	 * Called before each request and before each retry attempt on 401 responses.
	 * Implementations may return cached tokens or fetch fresh ones as needed.
	 *
	 * @returns A promise resolving to the authorization token credentials.
	 * @throws If token retrieval fails, the error propagates to the caller.
	 */
	getToken(): Promise<AuthorizationToken>;
};

/**
 * Configuration options for the {@link withAuthorization} middleware.
 *
 * @remarks
 * This middleware handles automatic authorization header injection and retry
 * on `401 Unauthorized` responses. The {@link TokenProvider} interface allows
 * integration with any authentication system (static tokens, JWT refresh, OAuth flows).
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110.html#name-401-unauthorized RFC 9110 - 401 Unauthorized}
 * @see {@link https://www.rfc-editor.org/rfc/rfc6750.html RFC 6750 - Bearer Token Usage}
 */
export type AuthorizationOptions = {
	/**
	 * Provider instance that supplies authorization credentials.
	 *
	 * Called before each request to retrieve the current token. On 401 responses,
	 * the provider is called again before retry, allowing token refresh.
	 *
	 * @example
	 * ```ts
	 * tokenProvider: {
	 *   getToken: async () => ({
	 *     accessToken: await fetchNewToken(),
	 *     tokenType: "Bearer"
	 *   })
	 * }
	 * ```
	 */
	tokenProvider: TokenProvider;

	/**
	 * Factory function that creates a backoff strategy for 401 retry delays.
	 *
	 * The strategy determines the delay between retry attempts and when to stop retrying
	 * (by returning `NaN`). Wrap with `upto()` to limit retry attempts.
	 *
	 * @example
	 * ```typescript
	 * import { linear, upto } from "@proventuslabs/retry-strategies";
	 *
	 * // Retry up to 3 times with increasing delays
	 * strategy: () => upto(3, linear(100, 1000))
	 * ```
	 */
	strategy: () => BackoffStrategy;
};

/**
 * Middleware that injects authorization headers and retries on 401 responses.
 *
 * @remarks
 * Injects `Authorization` headers using a {@link TokenProvider} interface. When a
 * `401 Unauthorized` response is received, the middleware calls the token provider
 * again (allowing token refresh) and retries according to the configured backoff
 * strategy. Existing `Authorization` headers are respected and not overridden.
 *
 * Only `401` status triggers retry; other error statuses pass through unchanged.
 *
 * @param opts - Configuration parameters. See {@link AuthorizationOptions} for details.
 *
 * @throws {TypeError} If the token provider returns an invalid token (missing properties).
 * @throws {unknown} If the token provider throws an error during `getToken()`.
 * @throws {unknown} If the request's `AbortSignal` is aborted during retry delay.
 * @throws {RangeError} If the strategy delay exceeds maximum safe timeout (~24.8 days).
 *
 * @example
 * ```ts
 * import { withAuthorization } from "@qfetch/middleware-authorization";
 * import { constant, upto } from "@proventuslabs/retry-strategies";
 *
 * const qfetch = withAuthorization({
 *   tokenProvider: {
 *     getToken: async () => ({
 *       accessToken: "my-token",
 *       tokenType: "Bearer"
 *     })
 *   },
 *   strategy: () => upto(1, constant(0))
 * })(fetch);
 * ```
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110.html#name-401-unauthorized RFC 9110 - 401 Unauthorized}
 * @see {@link https://www.rfc-editor.org/rfc/rfc6750.html RFC 6750 - Bearer Token Usage}
 */
export const withAuthorization: Middleware<[opts: AuthorizationOptions]> = (
	opts,
) => {
	const { tokenProvider } = opts;

	return (next) => async (input, init) => {
		// Extract the signal for this request
		const signal =
			init?.signal ?? (input instanceof Request ? input.signal : undefined);
		// Get a new strategy for this chain of retries
		const strategy = opts.strategy();

		// Check if Authorization header already exists
		const hasExistingAuth = hasAuthorizationHeader(input, init);

		// Make the initial request - preserve existing auth header or inject new token
		let response = hasExistingAuth
			? await next(input, init)
			: await next(
					input,
					await prepareAuthorization(input, init, tokenProvider),
				);

		while (true) {
			// If not a 401 Unauthorized, return the response
			if (response.status !== HTTP_STATUS_UNAUTHORIZED) break;

			// Compute the next backoff delay
			const delay = strategy.nextBackoff();

			// When the strategy says we should stop, return the response
			if (Number.isNaN(delay)) break;

			// Consume the previous response body before retry
			await response.body?.cancel(CANCEL_REASON).catch(() => {
				// Note: If cancellation fails, the response body may remain in memory until garbage collected,
				// potentially consuming resources. However, this is a best-effort cleanup that shouldn't block retries.
			});

			// Wait before retrying (allows for token refresh time if needed)
			await waitFor(delay, signal);

			// Retry with fresh token from provider
			response = await next(
				input,
				await prepareAuthorization(input, init, tokenProvider),
			);
		}

		return response;
	};
};

/**
 * Prepares a RequestInit with the Authorization header injected.
 *
 * @param input - The request URL or Request object.
 * @param init - Optional request initialization options.
 * @param tokenProvider - The token provider instance.
 * @returns The RequestInit with Authorization header.
 */
const prepareAuthorization = async (
	input: RequestInfo | URL,
	init: RequestInit | undefined,
	tokenProvider: TokenProvider,
): Promise<RequestInit> => {
	// Get token from provider
	const token = await tokenProvider.getToken();

	// Validate token
	validateToken(token);

	// Construct the Authorization header value
	const authHeaderValue = `${token.tokenType} ${token.accessToken}`;

	// Create new headers with Authorization
	const headers = new Headers(init?.headers);

	// If using Request object, merge its headers
	if (input instanceof Request) {
		input.headers.forEach((value, key) => {
			if (!headers.has(key)) {
				headers.set(key, value);
			}
		});
	}

	// Set the Authorization header
	headers.set(AUTHORIZATION_HEADER, authHeaderValue);

	return { ...init, headers };
};

/**
 * Checks if an Authorization header already exists in the request.
 *
 * @param input - The request URL or Request object.
 * @param init - Optional request initialization options.
 * @returns True if an Authorization header exists.
 */
const hasAuthorizationHeader = (
	input: RequestInfo | URL,
	init?: RequestInit,
): boolean => {
	// Check init headers
	if (init?.headers) {
		const headers = new Headers(init.headers);
		if (headers.has(AUTHORIZATION_HEADER)) {
			return true;
		}
	}

	return input instanceof Request && input.headers.has(AUTHORIZATION_HEADER);
};

/**
 * Validates that the token object has the required properties.
 *
 * @param token - The token to validate.
 * @throws {TypeError} If the token is invalid.
 */
const validateToken: (
	token: AuthorizationToken,
) => asserts token is AuthorizationToken = (token) => {
	if (
		typeof token !== "object" ||
		token === null ||
		typeof token.accessToken !== "string" ||
		typeof token.tokenType !== "string"
	) {
		throw new TypeError(
			"TokenProvider.getToken() must return an object with 'accessToken' (string) and 'tokenType' (string) properties",
		);
	}
};

/**
 * The reason passed to body cancellation.
 */
const CANCEL_REASON = "Retry scheduled";

/**
 * The `Authorization` HTTP request header name.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110.html#name-authorization RFC 9110 - Authorization}
 */
const AUTHORIZATION_HEADER = "Authorization";

/**
 * HTTP 401 Unauthorized status code.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110.html#name-401-unauthorized RFC 9110 - 401 Unauthorized}
 */
const HTTP_STATUS_UNAUTHORIZED = 401;
