# Step 1: reliable ordering and staff security

Updated 11 November 2026. The application changes are local for the owner to review and commit. No commit, push, or Vercel code deployment was performed.

## Implemented

| Change | Result | Rollout status |
|---|---|---|
| Checkout recovery | If Supabase accepts an order but its response is lost, retrying the same checkout recovers that order. It does not insert it again or reprice it. Reusing its identifier for changed choices is rejected. | Local API and UI; database column applied |
| Checkout identifier | One identifier per unchanged checkout, scoped to the signed-in account and retained across a tab reload. Only an identifier and SHA-256 digest are saved in session storage. | Local UI |
| Order activity | Admin order details show the latest 50 recorded actions, actor type, and time. Staff cannot edit/erase this activity or directly rewrite order prices. Existing orders have a clear logging-start marker rather than invented history. | Database applied; local Admin UI |
| Cancellation recovery | Repeating an accepted cancellation returns the same cancelled order without recording it again. Preparing and later orders remain protected from customer cancellation. | Database applied |
| Account limits | Persistent per-account limits: 12 new-order attempts/minute and 6 cancellation attempts/minute. Failed security checks reject the action safely. Accepted-order recovery bypasses the new-order account counter. | Database applied; local API |
| Vercel API protection | Existing 60-request/minute/IP rule now covers route, reverse-geocode, create-order, and cancel-order together. | Active firewall version 2 |
| Browser protection | CSP, referrer policy, framing restrictions, MIME protection, and camera/microphone restrictions. GPS remains allowed on the same origin. | Local Vercel configuration and preview server |
| Password validation | Signup and password replacement require 12 characters in the UI. Existing accounts can still sign in with their current passwords. | Local UI; matching Auth server setting still needs owner action |
| Staff authenticator | Admin/Rider → Operations → Account security provides authenticator enrollment and code verification. Optional now; ready for a staged mandatory rollout enforced in database permissions. | Setup applied with enforcement OFF; page local |

The account counter is separate from the shared IP limit. Multiple phones using one Wi-Fi share the IP budget. These limits reduce repeated requests; they do not replace Auth abuse prevention or monitoring.

Applied migrations (already applied; do not rerun):

- `20261110174811_order_reliability_history_and_action_limits`
- `20261110181844_staff_mfa_staged_rollout`

The exact migration SQL is mirrored in `supabase/migrations/`. Standalone sources and rollback-only verification scripts are in `sql/`. `sql/ENABLE_STAFF_MFA.sql` is deliberately **not** an automatic migration.

## Owner rollout, in order

1. **Review locally.** Run `node scripts/preview.cjs` and open http://127.0.0.1:4173. Restart an older preview process to load the updated server configuration. Real signed-in pages connect to the existing Supabase project. An API request from this server can create a real order when `.env.local` contains the server credentials. The separate http://127.0.0.1:4187/mobile.html preview uses sample data only; actions there do not test the production backend.
2. **Commit the reviewed files manually to a test branch.** Open its Vercel Preview before changing production. Required server variable names have production and preview targets configured; values were not decrypted or changed. Confirm the Preview's actual values and store coordinates are correct through its behavior. A branch preview currently uses the connected database unless you explicitly give it an isolated test project. Coordinate any TEST order with staff first.
3. **Run the acceptance table below.** Use your own customer account, admin account, and rider phone. Confirm sign-in and maps work with the new security headers, and keep the browser console free of CSP-blocked application requests. Google/password-recovery callback URLs must include the Preview origin if those flows are tested there; do not add broad arbitrary redirect origins.
4. **Deploy the reviewed application normally.** Mandatory staff MFA stays off for this initial rollout. Open production on the staff phones and refresh installed PWAs to load the new pages/cache v36.
5. **Enroll each active staff account.** On the deployed Admin or Rider page choose Operations → Account security → Set up authenticator. Each person scans their own QR using a trusted authenticator app, then enters its current code themselves. Keep the setup key private; do not send QR images, keys, passwords, or codes in chat. Enrollment verification can sign out other sessions for that account. At the last check there were two active staff accounts and neither had a verified TOTP factor.
6. **Make MFA mandatory only after every staff account is enrolled.** Run `sql/ENABLE_STAFF_MFA.sql` in the owner's Supabase SQL editor, or ask for this final switch after enrollment and deployment are confirmed. Its preflight refuses to enable enforcement if any active staff member lacks a verified authenticator. A new staff login will then need password/Google sign-in plus the authenticator code before staff data/actions are accessible. Check this in a separate browser session before closing the existing owner session. MFA never grants staff permissions to an ordinary customer. Future staff must enroll before they can operate the dashboard.
7. **Finish Auth account settings.** In Supabase Authentication's email/password settings set the server minimum password length to at least 12, matching the UI. Review secure password-change/reauthentication settings and test the recovery flow. Enable leaked-password protection if available on your current plan; do not upgrade a paid plan just for this checklist without deciding on that cost. Do not enable CAPTCHA until its client integration is implemented. Protect the owner's GitHub, Supabase, Vercel, and primary email accounts with their own MFA and recovery methods.
8. **Run one coordinated delivery on real phones.** Keep it within 3 km by road, confirm its fee and rider assignment, and finish it with the intended staff. Confirm status updates on the customer's phone, the activity entries, and that stored live GPS disappears after completion. A browser tab can stop GPS when the phone locks or the operating system suspends it; a real phone test is required before promising continuous tracking.

