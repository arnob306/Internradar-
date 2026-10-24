import { safeExternalUrl } from "./detail-guards";

/** One step of an employer's application process, with the page that describes it. */
export interface ApplicationStage {
  readonly name: string;
  readonly description: string | null;
  readonly sourceUrl: string;
}

const MAX_STAGES = 12;
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 600;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseStage(value: unknown): ApplicationStage | null {
  if (!isRecord(value) || typeof value["name"] !== "string") {
    return null;
  }
  const name = value["name"].trim();
  // A stage that cannot say where it came from is not shown: the page never states a step it cannot source.
  const sourceUrl = safeExternalUrl(value["sourceUrl"]);
  if (name === "" || name.length > MAX_NAME_LENGTH || sourceUrl === null) {
    return null;
  }
  const description = typeof value["description"] === "string" ? value["description"].trim() : "";
  return {
    name,
    description: description === "" ? null : description.slice(0, MAX_DESCRIPTION_LENGTH),
    sourceUrl,
  };
}

/**
 * The stages stored for a program, as the page may show them. The column is data from the
 * database, so it is not trusted: anything malformed is dropped rather than shown, and a value
 * that is not a list is simply "no stages published".
 */
export function parseStages(value: unknown): readonly ApplicationStage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(parseStage)
    .filter((stage): stage is ApplicationStage => stage !== null)
    .slice(0, MAX_STAGES);
}
