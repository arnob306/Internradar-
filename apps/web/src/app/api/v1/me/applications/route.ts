import { applicationHandlersForRequest } from "../../../../../server/applications/request-handlers";

// A student's own records: read fresh on every request, never cached.
export const dynamic = "force-dynamic";

export const GET = (request: Request) => applicationHandlersForRequest().list(request);
export const POST = (request: Request) => applicationHandlersForRequest().create(request);
