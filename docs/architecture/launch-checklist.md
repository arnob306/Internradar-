# Launch checklist

Things that cannot be fixed in code and must be done before real students use the app. Each item says why, so it can be checked off honestly.

## Before any student can sign in

- [ ] **Configure a real email sender (SMTP) on the hosted Supabase project.** Supabase's built-in sender allows only a handful of emails per hour for the whole project (the local config shows `email_sent = 2`). Sign-in works by emailing a link, and anyone can request a link for any address, so a few requests would use up the allowance and lock real students out. Use a proper provider (Resend is the one already planned for alerts) and set sensible per-hour limits in `[auth.rate_limit]`.
- [ ] **Add the production callback URL to the auth redirect allow-list**, with a trailing glob (`https://<domain>/auth/callback**`). The allow-list matches the whole URL and the callback carries `?next=`; without the glob Supabase silently falls back to the site URL and the link lands on the wrong page. This was found in local testing.
- [ ] **Set the production site URL** in the auth settings so the emailed link points at the real domain.
- [ ] **Confirm cookies are `Secure` in production** (they are whenever `NODE_ENV=production`) and that the site is served only over HTTPS.

## Before the catalog is shown

- [ ] **Verify programs.** Every program in `data/seed/catalog.yaml` starts unverified, and an unverified program only ever shows "Check requirements". A person opens each `source_url`, checks the facts, then adds `verified_on` and `is_published: true`. The eligibility rules are re-derived each intake (graduation windows are absolute dates).

## Accepted trade-offs (decided, not forgotten)

- **Two auth lookups per page view** (the proxy, then the page). Measured against the real stack on 2026-10-06. Passing the user between them in a request header would save one call but creates a trust boundary that must be defended, so it was left as is. Revisit if the auth service becomes a bottleneck.
- **Every page is dynamic**, because the header depends on who is signed in. Public pages therefore cannot be cached by a CDN. `GET /api/v1/programs` still sets its own short cache header.
- **Signing out ends one device**, not every device. A "sign out everywhere" action can be added later if wanted.

## Still to build in Phase 4

Program detail pages (the cards already link to them), the application tracker, encrypted resumes, delete-my-data, security headers and a content security policy, and the end-to-end browser tests.
