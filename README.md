# Zain Sales Performance

Sales target tracker adapted from Target 11.html. Username and 8 to 12 digit PIN sign in, with AM791 as the main manager. No user email entry or email delivery is required. Supabase Auth uses internal synthetic identifiers; it hashes credentials and issues sessions. Browser sessions use HttpOnly cookies. Browser assets contain no Supabase keys.

## Features

Managers see team totals, per agent sales, monthly Postpaid and Broadband targets, four monthly ARPU settings, effective dated sales rules, and account administration. Agents see and edit their own sales only. All five source segments and 22 original rental rules are preserved. Database triggers calculate points and preserve saved snapshots when rules or targets change. Sale date determines the ARPU month. Unchanged edits retain original points. Legacy HBB, tddArpu and arpuUsed backups are supported by manager import.

The original charts, daily performance, month navigation, breakdowns, history search, type and category filters, CSV and JSON exports remain available. Backup import replaces only the selected agent's sales and targets in a transaction; global team rules remain unchanged. Imported sales retain their historical rule references, ARPU and unrounded points.

## Initial setup

Use a dedicated new Supabase project. Do not apply this schema to unrelated databases.

1. Apply database/schema.sql, database/seed.sql, database/team-targets.sql and database/admin-role.sql to the new project.
2. In Vercel, set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY and a long random TRACKER_SETUP_CODE as server environment variables. Service credentials must never be committed or placed in public files.
3. Deploy the main branch. Open /?setup=1, enter the private setup code and choose the AM791 PIN. This flow can only create AM791 once. Remove TRACKER_SETUP_CODE after setup and redeploy.
4. Sign in as AM791. Open Manage users to create agent accounts and temporary PINs. Agents must change the temporary PIN on first login.
5. Configure monthly targets and ARPU before entering upgrades. Import existing agent JSON backups through Restore Data after selecting the correct agent. The HTML source itself contains no historical sales or populated monthly targets; those are stored in each agent's old browser storage and require a backup export.

Only AM791 can create or manage other managers. Existing access tokens lose data access immediately when a profile is disabled or marked for a mandatory PIN change. Rate limits persist in the database. PINs never appear in the account list or exports. Disabled accounts and historical sales are retained.

Admins are agents who can also manage shared sales rules. They see only their own sales and targets, count toward the team's performance and allocations, and cannot manage accounts or team targets. Managers can assign or remove the admin role in Manage users. Used rules retain their historical version and saved sales keep their original points.

AM791 owns the monthly team target. Managers can use the combined targets of agent accounts or choose a lower team target separately for Postpaid and Broadband. Individual allocations stay unchanged. If allocations are reduced below a saved custom target, its effective value is capped at the current combined allocation. Manager personal targets and sales are excluded from team totals.

In Manage users, AM791 can create the requested 11 BF accounts together. Each newly created account receives a unique random eight digit temporary PIN and must change it before dashboard access. The response downloads a private temporary PIN CSV once. Existing accounts are skipped and never reset by a retry. If the file is lost, use the individual Reset PIN action; no saved PIN can be recovered from the account list.

## Development and verification

Requires Node 22 or later. Run npm ci, npm test and npm run build. npm run dev serves http://127.0.0.1:4173. Environment variables can be provided by the process or by Node's --env-file option; .env files are ignored by Git.

Database integration tests use PGlite with Supabase roles and auth.uid simulated locally. They execute the actual schema, triggers, policies and transactions. These tests do not replace verification against the deployed Supabase Auth and REST services. Verify manager sign in, agent creation, mandatory PIN change, sales CRUD, cross agent access denial, target and rule updates and historical import after connecting the live project. Run Supabase security advisors after schema application.

If environment variables are absent, the site reports setup pending and rejects authentication and data requests. It does not use a demo account or local browser data as a fallback.

## Asset source

Zain logo: https://www.bh.zain.com/assets/zain-logo.svg, from the official Zain Bahrain website. Original Target 11.html is read only and is not included in the published website.

## November 2026: detailed sales and Tag Agent reconciliation

Sales points are absolute: **total points = Postpaid points + Broadband points**. Achievement percentage remains equal category weighting: **(Postpaid achievement % + Broadband achievement %) / 2**. Selecting any KPI card opens a date-descending list of the underlying orders, subscriber numbers, sale types, points and Tag Agent status.

Only the AM791 manager can upload Tag Agent CSV reports. The `TLS_REPORT.csv` form is treated as new sales, and `TLS_MIG_REPOERT.csv` as upgrades. Header-based classification is supported: a migration report contains `OLD_PACKAGE` or `NEW_PACKAGE`. File column names are case-insensitive. The required headers are `SUBNO`, `transdate`, `tag_agent_id` and `tag_pay_desk`. The parser accepts `02-NOV-26` or `YYYY-MM-DD` dates, quoted CSV fields and leading Bahrain +973 prefixes.

**Required one-time database migration:** Run `database/tag-agent-reports.sql` in the existing Sales Tracker Supabase project's SQL Editor. Review the script and use the correct project. This migration adds only Tag Agent tables and secured RPCs; it does not change existing sales, targets or rules. Until applied, Tag Agent is marked Unavailable. The upload action is accessible only to AM791 and must not bypass sign-in.

Upload reports covering the requested days. Each upload atomically replaces the reconciliation data for its own type and included dates, without changing other dates or the second report type. Agent and manager views display:
- Yes: a matching subscriber and date is covered by the relevant report, with `tag_agent_id` or `tag_pay_desk` populated.
- No: the relevant report type has been uploaded for the date, but the subscriber is absent or its tag fields are blank.
- NA: the relevant report type has not been uploaded for that date, including newer sales not covered by any upload.

The dashboard Tag Agent button counts only **No** for the selected agent/team and selected month. Agents can inspect only their own sales; managers can inspect team sales. Report data and subscriber numbers must never be committed to the repository. Use the two uploaded CSV files through the authenticated interface after applying the migration.

This is not an exhaustive match on order number: the tag reports do not contain the tracker's unique order ID. Reconciliation is on normalized subscriber number, transaction date and new-sale/upgrade report type. Review any subscriber with multiple orders of the same sale type on a day.
