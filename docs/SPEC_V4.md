# Kindra PWA: specification v4.0 audit, design and evidence

Date: 25 November 2026. Covers the specification of 23 November 2026.

Contents: 1 Audit · 2 Roles and permissions · 3 Menu map · 4 Screen maps as built · 5 CDT model and coordinates · 6 Data entities · 7 Security controls and gaps · 8 Acceptance results · 9 Backup and recovery · 10 Plan · 11 Decisions needed

## 1. Audit

Status codes are the ones in spec section 1: **1** working and verified, **2** partially implemented, **3** visual only, **4** not implemented, **5** blocked by a dependency. "Before" is the build received. "Now" is after this delivery.

| Area (spec section) | Before | Now | Severity of what remains | Note |
|---|---|---|---|---|
| Modules, future ones inactive (2) | 1 | 1 | – | The oil module needs a complete, approved definition before it can be switched on; it is off |
| 22 Nov report, daily/accumulated, m³/t, dash is not zero (3, 8) | 4 | 1 | – | Institutional roles only; publication not approved |
| One facility, several operators (4) | 2 | 1 | – | Duplicate sites are rejected by the server |
| Canonical coordinates (4) | 2 | 5 | High | 2 of 4 sites missing, see section 5 |
| Role separation on the server (5, 10) | 1 | 1 | – | 10 roles tested against 15 routes |
| Separate processing role (5.6) | 2 | 1 | – | Once a centre has processing staff, its receiving staff can no longer process. Centres without them work as before |
| Desktop sidebar, tabs per profile (6, 27) | 2 | 1 | – | |
| Role, organization and module visible (6) | 2 | 1 | – | |
| Role switching for real multi-role accounts (24) | 2 | 1 | – | Was only visible in demo mode |
| Standard status labels (6, 8) | 2 | 1 | – | Common label first, then the module detail |
| Origin to destination traceability (7) | 1 | 1 | – | |
| Reception operator, quantity, condition, discrepancy (7) | 4 | 1 | – | Optional fields, so the approved flow still works |
| Processing input, method, material balance (7) | 4 | 1 | – | |
| Structured laboratory tests (7) | 4 | 1 | – | |
| Corrections keep the previous value (8) | 2 | 1 | – | |
| t and m³ never added together (8, 20) | 2 | 1 | – | Valorization rate mixed units when lots differed; corrected |
| AI photo and text suggestion (8) | 4 | 2 | Medium | Built, off by default, tested with a substitute service. The live service refused the call: the API account has no credit |
| Reporter identity hidden from controller and auditor (5.9, 5.10) | 4 | 1 | – | Both roles could see it; corrected |
| Public record without private values (9) | 2 | 1 | – | Corrected values could appear publicly; corrected |
| Information requests (9) | 4 | 1 | – | Legal grounds and retention await approval |
| Controlled and logged exports (9, 20) | 2 | 1 | – | |
| Evidence image access (9) | 2 | 1 | – | Signed links that expire, given only inside an authorized response |
| Sign-in, denied access and role-change log (10) | 4 | 1 | – | Visible only to the main administrator |
| Password visibility and recovery (24) | 4 | 2 | Medium | Handled by the administrator; no email/SMS service |
| Automated backups, tested restore (10) | 2 | 2 | High | Built and tested; backups and images need storage that survives redeploys |
| Demo and production separation (10, 28) | 2 | 2 | High | Same installation, demo mode is on |
| Incidents and risk register (10, 11) | 4 | 1 | – | Register starts empty; entries belong to the owner |
| Driver module (17) | 4 | 1 | – | Five sections, offline capture |
| Driver earnings and wallet (17.3, 29) | – | 1 | – | Does not exist; payments are locked off |
| Points, levels, card (18, 29) | 1 | 1 | – | Written rules and history on screen; marked pending until an approval document is recorded |
| Household, community, business, coastal profiles (25) | 4 | 2 | Medium | Built. Eco Challenges are not, they need approved campaigns |
| Facility, operator and date filters, drill-down (20) | 2 | 1 | – | |
| Installable, offline notice, queued captures (27) | 1 | 1 | – | |

## 2. Roles and permissions

R read, W write, – no access. "Own" means own centre, entity or records. Every rule is enforced on the server.

