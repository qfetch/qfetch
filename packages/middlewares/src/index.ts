/**
 * @qfetch/middlewares - Collection of all qfetch middlewares
 *
 * This package re-exports all official qfetch middlewares for convenience.
 *
 * @example
 * ```ts
 * import {
 *   withAuthorization,
 *   withBaseUrl,
 *   withHeaders,
 *   withQueryParams,
 *   withResponseError,
 *   withRetryAfter,
 *   withRetryStatus,
 * } from "@qfetch/middlewares";
 * import { compose } from "@qfetch/core";
 *
 * const qfetch = compose(
 *   withResponseError(),
 *   withRetryStatus({ statuses: [500, 502, 503] }),
 *   withRetryAfter(),
 *   withHeaders({ "Content-Type": "application/json" }),
 *   withBaseUrl("https://api.example.com")
 * )(fetch);
 * ```
 */

export * from "@qfetch/middleware-authorization";
export * from "@qfetch/middleware-base-url";
export * from "@qfetch/middleware-headers";
export * from "@qfetch/middleware-query-params";
export * from "@qfetch/middleware-response-error";
export * from "@qfetch/middleware-retry-after";
export * from "@qfetch/middleware-retry-status";
