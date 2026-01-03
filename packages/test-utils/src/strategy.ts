import type { TestContext } from "node:test";

import type { BackoffStrategy } from "@proventuslabs/retry-strategies";

/* node:coverage disable */

/**
 * Creates a mock strategy factory for testing retry behavior.
 * Returns delays from the provided array in sequence, then NaN when exhausted.
 */
export const createStrategyMock = (ctx: TestContext, delays: number[]) => {
	return ctx.mock.fn<() => BackoffStrategy>(() => {
		let callCount = 0;
		return {
			nextBackoff: ctx.mock.fn(() => {
				const delay = delays.at(callCount++);
				return delay ?? Number.NaN;
			}),
			resetBackoff: ctx.mock.fn(() => {}),
		};
	});
};
