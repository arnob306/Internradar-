import { applicationHandlersForRequest } from "../../../../../../server/applications/request-handlers";

// A student's own records: read fresh on every request, never cached.
export const dynamic = "force-dynamic";

interface Context {
  readonly params: Promise<{ readonly id: string }>;
}

export const GET = async (request: Request, { params }: Context) =>
  applicationHandlersForRequest().get(request, (await params).id);
export const PATCH = async (request: Request, { params }: Context) =>
  applicationHandlersForRequest().patch(request, (await params).id);
export const DELETE = async (request: Request, { params }: Context) =>
  applicationHandlersForRequest().remove(request, (await params).id);
