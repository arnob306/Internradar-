import { applicationHandlersForRequest } from "../../../../../../../server/applications/request-handlers";

// A student's own records: read fresh on every request, never cached.
export const dynamic = "force-dynamic";

interface Context {
  readonly params: Promise<{ readonly id: string }>;
}

export const POST = async (request: Request, { params }: Context) =>
  applicationHandlersForRequest().undo(request, (await params).id);