| Spec role | Kindra role | Operational data | CDT reports | Export | Requests | Governance |
|---|---|---|---|---|---|---|
| Global / Main Administrator | `admin` (two-step) | R | R all | Yes | R all | W |
| Institution Administrator | `entity_admin` | Own users and vehicles W | R own rows | Yes, own | Create, own | – |
| Operational / Collection | `removal` | Departures W | – | – | Create and view, own entity | – |
| Transport / Driver | `driver` | Own pickups W, no reporter identity | – | – | Accept, reject, collect, own | – |
| CDT Receiving | `center` | Own centre W | R own site | – | R and receive, own site | – |
| Processing | `processing` | Close lots and record outputs, own centre; no reporter identity | – | – | – | – |
| Evaluator / Laboratory | `evaluator` | Hazard and quality decisions W | – | – | – | – |
| Final Destination | `destination` | Own works W | – | – | – | – |
| Supervisor / Auditor | `supervisor` | R, observations only, no reporter identity | R all | Yes | – | – |
| Coordination | `coordinator` | Validation W | R all | – | Create, validate | – |
| Community Controller | `monitor` | R, no reporter identity | – | – | – | – |
| Citizen / Public | `citizen`, no account | Own reports | – | Own record | – | Submit a request |
| Householder | `householder` | – | – | – | Own | – |
| Business | `business` | Own collection point W | – | – | Own business | – |
| Community, coastal group | `community`, `coastal` | Own group W; leaders manage members and activities | – | – | – | – |

The downloadable record of a single report is available to anyone who can open that record, in the public version unless authorized. Each download is logged.

## 3. Menu map (current build)

Left sidebar on tablet and desktop, bottom tabs on phones, same names in both. The first four items are the phone tabs; the rest are under More. The driver has five fixed tabs.

| Role | Menu |
|---|---|
| Main administrator | Overview, Users, Reports, Data governance, Organizations, Modules, Centres, Operators, Requests, Tracking, Communities and businesses, and configuration pages |
| Institution administrator | Home, Users, Requests, Reports, Vehicles, Documents and evidence |
| Coordination | Inbox, Requests, Alerts, Reports, Origins, Map, Disputes, Zones, Controllers, Manual review, Institutional origin, Communities and groups, Checkpoint, Trucks |
| Collection | To remove, My trips, Requests, Escort, Map, Pending zone |
| Driver | Home, Requests, Activity, Impact, Profile (plus My route and Training) |
| Receiving | Arrivals, Checkpoint, Open lot, Reports, Lots, Dispatches, Daily summary, Jobs, Requests, Tracking, Escort |
| Processing | Home, Queue, Balance, History |
| Evaluator | Held, To verify, Decided, Dashboard |
| Final destination | To confirm, Works, Checkpoint, Register work |
| Auditor | Traceability, Reports, Alerts, Citizen reports, Lots, Discrepancies, Changes and approvals, Observations, Tracking |
| Community controller | Home, Sector progress, My reports, Lookup, Report, AURA, Guides, Rewards, Groups |
| Householder | Home, Request, My requests, My impact, Education, Points, AURA |
| Business | Home, Schedule, Collection point, History, Request, Impact, Education, Business details |
| Community, coastal group | Home, Activities, Report, Impact, Members, Learning, Points, Details |
| Citizen | Home, AURA, My reports, Dashboard, Report, Lookup, Training, Rewards, Groups |

## 4. Screen maps as built

The spec ("Implementation principles for the PWA") asks for a screen map before each interface is coded. These maps were written first and built on the project owner's instruction of 25 November 2026. The client has not reviewed the screens yet; changes are expected at that review.

**4.1 Driver**: bottom tabs Home · Requests · Activity · Impact · Profile

| Screen | Content | Actions | Data |
|---|---|---|---|
| Home | Today's assigned, pending, completed; next pickup with window and destination; alerts | Open the next pickup | `GET /api/requests` |
| Requests | Available, Mine, Closed; code, material, quantity and unit, address, window, instructions, safety | Accept, Reject with reason | `/accept`, `/reject` |
| Pickup detail | Stepper Assigned → En route → Collecting → Collected → Received → Validated | Next step, Report issue | `/status`, `/issue` |
| Collection record | Quantity, unit, vehicle, photo, note | Submit, or save as pending sync | `/collect` |
| Activity | Replaces Earnings while no payment scheme exists; own history, no amounts | Filter by date and status | `GET /api/requests` |
| Impact | Completed per month; received m³ and t apart; date range | Open the records | `/impact` |
| Profile | Name, organization, vehicle, notifications, training, password, sign out | Edit non-verified fields | existing profile |