Owner recovery: if an authenticator is lost, use trusted Supabase administration to recover/reset that account's factor. The settings table is private and cannot be changed from a staff browser. Any emergency temporary MFA-enforcement rollback should be made by the owner, followed by enrollment recovery and re-enabling enforcement.

## Acceptance tests

| Test | What you should see |
|---|---|
| Normal pickup | One order; checkout closes; customer tracking and Admin Pending agree on items and total. |
| Lost response / retry | In a controlled test browser interrupt only the create-order response after acceptance; retry unchanged checkout. Same order reference, one database row, one placement event. Automated tests already simulate this; do not repeatedly submit real orders to force it. |
| Concurrent checkout | Two attempts from the same account cannot create two unfinished orders. Same identifier recovers one order; different identifiers leave one active order and a clear conflict. Automated handler tests simulate both races. |
| Price/availability | Forged client prices are ignored; unavailable, hidden, or deleted options are rejected by server pricing. |
| Delivery boundary | Exactly 3,000 m by driving route is allowed; more than 3,000 m is rejected by quote and final submission. A straight-line nearby pin with a longer road route is rejected too. |
| Admin activity | Open details, confirm, assign a rider, then refresh activity. Correct transitions and timestamps appear. Completed records remain readable. Older orders show when logging began. |
| Cancel vs confirm | A customer can cancel only while Pending after the existing 10-minute wait. If confirmation wins first, cancellation fails without undoing Preparing. A cancellation retry does not add another event. |
| Double actions | Repeating confirmation/start/completion must not apply a second transition. Two staff phones should refresh to the same result. True simultaneous staff-device behavior still needs this acceptance test; database rollback checks exercised state/lock guards sequentially. |
| Permissions | Customer cannot read another customer's order or staff activity, edit menu/prices, or invoke staff actions. Rider can operate only assigned deliveries. |
| Staff MFA | Wrong code stays blocked; correct code opens the authorized dashboard. After enforcement is enabled, a password-only session cannot read staff orders or perform staff actions. Sign out/switch account without showing the previous account's details. |
| Maps and recovery | Actual phone GPS, maps, Google sign-in, password-recovery email/callback, and installed-PWA refresh succeed on the deployed build. |

## Verification completed

- **214 local checks passed** (`node --test tests/*.test.cjs`). The runner reports 153 entries; five legacy wrapper files contain 66 cases, so 153 − 5 + 66 = 214. Coverage includes retry/reload/account isolation, server ownership/pricing, races, limits, state guards, menu editing, GPS recovery, history, and authenticator boundaries.
- **29/29 separate API-handler audit cases passed**, including the previously failing lost-response retry. Its existing audit harness/log is outside the project; the regression is also covered in the committed-reviewable `tests/checkout-retry.test.cjs`.
- **Live Supabase rollback verification passed:** history actors and permissions, guarded staff actions, cancellation recovery, one-active-order uniqueness, GPS cleanup, rate counters/reset, and staged MFA permissions. Fixtures were rolled back. The original 13 orders remain; 13 baseline activity markers were added intentionally. No real order status, password, or MFA factor was changed by tests.
- **Browser:** the actual public menu loaded 78 live products under the proposed headers without application console errors; customization opened. Admin activity and authenticator UI were checked with sample data in a 390 px phone frame, including a rejected code and successful sample verification. Sample QR/codes are not real credentials.
- **Not yet certified:** deployed end-to-end delivery/GPS on real phones, real authenticator enrollment, mandatory-MFA final switch, server password setting, real Google/recovery callback flow under the new headers, and simultaneous staff-phone actions.

Supabase's advisor still reports existing public SECURITY DEFINER helper/Auth-policy notices and disabled leaked-password protection. The new private settings/counter tables intentionally have RLS enabled with no client policies. These checks are not a blanket security certification. Browser CSP still permits the existing trusted CDN SDKs and HTTPS menu/map images; ongoing dependency review, monitoring, backup/restore testing and retention rules remain later deployment work.
