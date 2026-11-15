# GHOSTING AI Shield — Privacy

**AI Shield uploads files to a server.** This is the single opt-in exception to GHOSTING's local-first design.
It does not change how the photo tools, the browser Video Studio or the VeilGuard desktop application work; those
remain local-only. This document is the source for the website's disclosure and Privacy Policy section.

## Data flow
| Data | Where it goes | How long | Who can read it |
|---|---|---|---|
| The image/video you choose | HTTPS → GHOSTING processing server | In memory while queued; temp storage while processing; removed when the job ends | Server process; the holder of the job token (output only) |
| Video frames (derived) | Temp directory on the server | Removed when processing ends (success, failure or cancel) | Server process |
| Result file + record | Job directory on the server | `SHIELD_JOB_TTL_SECONDS` after completion (default 1 h), then auto-deleted; deleted at once on request | Holder of the job token |
| Job token | Your browser tab's memory only (never localStorage, never in URLs) | Until the tab is closed | You |
| Access key (only if the operator requires one) | Your tab's `sessionStorage` | Until the tab closes | You |

Failed, cancelled and timed-out jobs are deleted immediately. On restart the server deletes any leftover job directories.

## What is logged
- Application logs: errors and job outcomes using a **shortened job id**. Verified by `tests/api/test_logging_privacy.py`
  that file names and tokens do not appear in application logs.
- Uvicorn access logging is **off** in the shipped Docker image (`--no-access-log`).
- **Not controlled by this software:** your hosting provider, load balancer or reverse proxy may log IP addresses,
  paths (which contain job ids) and timestamps. The operator must configure and disclose those logs.

## Third parties
The application sends your file to **no** third-party service (`third_party_services: []` in `/capabilities`).
The hosting provider technically carries the traffic and runs the machine. The operator must name the provider in
the live Privacy Policy before launch (placeholder to fill: *hosting provider and region*).

## Your controls
- Consent checkbox before any upload; uploads stay disabled until ticked.
- **Delete from server** button on every result; leaving or closing the page also sends a delete request (best effort).
- Output files do not carry the input's EXIF/ICC/container metadata.

## What AI Shield does not collect
No accounts, no analytics, no cookies, no fingerprinting. The browser sends requests with `credentials: omit`
and `referrerPolicy: no-referrer`.

## Website changes made for honesty
Sentences that claimed *site-wide* "zero network" or "no server" behaviour were qualified (Footer, About, Security
Policy, Privacy Policy) and a separate Privacy Policy section for AI Shield was added. The Home page headline
"Zero Network Calls" (and its supporting copy) still describes the photo tool only; **review it with the owner** — see
the handoff's "needs your approval" list. The desktop app's privacy promises were not touched. The website's
Content-Security-Policy `connect-src` changes from `'none'` to exactly one origin (the backend) only when
`VITE_SHIELD_API_URL` is set at build time.

## Operator checklist before launch
1. Name the hosting provider/region in the Privacy Policy.
2. Decide and disclose proxy/load-balancer logging and retention.
3. Confirm TTL value matches the policy text (the page shows the live value from `/capabilities`).
4. Confirm local legal requirements for processing uploads (this document is not legal advice).
