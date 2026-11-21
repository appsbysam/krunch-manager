# KRUNCH Google Sheets two-way sync

## Current state
- The Google workbook is prepared and contains a read-only export of the existing Project KRUNCH records.
- Sheet: [KRUNCH Master Project Plan](https://docs.google.com/spreadsheets/d/1mYzZTDNeedXp7FOB_bwBpx5bR5miZOje18sPOcHBd6A/edit).
- Production KRUNCH app and Supabase database remain the source of truth.
- **Do not assume sync is active until this Apps Script is installed, authorised, and acceptance-tested.**
- Google Apps Script is not automatically installed by committing `Code.gs` to GitHub.

## How the integration works
1. A Google Apps Script bound to the workbook signs in to Supabase as an EXISTING Project KRUNCH member.
2. The login password is used in memory to obtain a session, not saved. Rotating access and refresh tokens are saved in Apps Script Properties. Keep script edit permissions restricted.
3. An installable on-edit trigger PATCHes only allowed columns in the existing `krunch_manager_items` table.
4. A time trigger refreshes the Project Records tab every five minutes. The new `updated_at` trigger on existing tasks helps identify stale edits.
5. An explicit `KRUNCH Sync > Submit New Entries` menu validates and POSTs queued rows, recording the new database ID in the sheet.
6. Project Records system ID, reference ID, type and last-updated fields stay locked, as do headers and the guide.
7. Since Google Sheet owners can override their own protection, server-side validation and RLS are essential.

## Owner installation — required once
1. Open the master Google Sheet in its owning Google account.
2. Click **Extensions > Apps Script**.
3. Replace the default `Code.gs` contents with this branch's [Code.gs](./Code.gs).
4. Save the Apps Script project, reload the Google Sheet, and open the new **KRUNCH Sync** menu.
5. Choose **Connect my KRUNCH account** and sign in using your existing Project KRUNCH email and password. Google requests permission to access this spreadsheet and make HTTPS connections.
6. Confirm the protected Project Records tab is populated and editable only in the approved columns D:M, and that all identifiers remain locked.
7. Validate a non-critical edit in the Sheet, then refresh the KRUNCH app and confirm that it appears. Reverse the edit in the app and run **Refresh Project Records** to verify the other direction.
8. Make a safe trial entry in **New Entries**, choose **KRUNCH Sync > Submit New Entries**, verify a database ID appears in column I and the record appears in the app.
9. Test a two-user stale edit and a failed network request; do not consider deployment accepted until errors and conflicts are handled correctly.

## Allowed columns
- A/B/C: locked system ID, reference and record type
- D: item/task name
- E: area
- F: category
- G: assigned to
- H: task status, tasks only
- I: purchase status, items only
- J: estimate
- K: actual
- L: supplier
- M: notes
- N: locked updated-at timestamp

## Scope and caveats
- Dates, milestones, payments, and task dependencies are **not** synced by this first connector. This phase covers the task/item fields above; expand after confirming end-to-end operation.
- Avoid bulk pastes, deleting and inserting rows, editing IDs, renaming tabs or moving fields. Use pre-existing filters.
- The `Sync Errors` tab logs rejected edits; an error must not be interpreted as a save.
- There is no extra paid Supabase project. Apps Script and Supabase free quotas apply.
- A sheet editor with access to the Apps Script source may be able to access stored session tokens. Keep script access limited and rotate/disconnect tokens if sharing changes.
- The Project KRUNCH app's own whole-record saves should be reviewed for stale-write safeguards before production-level concurrent edits are considered fully safe.

## Emergency stop
Open **KRUNCH Sync > Disconnect automatic sync**. The code removes the edit/time triggers, clears the stored session and re-locks Project Records. The KRUNCH web app continues to use Supabase normally. A saved GitHub backup branch is available for app rollback.
