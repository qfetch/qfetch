/* node:coverage disable */

/**
 * Flushes all pending microtasks for predictable async behavior in tests.
 * Useful when testing code that uses setTimeout with mocked timers.
 */
export const flushMicrotasks = () =>
	new Promise((resolve) => setImmediate(resolve));
