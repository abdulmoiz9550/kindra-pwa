# Kindra PWA: Addendum v4.2 (Module 1 launch and AURA) — audit and delivery

Date: 27 November 2026. Covers "Module 1 Debris: Launch and AURA Chatbot (Addendum v4.2)" of 24 November 2026.

Status codes (v4.0 section 1): **1** working and verified, **2** partial, **3** visual only, **4** not implemented, **5** blocked by an external dependency. "Before" is the build on 26 November (commit 2a26bd4). "Now" is after this delivery. "Verified" means covered by an automated test (server/test/addendum-v42.test.ts and the earlier suites, 73 tests) or a local run against an in-memory server.

## 1. Audit

| Requirement (addendum section) | Before | Now | Note |
|---|---|---|---|
| Names and capitals of roles, menu, buttons (1.4) | 2 | 1 | Role labels in the exact form; no CSS uppercase on names; codes upper case |
| Householder and Business hidden (1.5.1, 3) | 2 | 1 | Routes, role switcher and demo roles only with the oil module on (off) |
| Driver: Asignaciones, no accept or reject in debris (1.5.2, 3) | 4 | 1 | Operator or coordination assigns; server rejects accept/reject for debris; no earnings |
| Spanish by default; English prepared, admin switch (1.2, 1.5.3, 11) | 2 | 2 | Translation file and switch built (menus, roles, states, key buttons). The remaining screen texts are still written in the screens; moving every string into translation files is the open part |
| Gemini off for citizen photos (1.5.4) | 4 | 1 | Server refuses any photo linked to a citizen report; operational photos only, human confirmation kept |
| Raíces replaces points; no "pending approval" (1.5.5, 3.1) | 2 | 1 | Ledger from the chained log, values and daily caps configurable, reversal with reason, no self-validation, levels Semilla to Bosque, badges, catalogue "Próximamente" |
| Four confirmed sites; Caribe and Tanaguarena not separate (1.5.6, 5) | 1 | 1 | Unchanged; one marker per site; CDF with its own marker and the unloading terrace |
| Reportar Escombro in every role, reported as citizen (3) | 2 | 1 | Fixed header button and menu entry; reporter role stored for audit only |
| Nobody validates, verifies, assigns or closes own report (3) | 2 | 1 | Server check on validate, reject, duplicate, field verification, departure, closure, dispute and lot assignment |
| Training: courses, quiz, states, offline, admin editor (3.2) | 2 | 1 | Six courses (texts pending Kindra approval), Disponible/En curso/Completado, download for offline, offline completion queued once |
| Contralor course required for accreditation (3.2, 8) | 4 | 1 | Accreditation by coordination or Administrador Principal, +50 Raíces |
| 6 internal stages, 4 public states; state 3 needs a validated test (4) | 2 | 1 | Public stage computed from evidence; never advances on its own |
| Lot code LG-CB-000123, report code R-CB-004512 (4, 7) | 4 | 1 | New records; earlier LG-XXXX codes still resolve |
| Destinations per fraction (4) | 1 | 1 | Aggregate to works, steel to the State, unsuitable to the CDF (existing movements) |
| Measurement method on every quantity, factor with source, weighbridge flag (6) | 2 | 1 | Required at reception when a quantity is given; mass balance with declared loss |
| Parish and sector mandatory, map pin optional, captured vs confirmed location (7) | 2 | 1 | Macuto has a provisional entry until the admin loads its sectors |
| Report states incl. Cierre Propuesto, Cerrado sin Confirmación (7) | 2 | 1 | 7-day period configurable; expiry job |
| Dispute reopens and reaches the sector Contralor (7) | 2 | 1 | |
| Assign validated reports to lots (7, 14) | 4 | 1 | Coordinator action |
| Contralor field verification: exists / does not exist / already cleared, closure review, via contralor (8) | 2 | 1 | New "Verificación" screen; offline queue |
| Public portal: lookup by code, progress by sector, traffic light, map, QR per parish, open data (9) | 2 | 1 | Open-data licence pending Kindra (shown as pending) |
| Photos published only after face/plate blur review (9, 13) | 4 | 1 | Manual blur editor in photo moderation; original stays restricted |
| AURA name recognition, consent, memory, intents, fallback menu, voice notes, handoff, privacy deletion (10.0–10.4, 10.7) | 2 | 1 | Same engine in the PWA and WhatsApp; texts editable, pending Kindra approval |
| WhatsApp channel (Meta Cloud API webhook, signature, media, sending) (10) | 4 | 5 | Built; needs WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET and a test number |
| Meta templates for notifications (10.5) | 4 | 5 | Sent by name with the first name only; templates must be created and approved in Meta |
| Phone and name encrypted, pseudonymous logs, abuse limits, manual blocking (10.6) | 2 | 1 | |
| Offline: encrypted local queue, unique ID per submission, deleted after sync, session timeout, installable with K splash (11) | 2 | 1 | Low-end Android and 3G testing is a field task |
| Vehicle location level 1 restricted and logged; level 2 prepared and off; retention (12) | 2 | 1 | Retention days left empty until approved (nothing deleted) |
| 2FA for all institutional accounts (13) | 2 | 1 | Demo accounts exempt only while demo mode is on |
| Chained hash covering records and Raíces (13) | 1 | 1 | |
| Metadata stripped on receipt (13) | 4 | 1 | JPEG/PNG/WebP, no dependency |
| Encrypted daily backups, off-server copy, monthly restore test (13) | 2 | 2 | Encrypted, Supabase copy and monthly test work; second copy outside Supabase waits for the storage account from Kindra |
| Exports logged; full export JSON/CSV with documentation (13) | 2 | 1 | |
| Weekly reconciliation: manual import, 5 % alert, factor flag, discrepancies with owner and date (14) | 2 | 1 | |

## 2. What needs the Kindra team

1. WhatsApp Business API account, test number and the four keys above; creation of the five templates (reporte_validado, lote_asignado, cambio_estado_lote, cierre_propuesto, caso_reabierto).
2. Approval of the Training course texts and the AURA texts (marked pending).
3. Open-data licence, official emergency number for AURA, support hours, data-retention periods.
4. Sector lists for Macuto (and final sector boundaries for the other parishes).
5. Storage account for the second backup copy outside Supabase; email provider key.
