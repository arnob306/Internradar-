import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw-server";

// Any request without an explicit handler fails the test (test plan §8).
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
