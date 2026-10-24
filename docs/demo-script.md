# Demo script: InternRadar in two minutes

For a short talk. The app on screen does the work, so there is no code to show. Say only what the
screen proves, and say plainly what is not built.

## Before you present (10 minutes, the day before)

1. Start Docker Desktop, then the database and the app (see "Running it" in the README).
2. Load and publish the draft catalogue, then open `http://localhost:3000` and look at it once.
3. **Check every date you will mention against the employer's own page.** The catalogue is an
   unverified draft. If you have not checked a date, do not say it out loud: point at the bar and
   say "this is shown as a guess from last year".
4. Browser zoom to 125% to 150% so the back of the room can read it. Close other tabs.
5. Have two tabs ready: the home page, and the CommBank graduate program page. Keep the repo's
   decision log open in a third in case someone asks "why".

## The story (about 2 minutes)

**1. The problem (15 seconds).**
"Big employers rarely say when graduate and intern applications open, and every one has a different
process. I kept missing windows and couldn't tell what each company wanted."

**2. The timeline (35 seconds). Home page.**
- "This is the next twelve months. One bar per program."
- Point at a **solid** bar: "Solid means the employer published the dates."
- Point at a **dashed** bar: "Dashed means it's a guess from earlier years. It's labelled
  Estimated, and it links to where I got it. I'd rather show a guess honestly than look certain."
- Point at a "Not announced" row: "If I know nothing, it says so."
- Read one "Start preparing" line: "It also tells me when to start getting ready, four weeks ahead."

**3. The filter (15 seconds).**
Click **Vacationer**, then **All programs**. "Plain links, so the address changes and I can share
a filtered view."

**4. How to prepare and apply (40 seconds). Open the CommBank graduate program.**
- Scroll to **How to prepare and apply**.
- "These are the steps CommBank's own page describes: application, online assessment, digital
  interview, assessment centre. Each one links to where it says so."
- "If I haven't found an employer's steps, it says they aren't published here yet. It never
  invents them."
- Point at the Apply link but do not click it: "It sends me to the employer's real application."

**5. Close (15 seconds).**
"Built test-first, with row-level security so students only ever see their own data. It is not
public yet: the data is still being checked. Next would be alerts and student-shared interview
experiences."

## What not to say

- Do not say it has users, alerts, email or a community feature. None of those exist.
- Do not say the data is verified or live. It is a draft that runs on your laptop.
- Do not quote a date you have not checked on the employer's page.
- Do not call the dashed bars predictions. They are a guess from earlier years.

## If someone asks

| Question | Honest answer |
|---|---|
| Why not just use GradConnection or Prosple? | They cover far more employers. I'm going deep on one job: when it opens, how to prepare, and being honest about how sure each date is. |
| How do you know the dates are right? | Each date has a source link, and anything I only inferred is labelled Estimated. The catalogue is still being verified by hand before it goes public. |
| How do you keep student data safe? | Row-level security in Postgres: the database itself only returns a student's own rows, even if my code has a bug. |
| How did you test it? | Test-first: a failing test, then the smallest fix. About a thousand unit tests, database tests for the security rules, and accessibility checks (axe, and keyboard order). |
| Did you use AI to build it? | Say yes if you did, and be ready to explain row-level security, the dashed bars, and one failing test turning green. The decision log shows why each choice was made. |
| What did you leave out, and why? | Alerts and email (no sender set up), interview experiences from students (needs moderation and privacy design, decision D24), and an industry filter (needs the author to approve the tagging). |

## If something breaks

- **Page shows "couldn't load".** The database is not running. Start Docker Desktop and the
  database, then refresh. Have two screenshots in your slides as a fallback.
- **No bars.** The programs were not published. Run the publish step again.
- **Wrong date on screen.** Say "that's the draft data, which I'm still checking" and move on.
