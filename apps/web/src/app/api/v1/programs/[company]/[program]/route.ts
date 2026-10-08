import { getProgram } from "../../../../../../server/programs/list-programs";
import { createProgramHandler } from "../../../../../../server/programs/program-handler";
import { publicApiLimiter } from "../../../../../../server/programs/public-limiter";
import { createPublicClient } from "../../../../../../server/public-client";

// Reads the database on every request; the handler's own Cache-Control lets a CDN hold a good
// answer for a minute. All the logic is in the tested handler: this file only wires it up.
export const dynamic = "force-dynamic";

export const GET = createProgramHandler({
  get: (company, program, today) => getProgram(createPublicClient(), company, program, today),
  limit: publicApiLimiter,
  now: () => new Date(),
});
