import type { ApplicationStatus, Citizenship, DegreeLevel, Discipline, ProgramType } from "@internradar/domain";

/**
 * Plain-language names for the shared vocabularies. Records, so a new term in a vocabulary is a
 * compile error until it has a label here.
 */

export const DISCIPLINE_LABELS: Readonly<Record<Discipline, string>> = {
  computer_science: "Computer science",
  software_engineering: "Software engineering",
  information_systems: "Information systems",
  data_science: "Data science",
  mathematics_statistics: "Mathematics and statistics",
  physics: "Physics",
  engineering_electrical: "Electrical engineering",
  engineering_mechanical: "Mechanical engineering",
  engineering_civil: "Civil engineering",
  engineering_other: "Other engineering",
  science_other: "Other science",
  commerce_finance: "Commerce and finance",
  accounting: "Accounting",
  economics: "Economics",
  business_management: "Business and management",
  law: "Law",
};

export const DEGREE_LABELS: Readonly<Record<DegreeLevel, string>> = {
  undergraduate: "Undergraduate",
  honours: "Honours",
  masters_coursework: "Masters (coursework)",
  masters_research: "Masters (research)",
  phd: "PhD",
};

export const CITIZENSHIP_LABELS: Readonly<Record<Citizenship, string>> = {
  au_citizen: "Australian citizen",
  au_pr: "Australian permanent resident",
  nz_citizen: "New Zealand citizen",
  intl_student: "International student",
  other: "Other",
};

export const PROGRAM_TYPE_LABELS: Readonly<Record<ProgramType, string>> = {
  internship: "Internship",
  vacationer: "Vacationer",
  graduate: "Graduate",
  cadetship: "Cadetship",
  discovery: "Discovery",
};

export const APPLICATION_STATUS_LABELS: Readonly<Record<ApplicationStatus, string>> = {
  saved: "Saved",
  applied: "Applied",
  online_assessment: "Online assessment",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};
