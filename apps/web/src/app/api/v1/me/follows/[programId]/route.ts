import { followHandlersForRequest } from "../../../../../../server/follows/request-handlers";

// A student's own choices: read fresh on every request, never cached.
export const dynamic = "force-dynamic";

interface Context {
  readonly params: Promise<{ readonly programId: string }>;
}

export const PUT = async (request: Request, { params }: Context) =>
  followHandlersForRequest().follow(request, (await params).programId);
export const DELETE = async (request: Request, { params }: Context) =>
  followHandlersForRequest().unfollow(request, (await params).programId);
