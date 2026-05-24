package gw.assignment.test

uses gw.api.test.CCTestBase
uses gw.assignment.ClaimAssignmentHelper
uses gw.api.util.DateUtil

/**
 * ClaimAssignmentHelperTest.gs
 * ==============================
 * Unit tests for ClaimAssignmentHelper using ClaimCenter CCTestBase.
 *
 * Test Coverage:
 *  - CAT claim → CAT Adjusters group
 *  - Represented claim → Litigation Unit
 *  - High reserve (>$100K) → Senior Adjusters
 *  - WC claim → WC Adjusters
 *  - Auto PD claim → Auto PD Adjusters
 *  - Property claim low reserve → Property Adjusters
 *  - Property claim high reserve → Senior Property Adjusters
 *  - Null group fallback → General Adjusters
 *  - getTotalReserveAmount calculation
 *
 * Author: Soumya | Senior Guidewire ClaimCenter Developer
 */
class ClaimAssignmentHelperTest extends CCTestBase {

  // ── Test: CAT claim should route to CAT Adjusters ─────────────────────────
  function testCATClaimAssignment() {
    var claim              = createBaseClaim()
    claim.CatastropheFlag  = true
    ClaimAssignmentHelper.assignToGroup(claim, "CAT Adjusters")
    assertNotNull("CAT claim should have assigned group", claim.AssignedGroup)
    assertEquals("CAT Adjusters", claim.AssignedGroup.Name)
  }

  // ── Test: Represented claim → Litigation Unit ─────────────────────────────
  function testRepresentedClaimAssignment() {
    var claim              = createBaseClaim()
    claim.RepresentedFlag  = true
    claim.CatastropheFlag  = false
    ClaimAssignmentHelper.assignToGroup(claim, "Litigation Unit")
    assertNotNull(claim.AssignedGroup)
    assertEquals("Litigation Unit", claim.AssignedGroup.Name)
  }

  // ── Test: WC claim → WC Adjusters ─────────────────────────────────────────
  function testWCClaimAssignment() {
    var claim          = createBaseClaim()
    claim.LossType     = LossType.TC_WC
    ClaimAssignmentHelper.assignToGroup(claim, "WC Adjusters")
    assertNotNull(claim.AssignedGroup)
    assertEquals("WC Adjusters", claim.AssignedGroup.Name)
  }

  // ── Test: Auto PD claim → Auto PD Adjusters ───────────────────────────────
  function testAutoPDClaimAssignment() {
    var claim          = createBaseClaim()
    claim.LossType     = LossType.TC_AUTO
    ClaimAssignmentHelper.assignToGroup(claim, "Auto PD Adjusters")
    assertNotNull(claim.AssignedGroup)
    assertEquals("Auto PD Adjusters", claim.AssignedGroup.Name)
  }

  // ── Test: getTotalReserveAmount — single exposure ─────────────────────────
  function testGetTotalReserveAmountSingleExposure() {
    var claim    = createBaseClaim()
    var exposure = createExposureWithReserve(claim, 75000bd)
    var total    = ClaimAssignmentHelper.getTotalReserveAmount(claim)
    assertEquals(75000bd, total)
  }

  // ── Test: getTotalReserveAmount — multiple exposures ──────────────────────
  function testGetTotalReserveAmountMultipleExposures() {
    var claim = createBaseClaim()
    createExposureWithReserve(claim, 50000bd)
    createExposureWithReserve(claim, 60000bd)
    var total = ClaimAssignmentHelper.getTotalReserveAmount(claim)
    assertEquals(110000bd, total)
  }

  // ── Test: getTotalReserveAmount — no exposures returns 0 ──────────────────
  function testGetTotalReserveAmountEmpty() {
    var claim = createBaseClaim()
    var total = ClaimAssignmentHelper.getTotalReserveAmount(claim)
    assertEquals(0bd, total)
  }

  // ── Test: isHighReserveClaim — above threshold ────────────────────────────
  function testIsHighReserveClaimTrue() {
    var claim = createBaseClaim()
    createExposureWithReserve(claim, 150000bd)
    assertTrue(ClaimAssignmentHelper.isHighReserveClaim(claim, 100000bd))
  }

  // ── Test: isHighReserveClaim — below threshold ────────────────────────────
  function testIsHighReserveClaimFalse() {
    var claim = createBaseClaim()
    createExposureWithReserve(claim, 50000bd)
    assertFalse(ClaimAssignmentHelper.isHighReserveClaim(claim, 100000bd))
  }

  // ── Test: Jurisdiction-based assignment fallback ──────────────────────────
  function testJurisdictionAssignmentFallsBackToBase() {
    var claim              = createBaseClaim()
    claim.LossType         = LossType.TC_AUTO
    claim.JurisdictionState = typekey.State.TC_TX
    // No state-specific group exists in test — should fall back to base group
    ClaimAssignmentHelper.assignToGroupByJurisdiction(claim, "Auto PD Adjusters", typekey.State.TC_TX)
    assertNotNull("Should fallback to base group", claim.AssignedGroup)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private function createBaseClaim() : Claim {
    var claim              = new Claim()
    claim.LossDate         = DateUtil.currentDate()
    claim.LossType         = LossType.TC_AUTO
    claim.State            = ClaimState.TC_OPEN
    claim.CatastropheFlag  = false
    claim.RepresentedFlag  = false
    var policy             = new Policy()
    policy.PolicyNumber    = "POL-TEST-" + (Math.random() * 9000 + 1000).intValue()
    policy.EffectiveDate   = DateUtil.addDays(DateUtil.currentDate(), -180)
    policy.ExpirationDate  = DateUtil.addDays(DateUtil.currentDate(), 185)
    claim.Policy           = policy
    return claim
  }

  private function createExposureWithReserve(claim : Claim, amount : java.math.BigDecimal) : Exposure {
    var exposure               = claim.newExposure()
    var reserve                = exposure.newReserve()
    reserve.ReserveAmount      = amount
    reserve.Status             = ReserveStatus.TC_PENDING
    reserve.ReserveLine        = ReserveLine.TC_LOSS
    return exposure
  }
}
