# Guidewire ClaimCenter — Claim Assignment Rules

[![Guidewire ClaimCenter](https://img.shields.io/badge/Guidewire-ClaimCenter-orange?style=flat-square)](https://www.guidewire.com)
[![Language: Gosu](https://img.shields.io/badge/Language-Gosu-blue?style=flat-square)](https://gosu-lang.github.io/)
[![Rules Engine](https://img.shields.io/badge/Rules-Assignment%20%7C%20Validation-green?style=flat-square)](https://docs.guidewire.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

---

A Guidewire ClaimCenter customization implementing automated claim routing via the ClaimCenter Assignment Rules Engine, Gosu helper/service classes, validation rules, and a comprehensive CCTestBase unit test suite.

---

## Business Problem Solved

Manual claim assignment is error-prone and slow. This solution automates claim routing
using a priority-ordered rule set that evaluates 6 business dimensions:

| Dimension | Example |
|---|---|
| Catastrophe Flag | CAT claims → CAT Adjusters (Priority 1) |
| Legal Representation | Represented → Litigation Unit (Priority 2) |
| Reserve Threshold | > $100K → Senior Adjusters (Priority 3) |
| Loss Type | WC → WC Adjusters, BI → BI Adjusters |
| Jurisdiction (State) | Auto PD TX → Auto PD Adjusters - Texas |
| Default Fallback | Unmatched → General Adjusters |

---

## Project Structure

```
CC-Assignment-Rules/
│
├── modules/
│   └── configuration/
│       ├── config/
│       │   └── rules/
│       │       ├── Assignment/
│       │       │   └── ClaimAssignmentRules.grs           # 9 assignment routing rules
│       │       └── Validation/
│       │           └── ClaimAssignmentValidationRules.grs # 3 integrity validation rules
│       │
│       └── gsrc/gw/assignment/
│           ├── ClaimAssignmentHelper.gs                   # Core assignment logic
│           ├── ClaimAssignmentService.gs                  # Service layer & batch processing
│           └── test/
│               └── ClaimAssignmentHelperTest.gs           # 9 CCTestBase unit tests
│
├── docs/
├── README.md
├── CHANGELOG.md
├── LICENSE
└── .gitignore
```

---

## Assignment Routing Decision Tree

```
New Claim Arrives
       │
       ▼
[CatastropheFlag == true?] ──YES──► CAT Adjusters (Priority 1 — URGENT)
       │NO
       ▼
[RepresentedFlag == true?] ──YES──► Litigation Unit (Priority 2 — HIGH)
       │NO
       ▼
[Total Reserves > $100K?]  ──YES──► Senior Adjusters (Priority 3 — HIGH)
       │NO
       ▼
[LossType == WC?]          ──YES──► WC Adjusters by Jurisdiction (Priority 4)
       │NO
       ▼
[LossType == Auto BI?]     ──YES──► Bodily Injury Adjusters (Priority 5)
       │NO
       ▼
[LossType == Auto PD?]     ──YES──► Auto PD Adjusters by State (Priority 6)
       │NO
       ▼
[LossType == Property?]    ──YES──► Property or Senior Property Adjusters (Priority 7)
       │NO
       ▼
[LossType == GL?]          ──YES──► GL Adjusters (Priority 8)
       │NO
       ▼
[Default Fallback]                ► General Adjusters (Priority 99)
```

---

## Components

### Assignment Rules (`ClaimAssignmentRules.grs`)

| Priority | Rule ID | Condition | Routes To |
|---|---|---|---|
| 1 | `CatastropheClaimAssignment` | `CatastropheFlag == true` | CAT Adjusters |
| 2 | `RepresentedClaimantAssignment` | `RepresentedFlag == true` | Litigation Unit |
| 3 | `HighReserveClaimAssignment` | Reserves > $100K | Senior Adjusters |
| 4 | `WorkersCompAssignment` | LossType == WC | WC Adjusters (by state) |
| 5 | `AutoBodilyInjuryAssignment` | LossType == Auto BI | Bodily Injury Adjusters |
| 6 | `AutoPhysicalDamageAssignment` | LossType == Auto PD | Auto PD Adjusters (by state) |
| 7 | `PropertyClaimAssignment` | LossType == Property | Property / Senior Property Adjusters |
| 8 | `GeneralLiabilityAssignment` | LossType == GL | GL Adjusters |
| 99 | `DefaultAssignment` | No group assigned | General Adjusters |

### Gosu Helper (`ClaimAssignmentHelper.gs`)

| Method | Purpose |
|---|---|
| `assignToGroup(claim, groupName)` | Assigns claim to group; fallback to General Adjusters if not found |
| `assignToGroupByJurisdiction(claim, baseGroup, state)` | State-specific routing with base group fallback |
| `assignToUser(claim, username)` | Direct user assignment for VIP/supervisor override |
| `getTotalReserveAmount(claim)` | Sums reserves across all exposures |
| `isHighReserveClaim(claim, threshold)` | Boolean reserve threshold check |
| `createAssignmentActivity(claim, ...)` | Creates assignment notification activity |
| `escalateIfSLABreached(claim)` | Escalates to supervisor after 24-hour SLA breach |

### Service Layer (`ClaimAssignmentService.gs`)

| Method | Purpose |
|---|---|
| `runAssignmentRules(claim)` | Triggers rules engine on a claim |
| `reassignClaimToGroup(claim, group, reason)` | Manual group reassignment with audit trail |
| `reassignClaimToUser(claim, username, reason)` | Direct user reassignment |
| `rerunAssignmentForUnassignedClaims()` | Batch: re-evaluate all open unassigned claims |
| `getOpenClaimsByGroup(groupName)` | Returns all open claims for a group |

### Validation Rules (`ClaimAssignmentValidationRules.grs`)

| Rule | Severity | Check |
|---|---|---|
| `OpenClaimMustBeAssigned` | ⚠️ Warning | Open claim has no assigned group |
| `CATClaimMustBeAssignedToCATGroup` | ❌ Error | CAT claim not in CAT Adjusters group |
| `RepresentedClaimMustBeInLitigationUnit` | ⚠️ Warning | Represented claim outside Litigation Unit |

---

## How to Deploy

```bash
# 1. Clone
git clone https://github.com/soumya6149/CC-Assignment-Rules.git

# 2. Copy into your CC project
cp -r modules/ <your-cc-project>/

# 3. Refresh in Guidewire Studio
# 4. Build & deploy to CC dev server
# 5. Test: Create a WC claim → verify auto-routes to WC Adjusters group
```

### Required DisplayKeys

Add to `DisplayKey.properties`:
```properties
Web.Assignment.Validation.NoGroupAssigned=Claim {0} is open but has no assigned adjuster group.
Web.Assignment.Validation.CATClaimWrongGroup=CAT claims must be assigned to the CAT Adjusters group.
Web.Assignment.Validation.RepresentedClaimWrongGroup=Represented claims should be in the Litigation Unit.
```

### Required Activity Pattern Codes
Ensure these activity pattern codes exist in your CC config:
- `claim_assignment_notification`

---

## Unit Tests

9 test scenarios covering all routing paths and reserve calculations.

Run in Guidewire Studio:
`gsrc/gw/assignment/test/ClaimAssignmentHelperTest.gs` → Right-click → Run As → ClaimCenter Test

---

## Compatibility

| Version | Status |
|---|---|
| ClaimCenter 9.x (On-Premise) | ✅ Compatible |
| ClaimCenter 10.x (On-Premise) | ✅ Compatible |
| ClaimCenter Cloud (Jasmine+) | ✅ Compatible |

---

## Author

**Soumya** — Senior Guidewire ClaimCenter Developer
🔗 [LinkedIn](https://linkedin.com/in/soumya6149) | 💻 [GitHub](https://github.com/soumya6149)

---

## License

MIT License — see [LICENSE](LICENSE) for details.
