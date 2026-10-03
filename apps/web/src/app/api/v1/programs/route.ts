import { createProgramsHandler } from "../../../../server/programs/programs-handler";
import { listPrograms } from "../../../../server/programs/list-programs";
import { createPublicClient } from "../../../../server/public-client";

// Reads the database on every request; the handler's own Cache-Control lets a CDN hold a good
// answer for a minute. All the logic is in the tested handler: this file only wires it up.
export const dynamic = "force-dynamic";

export const GET = createProgramsHandler({
  list: (query, today) => listPrograms(createPublicClient(), query, today),
  now: () => new Date(),
});
