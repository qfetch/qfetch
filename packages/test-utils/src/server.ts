import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer, type Server } from "node:http";
import type { TestContext } from "node:test";

/* node:coverage disable */

export interface ServerContext {
	server: Server;
	baseUrl: string;
}

export type RequestHandler = (
	req: IncomingMessage,
	res: ServerResponse,
) => void;

/**
 * Creates an isolated HTTP server for a single test.
 * Each test gets its own server on a random port to enable concurrent execution.
 * The server is automatically closed when the test completes.
 */
export const createTestServer = async (
	ctx: TestContext,
	handler?: RequestHandler,
): Promise<ServerContext> => {
	const server = createServer((req, res) => {
		if (handler) {
			handler(req, res);
			return;
		}

		// Default handler
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ message: "Success!" }));
	});

	const baseUrl = await new Promise<string>((resolve, reject) => {
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address && typeof address === "object") {
				resolve(`http://127.0.0.1:${address.port}`);
			} else {
				reject(new Error("Failed to get server address"));
			}
		});

		server.on("error", reject);
	});

	ctx.after(() => {
		return new Promise<void>((resolve) => {
			server.close(() => resolve());
		});
	});

	return { server, baseUrl };
};
