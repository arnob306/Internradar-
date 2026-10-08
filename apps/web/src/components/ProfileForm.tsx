"use client";

import {
  CITIZENSHIPS,
  DEGREE_LEVELS,
  DISCIPLINES,
  type Discipline,
  type Month,
} from "@internradar/domain";
import { useId, useState, type FormEvent, type ReactElement } from "react";
import type { ProfileInput } from "../features/profile/profile-input";
import { CITIZENSHIP_LABELS, DEGREE_LABELS, DISCIPLINE_LABELS } from "../features/vocabulary-labels";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MAX_DISCIPLINES = 6;
const YEARS_AHEAD = 8;

const MESSAGES = {
  halfDate: "Choose both a month and a year, or leave both empty.",
  rateLimited: "You're saving too quickly. Wait a minute, then try again.",
  failed: "We couldn't save your profile. Try again in a moment.",
} as const;

interface ProfileFormProps {
  readonly initial: ProfileInput;
  /** Passed in, not read from the clock, so the list of years is the same on server and client. */
  readonly currentYear: number;
}

type Status = "idle" | "saving" | "saved" | "signed-out";
type Problems = Readonly<Record<string, string>>;

export function ProfileForm({ initial, currentYear }: ProfileFormProps): ReactElement {
  const prefix = useId();
  const [month, setMonth] = useState(initial.expectedGraduation?.month.toString() ?? "");
  const [year, setYear] = useState(initial.expectedGraduation?.year.toString() ?? "");
  const [degreeLevel, setDegreeLevel] = useState<string>(initial.degreeLevel ?? "");
  const [disciplines, setDisciplines] = useState<readonly Discipline[]>(initial.disciplines);
  const [isDoubleDegree, setIsDoubleDegree] = useState(initial.isDoubleDegree);
  const [planningHonours, setPlanningHonours] = useState(initial.planningHonours);
  const [citizenship, setCitizenship] = useState<string>(initial.citizenship ?? "");
  const [university, setUniversity] = useState(initial.university ?? "");
  const [emailAlerts, setEmailAlerts] = useState(initial.emailAlerts);
  const [status, setStatus] = useState<Status>("idle");
  const [problems, setProblems] = useState<Problems>({});
  const [formProblem, setFormProblem] = useState<string | null>(null);

  const years = new Set<number>();
  for (let offset = 0; offset <= YEARS_AHEAD; offset++) {
    years.add(currentYear + offset);
  }
  if (initial.expectedGraduation !== null) {
    years.add(initial.expectedGraduation.year);
  }
  const atLimit = disciplines.length >= MAX_DISCIPLINES;

  const problemId = (field: string): string => `${prefix}-${field}`;
  const describe = (field: string): { "aria-invalid"?: true; "aria-describedby"?: string } =>
    problems[field] === undefined ? {} : { "aria-invalid": true, "aria-describedby": problemId(field) };
  const fieldProblem = (field: string): ReactElement | null =>
    problems[field] === undefined ? null : (
      <p id={problemId(field)} className="field-problem" role="alert">
        {problems[field]}
      </p>
    );

  function toggle(discipline: Discipline): void {
    setDisciplines((chosen) =>
      chosen.includes(discipline) ? chosen.filter((item) => item !== discipline) : [...chosen, discipline],
    );
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (status === "saving") {
      return;
    }
    setProblems({});
    setFormProblem(null);
    if ((month === "") !== (year === "")) {
      setProblems({ expectedGraduation: MESSAGES.halfDate });
      return;
    }

    setStatus("saving");
    const profile = {
      expectedGraduation: month === "" ? null : { year: Number(year), month: Number(month) as Month },
      degreeLevel: degreeLevel === "" ? null : degreeLevel,
      disciplines,
      isDoubleDegree,
      planningHonours,
      citizenship: citizenship === "" ? null : citizenship,
      university: university === "" ? null : university,
      emailAlerts,
    };
    try {
      const response = await fetch("/api/v1/me/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (response.ok) {
        setStatus("saved");
        return;
      }
      setStatus("idle");
      if (response.status === 401) {
        setStatus("signed-out");
      } else if (response.status === 400) {
        const body = (await response.json()) as { error?: { fields?: { field: string; message: string }[] } };
        setProblems(Object.fromEntries((body.error?.fields ?? []).map(({ field, message }) => [field, message])));
      } else {
        setFormProblem(response.status === 429 ? MESSAGES.rateLimited : MESSAGES.failed);
      }
    } catch {
      setStatus("idle");
      setFormProblem(MESSAGES.failed);
    }
  }

  return (
    <form className="profile-form" onSubmit={save} noValidate>
      <fieldset>
        <legend>When you finish</legend>
        <p className="hint muted">
          Choose when you finish the last degree you will finish. If you plan an honours year, use the end of honours.
        </p>
        <div className="row">
          <div className="field">
            <label htmlFor={`${prefix}-month`}>Graduation month</label>
            <select
              id={`${prefix}-month`}
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              {...describe("expectedGraduation")}
            >
              <option value="">Month</option>
              {MONTHS.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${prefix}-year`}>Graduation year</label>
            <select
              id={`${prefix}-year`}
              value={year}
              onChange={(event) => setYear(event.target.value)}
              {...describe("expectedGraduation")}
            >
              <option value="">Year</option>
              {[...years]
                .sort((a, b) => a - b)
                .map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
            </select>
          </div>
        </div>
        {fieldProblem("expectedGraduation")}
        <label className="check">
          <input type="checkbox" checked={planningHonours} onChange={(e) => setPlanningHonours(e.target.checked)} />
          I&apos;m planning an honours year after this degree
        </label>
        <label className="check">
          <input type="checkbox" checked={isDoubleDegree} onChange={(e) => setIsDoubleDegree(e.target.checked)} />
          I&apos;m doing a double degree
        </label>
      </fieldset>

      <fieldset>
        <legend>Your degree</legend>
        <div className="field">
          <label htmlFor={`${prefix}-level`}>Degree level</label>
          <select
            id={`${prefix}-level`}
            value={degreeLevel}
            onChange={(event) => setDegreeLevel(event.target.value)}
            {...describe("degreeLevel")}
          >
            <option value="">Choose one</option>
            {DEGREE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {DEGREE_LABELS[level]}
              </option>
            ))}
          </select>
          {fieldProblem("degreeLevel")}
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-university`}>University</label>
          <input
            id={`${prefix}-university`}
            type="text"
            autoComplete="organization"
            value={university}
            onChange={(event) => setUniversity(event.target.value)}
            {...describe("university")}
          />
          {fieldProblem("university")}
        </div>
      </fieldset>

      <fieldset>
        <legend>Degree areas</legend>
        <p className="hint muted">You can pick up to 6.</p>
        <div className="checks">
          {DISCIPLINES.map((discipline) => {
            const checked = disciplines.includes(discipline);
            return (
              <label key={discipline} className="check">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={atLimit && !checked}
                  onChange={() => toggle(discipline)}
                />
                {DISCIPLINE_LABELS[discipline]}
              </label>
            );
          })}
        </div>
        {fieldProblem("disciplines")}
      </fieldset>

      <fieldset>
        <legend>Optional</legend>
        <div className="field">
          <label htmlFor={`${prefix}-citizenship`}>Citizenship or residency</label>
          <select
            id={`${prefix}-citizenship`}
            value={citizenship}
            onChange={(event) => setCitizenship(event.target.value)}
            {...describe("citizenship")}
          >
            <option value="">Prefer not to say</option>
            {CITIZENSHIPS.map((value) => (
              <option key={value} value={value}>
                {CITIZENSHIP_LABELS[value]}
              </option>
            ))}
          </select>
          <p className="hint muted">
            Only used to check programs&apos; requirements. It is never shown to anyone else. Without it, programs that ask
            will say &ldquo;Check requirements&rdquo;.
          </p>
          {fieldProblem("citizenship")}
        </div>
        <label className="check">
          <input type="checkbox" checked={emailAlerts} onChange={(e) => setEmailAlerts(e.target.checked)} />
          Email me when a program I follow opens or changes
        </label>
      </fieldset>

      {formProblem !== null && (
        <p className="field-problem" role="alert">
          {formProblem}
        </p>
      )}
      {status === "signed-out" && (
        <p className="field-problem" role="alert">
          Your session has ended. <a href="/login?next=%2Fprofile">Sign in again</a>
        </p>
      )}
      <div className="profile-actions">
        <button type="submit" className="login-submit" disabled={status === "saving"}>
          {status === "saving" ? "Saving" : "Save profile"}
        </button>
        {status === "saved" && <p role="status">Profile saved.</p>}
      </div>
    </form>
  );
}
