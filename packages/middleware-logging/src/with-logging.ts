import type { Middleware } from "@qfetch/core";

/**
 * Log entry containing request and response information.
 *
 * @remarks
 * This type represents the structured data passed to the logger function,
 * providing comprehensive details about the HTTP transaction.
 */
export type LogEntry = {
	/**
	 * Request information captured before the fetch call.
	 */
	request: {
		/**
		 * The request URL as a string.
		 */
		url: string;
		/**
		 * The HTTP method (GET, POST, PUT, DELETE, etc.).
		 */
		method: string;
		/**
		 * Request headers as a plain object.
		 */
		headers: Record<string, string>;
	};
	/**
	 * Response information captured after the fetch call.
	 * Will be `undefined` if the request failed with an error.
	 */
	response?: {
		/**
		 * The HTTP status code.
		 */
		status: number;
		/**
		 * The HTTP status text.
		 */
		statusText: string;
		/**
		 * Response headers as a plain object.
		 */
		headers: Record<string, string>;
		/**
		 * Whether the response is considered successful (status 200-299).
		 */
		ok: boolean;
	};
	/**
	 * Error that occurred during the fetch, if any.
	 */
	error?: unknown;
	/**
	 * Duration of the request in milliseconds.
	 */
	durationMs: number;
	/**
	 * Timestamp when the request was initiated (ISO 8601 format).
	 */
	timestamp: string;
};

/**
 * Function signature for custom loggers.
 *
 * @param entry - The log entry containing request/response details
 */
export type Logger = (entry: LogEntry) => void;

/**
 * Configuration options for the {@link withLogging} middleware.
 *
 * @remarks
 * This middleware logs HTTP request and response information for debugging
 * and observability purposes. It captures timing, headers, status codes,
 * and any errors that occur during the request lifecycle.
 */
export type LoggingOptions = {
	/**
	 * Custom logger function to handle log entries.
	 *
	 * @remarks
	 * If not provided, logs are written to `console.log` in JSON format.
	 * Provide a custom logger to integrate with your logging infrastructure
	 * (e.g., Winston, Pino, or a remote logging service).
	 *
	 * @default console.log with JSON.stringify
	 */
	logger?: Logger;
	/**
	 * Whether to include request headers in the log entry.
	 *
	 * @remarks
	 * Set to `false` to exclude potentially sensitive header information
	 * like Authorization tokens from logs.
	 *
	 * @default true
	 */
	includeRequestHeaders?: boolean;
	/**
	 * Whether to include response headers in the log entry.
	 *
	 * @default true
	 */
	includeResponseHeaders?: boolean;
	/**
	 * List of header names to redact from logs.
	 *
	 * @remarks
	 * Matching is case-insensitive. Redacted headers will have their
	 * values replaced with "[REDACTED]".
	 *
	 * @default ["authorization", "cookie", "set-cookie"]
	 */
	redactHeaders?: ReadonlyArray<string>;
};

/**
 * Middleware that logs HTTP request and response information.
 *
 * @remarks
 * Captures comprehensive request/response data including timing, headers,
 * status codes, and errors. Useful for debugging, monitoring, and
 * observability in production environments.
 *
 * The middleware logs after the response is received (or an error occurs),
 * providing a complete picture of the HTTP transaction. Sensitive headers
 * like `Authorization` and `Cookie` are redacted by default.
 *
 * @param opts - Configuration options. See {@link LoggingOptions} for details.
 *
 * @example
 * ```ts
 * import { withLogging } from "@qfetch/middleware-logging";
 *
 * // Basic usage with default console logging
 * const qfetch = withLogging({})(fetch);
 *
 * // Custom logger integration
 * const qfetch = withLogging({
 *   logger: (entry) => myLogger.info("HTTP Request", entry),
 *   redactHeaders: ["authorization", "x-api-key"],
 * })(fetch);
 *
 * await qfetch("https://api.example.com/users");
 * ```
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API MDN: Fetch API}
 */
export const withLogging: Middleware<[opts?: LoggingOptions]> = (opts) => {
	const logger = opts?.logger ?? defaultLogger;
	const includeRequestHeaders = opts?.includeRequestHeaders ?? true;
	const includeResponseHeaders = opts?.includeResponseHeaders ?? true;
	const redactHeaders = new Set(
		(opts?.redactHeaders ?? DEFAULT_REDACT_HEADERS).map((h) => h.toLowerCase()),
	);

	return (next) => async (input, init) => {
		const timestamp = new Date().toISOString();
		const startTime = performance.now();

		// Extract request information
		const request = extractRequestInfo(input, init, {
			includeHeaders: includeRequestHeaders,
			redactHeaders,
		});

		let response: Response;
		let error: unknown;

		try {
			response = await next(input, init);
		} catch (err) {
			error = err;
			const durationMs = performance.now() - startTime;

			logger({
				request,
				error,
				durationMs,
				timestamp,
			});

			throw err;
		}

		const durationMs = performance.now() - startTime;

		// Log the entry
		logger({
			request,
			response: {
				status: response.status,
				statusText: response.statusText,
				headers: includeResponseHeaders
					? headersToObject(response.headers, redactHeaders)
					: {},
				ok: response.ok,
			},
			durationMs,
			timestamp,
		});

		return response;
	};
};

/**
 * Extract request information from fetch input and init.
 */
const extractRequestInfo = (
	input: RequestInfo | URL,
	init: RequestInit | undefined,
	opts: { includeHeaders: boolean; redactHeaders: Set<string> },
): LogEntry["request"] => {
	let url: string;
	let method: string;
	let headers: Record<string, string>;

	if (input instanceof Request) {
		url = input.url;
		method = init?.method ?? input.method;
		if (opts.includeHeaders) {
			// Merge Request headers with init headers (init takes precedence)
			const merged = new Headers(input.headers);
			if (init?.headers) {
				new Headers(init.headers).forEach((value, key) => {
					merged.set(key, value);
				});
			}
			headers = headersToObject(merged, opts.redactHeaders);
		} else {
			headers = {};
		}
	} else {
		url = input instanceof URL ? input.href : input;
		method = init?.method ?? "GET";
		headers = opts.includeHeaders
			? headersToObject(new Headers(init?.headers), opts.redactHeaders)
			: {};
	}

	return { url, method, headers };
};

/**
 * Convert Headers object to a plain object with redaction.
 */
const headersToObject = (
	headers: Headers,
	redactHeaders: Set<string>,
): Record<string, string> => {
	const result: Record<string, string> = {};
	headers.forEach((value, key) => {
		result[key] = redactHeaders.has(key.toLowerCase()) ? "[REDACTED]" : value;
	});
	return result;
};

/**
 * Default logger that outputs to console in JSON format.
 */
const defaultLogger: Logger = (entry) => {
	console.log(JSON.stringify(entry));
};

/**
 * Default headers to redact for security.
 */
const DEFAULT_REDACT_HEADERS: ReadonlyArray<string> = [
	"authorization",
	"cookie",
	"set-cookie",
];
