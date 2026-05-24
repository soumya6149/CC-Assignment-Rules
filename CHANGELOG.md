# Changelog

## [1.0.0] - 2026-05-24

### Added
- `ClaimAssignmentRules.grs` — 9 assignment rules (CAT, Litigation, High Reserve, WC, BI, Auto PD, Property, GL, Default)
- `ClaimAssignmentHelper.gs` — Group/user assignment, reserve calculation, SLA escalation
- `ClaimAssignmentService.gs` — Service layer: run rules, reassign, batch processing
- `ClaimAssignmentValidationRules.grs` — 3 validation rules for assignment integrity
- `ClaimAssignmentHelperTest.gs` — 9 CCTestBase unit tests
- Full `README.md` with routing decision tree and deployment guide
- `LICENSE`, `.gitignore`, `CHANGELOG.md`

### Compatibility
- Guidewire ClaimCenter 9.x, 10.x, Cloud (Jasmine+)
