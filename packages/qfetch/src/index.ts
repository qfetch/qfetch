/**
 * qfetch - Composable fetch middlewares
 *
 * This package re-exports core utilities and all official qfetch middlewares.
 *
 * @example
 * ```ts
 * import {
 *   compose,
 *   withAuthorization,
 *   withBaseUrl,
 *   withHeaders,
 *   withQueryParams,
 *   withRetryAfter,
 *   withRetryStatus,
 * } from "qfetch";
 *
 * const qfetch = compose(
 *   withRetryStatus({ statuses: [500, 502, 503] }),
 *   withRetryAfter(),
 *   withHeaders({ "Content-Type": "application/json" }),
 *   withBaseUrl("https://api.example.com")
 * )(fetch);
 * ```
 */

// Core
export * from "@qfetch/core";
// Middlewares
export * from "@qfetch/middleware-authorization";
export * from "@qfetch/middleware-base-url";
export * from "@qfetch/middleware-headers";
export * from "@qfetch/middleware-query-params";
export * from "@qfetch/middleware-retry-after";
export * from "@qfetch/middleware-retry-status";
