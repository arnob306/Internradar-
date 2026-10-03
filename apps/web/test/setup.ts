import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw-server";

// Component tests render into jsdom; clear the DOM after each so tests stay independent.
afterEach(cleanup);

// Any request without an explicit handler fails the test (test plan §8).
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