Desktop: left rail with the same five names. Receipt is always confirmed by the centre and validation by coordination.

**4.2 Householder**: Home · Request · My requests · Learn · More (Impact, Points if approved, Profile). Debris is requested with the existing report. The oil form appears only when that module is switched on.

**4.3 Communities**: Dashboard · Activities · Report · Impact · More (Members, Challenges if approved, Learning, Profile). Counting: only reports and activities validated by coordination; hours are those the leader records per attendee in validated activities. Challenges are not built.

**4.4 Businesses**: Dashboard · Collection point · Schedule · History · More (Request, Impact, Education, Profile). Only its own records. The oil form appears only when that module is switched on.

**4.5 Coastal groups**: Dashboard · Cleanups · Report waste · Impact · More (Members, Points if approved, Education, Profile). Reported and validated totals always apart. Same counting as 4.3.

**4.6 Global Admin**: left sidebar Overview · Users and roles · Organizations · Modules · Facilities and CDTs · Operators · Requests · Traceability · Community and business · Reports · Governance · Audit and security · Settings.

**4.7 Institutional roles**: left sidebar on desktop, bottom tabs on mobile, using the pages in section 3.

| Role | Proposed tabs |
|---|---|
| Institution administrator | Dashboard · Users · Operations · Reports · More (Facilities, Documents, Audit, Profile) |
| Receiving | Dashboard · Incoming · Receive · Activity · More (Evidence, History) |
| Processing | Dashboard · Queue · Record · Balance · History |
| Evaluator | Dashboard · Assigned · Results · Validation · History |
| Final destination | Dashboard · Approved · Confirm · History |
| Auditor | Dashboard · Traceability · CDT reports · Audit · More (Citizen reports, Exports) |
| Community controller | Dashboard · Sector · Reports · Lot lookup · Guides |

## 5. CDT model and coordinates

```
Facility (centers)  1 ── n  Operator (entities, via entityId + operatorEntityIds)
Facility + Operator 1 ── n  Operational record
                            · receptions: lot, quantity, unit, evidence, check
                            · reportSnapshots.rows: reported figures with source date and time
```

| Facility | Coordinates in the project | Status |
|---|---|---|
| Santa Eduvigis | 10.58962, -67.0022 (unloading 10.58703, -67.00575) | Reused unchanged |
| Playa Grande, Calle 6 | 10.61039, -67.01919 | Reused unchanged |
| Caraballeda | none | **Missing, please resend** |
| Playa Escondida | none | **Missing, please resend** |

Searched: source code, its history, project documents, the DOCX and PDF of v4.0, and the downloads folder. An old local demo file holds placeholder points for generic centres; they were not used. The live site was also checked on 25 November 2026: it has no coordinates for these two sites either.

Santa Eduvigis keeps its existing classification as a separate final-disposal site.

## 6. Data entities

| Concept | Where | Notes |
|---|---|---|
| Lot origin | `origins` | Code `LG-…`, kept through the whole chain |
| Movement | `trips`, `movements` | Departure and arrival by different people |
| Reception | `receptions` | Operator, received quantity and unit, condition, quantity check |
| Processing lot | `batches` | Groups receptions; input, outputs, method, balance |
| Evaluation | `hazardDecisions`, `qualityVerifications` | Checklist, tests, justification |
| Destination | `dispatches`, `works` | Dispatched and received kept separately |
| Pickup request | `pickupRequests` | Assignment layer; collecting creates the existing trip, never a second quantity |
| Reported figures | `reportSnapshots` | Never mixed with Kindra records |
| Evidence | `photos` | Moderated before publication |
| Governance | `infoRequests`, `risks`, `incidents`, `recoveryRequests` | |
| Log | `events` | Append only, hash-chained |

## 7. Security controls

**In place:** individual accounts; bcrypt passwords; two-step sign-in for the main administrator; session expiry (30 days, 12 hours with two-step); suspension ends sessions at once; role, organization and centre checks on the server; append-only sealed log; sign-ins, failures, denied access, role changes, exports and decisions logged; fleet positions never public; reporter identity masked; evidence images behind signed links that expire in 12 to 24 hours; 5 failed sign-ins pause the account for 15 minutes; secrets only on the server.

