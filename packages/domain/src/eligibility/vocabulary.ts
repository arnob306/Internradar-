/** Matches the citizenship enum in the database. Optional on a profile (decision D3). */
export const CITIZENSHIPS = ["au_citizen", "au_pr", "nz_citizen", "intl_student", "other"] as const;
export type Citizenship = (typeof CITIZENSHIPS)[number];

/** Matches the degree_level enum in the database. */
export const DEGREE_LEVELS = [
  "undergraduate",
  "honours",
  "masters_coursework",
  "masters_research",
  "phd",
] as const;
export type DegreeLevel = (typeof DEGREE_LEVELS)[number];

/**
 * The frozen discipline vocabulary (decision D2). A rule names disciplines from this list,
 * and a student picks from it. Free text is never guessed at: unmapped text is dealt with
 * where it enters the system, so this engine only ever sees these terms.
 * Changing the list means migrating every stored rule, so it is deliberately short.
 */
export const DISCIPLINES = [
  "computer_science",
  "software_engineering",
  "information_systems",
  "data_science",
  "mathematics_statistics",
  "physics",
  "engineering_electrical",
  "engineering_mechanical",
  "engineering_civil",
  "engineering_other",
  "science_other",
  "commerce_finance",
  "accounting",
  "economics",
  "business_management",
  "law",
] as const;

export type Discipline = (typeof DISCIPLINES)[number];

/** Named sets a rule can use instead of listing every term. */
export const DISCIPLINE_GROUPS = {
  stem_any: [
    "computer_science",
    "software_engineering",
    "information_systems",
    "data_science",
    "mathematics_statistics",
    "physics",
    "engineering_electrical",
    "engineering_mechanical",
    "engineering_civil",
    "engineering_other",
    "science_other",
  ],
} as const satisfies Record<string, readonly Discipline[]>;

export type DisciplineGroup = keyof typeof DISCIPLINE_GROUPS;

/** What a rule may name: a single discipline or a group. */
export type DisciplineTerm = Discipline | DisciplineGroup;

const DISCIPLINE_SET: ReadonlySet<string> = new Set(DISCIPLINES);

export function isDiscipline(value: string): value is Discipline {
  return DISCIPLINE_SET.has(value);
}

/** Turns a rule's terms into the set of single disciplines they cover. */
export function expandDisciplines(terms: readonly DisciplineTerm[]): ReadonlySet<Discipline> {
  const expanded = new Set<Discipline>();
  for (const term of terms) {
    if (isDiscipline(term)) {
      expanded.add(term);
    } else {
      for (const member of DISCIPLINE_GROUPS[term]) {
        expanded.add(member);
      }
    }
  }
  return expanded;
}