**Remaining gaps**

| Gap | Severity | What it needs |
|---|---|---|
| Demo mode lets anyone enter as any test role | High | Switch off before real use; separate demo installation |
| Backups and images on a disk that redeploys may erase | High | Persistent or external storage |
| `JWT_SECRET` has a development default | High | Confirm it is set in production |
| Lockout counts are kept in memory and reset on restart | Low | Shared store if scaled to several servers |
| Two-step only for the main administrator | Medium | Decide for other roles |
| Encryption at rest | Medium | Confirm with the database and storage providers |
| Retention periods | Medium | Legal approval |
| Simultaneous acceptance is safe on one server only | Low | Database lock if scaled to several |

## 8. Acceptance results

Automated: 59 server tests pass (33 existing, 26 new in `spec-v4.test.ts` and `profiles.test.ts`). Browser: 623 checks in Chrome at 390, 820 and 1366 px, covering every menu link of 15 roles. All run on an in-memory test database, never on the live one.

| Scenario | Result |
|---|---|
| Each role with its own account; others blocked | Pass |
| Origin to final destination, stages cannot be skipped | Pass |
| One CDT, two operators, no duplicate pin or double count | Pass |
| Daily and accumulated, m³ and t | Pass |
| Citizen report, public tracking, protected identity | Pass |
| Correction keeps the previous value, author and reason | Pass |
| Controlled export; backup and restore; tampered backup detected | Pass |
| Future modules cannot be activated | Pass |
| Driver accept, reject, collect, receive, validate, impact | Pass, on screen |
| Offline notice and installability | Pass |
| Offline capture marked pending, sent on reconnecting | Pass, driver collection |
| Restore onto a real PostgreSQL database | Not tested; needs an empty database |
| Household, business, community and coastal scenarios | Pass; oil tested by switching the module on in a test database |
| AI suggestion against the live service | Failed: API account has no credit |

Test accounts (password `demo1234`): `ciudadano`, `contralora`, `coordinador`, `retiro`, `centro`, `centro-sur`, `evaluador`, `supervisor`, `obras`, `admin-ejecutor`, `admin`, `conductor`, `procesamiento`, `hogar`, `comercio`, `comunidad`, `costero`. The last six appear after resetting the demo data.

## 9. Backup and recovery

- Manual: `npm run backup`, or Administration → Data governance → Backups.
- Automatic: set `BACKUP_INTERVAL_HOURS=24`. Off by default; keeps the last 14.
- Test: "Test restore" in the same page, or `npm run restore -w server -- file.json`. Loads into a temporary database and recalculates every seal.
- Recover: the same command with `--apply`, only onto an empty PostgreSQL database.
- Backups hold critical data and cannot be downloaded from the app. Uploaded images are not included and need their own copy.

## 10. Plan

Effort in working days, to be confirmed after approval.

| Priority | Work | Depends on | Effort |
|---|---|---|---|
| 1 | Coordinates, operator mapping, Playa Grande | Section 11 | 0.5 |
| 1 | Separate demo and production, persistent storage | Hosting decision | 2–3 |
| 2 | Adjustments after the client reviews the screens | Section 4 | 3–5 |
| 3 | Eco Challenges | Approved campaigns | 3–4 |

## 11. Decisions needed

1. Coordinates of Caraballeda and Playa Escondida.
2. Is "Playa Grande" the same site as "Playa Grande, Calle 6"? Until answered its figures count in the total but sit on no site.
3. Are the generic "Operador Contratista" and "Operador Público" the same organizations as Miyamoto International and the Ministry of Public Works? If so they should be merged.
4. Operator of Playa Escondida (unlabelled row), Playa Grande and Santa Eduvigis.
5. The report's printed m³ totals differ from the sum of its own rows: accumulated 1,382,738.94 against 1,382,739.69; daily 5,606.04 against 5,606.03. Tonnes match. Which is right?
6. May the report figures and operator names be shown publicly?
7. Client review of the screens in section 4 and of the counting rules in 4.3.
8. Approval document for the points rules; whether a driver payment scheme exists; the oil module definition.
9. Retention periods and legal grounds for disclosure.
10. Email or SMS provider for password recovery; hosting for backups and images.
11. The reference screenshots, the screen recording and VESTIGIOS.pdf, which were not among the files available.
