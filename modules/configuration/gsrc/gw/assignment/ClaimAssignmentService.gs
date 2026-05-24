package gw.assignment

uses gw.api.database.Query
uses gw.transaction.Transaction

/**
 * ClaimAssignmentService.gs
 * ===========================
 * Service layer for claim assignment operations in ClaimCenter.
 * Provides high-level assignment operations used by PCF screens,
 * batch processes, and integration entry points.
 *
 * Compatible: Guidewire ClaimCenter 9.x / 10.x / Cloud (Jasmine+)
 * Author    : Soumya | Senior Guidewire ClaimCenter Developer
 */
class ClaimAssignmentService {

  /**
   * Triggers the ClaimCenter Assignment Rules Engine on a claim.
   * Called after FNOL submission or when manual re-assignment is requested.
   *
   * @param claim  Claim entity to evaluate assignment rules against
   */
  static function runAssignmentRules(claim : Claim) {
    Transaction.runWithNewBundle(\ bundle -> {
      var c = bundle.add(claim)
      // Trigger ClaimCenter's built-in rules engine for Assignment rules
      gw.api.rule.RuleEngine.runRules(c, "Assignment")
    })
  }

  /**
   * Manually reassigns a claim to a different group.
   * Records a reassignment activity with reason.
   *
   * @param claim      Claim entity to reassign
   * @param groupName  New adjuster group name
   * @param reason     Reason for manual reassignment
   */
  static function reassignClaimToGroup(claim : Claim, groupName : String, reason : String) {
    Transaction.runWithNewBundle(\ bundle -> {
      var c             = bundle.add(claim)
      var previousGroup = c.AssignedGroup != null ? c.AssignedGroup.Name : "Unassigned"
      ClaimAssignmentHelper.assignToGroup(c, groupName)
      ClaimAssignmentHelper.createAssignmentActivity(c,
        "Manual Reassignment",
        "Claim " + c.ClaimNumber + " reassigned from '" + previousGroup
          + "' to '" + groupName + "'. Reason: " + reason,
        Priority.TC_NORMAL)
    })
  }

  /**
   * Reassigns a claim directly to a specific adjuster user.
   * Used for supervisor overrides and VIP account assignments.
   *
   * @param claim     Claim entity to reassign
   * @param username  Target adjuster username
   * @param reason    Reason for individual assignment
   */
  static function reassignClaimToUser(claim : Claim, username : String, reason : String) {
    Transaction.runWithNewBundle(\ bundle -> {
      var c = bundle.add(claim)
      ClaimAssignmentHelper.assignToUser(c, username)
      ClaimAssignmentHelper.createAssignmentActivity(c,
        "Direct User Assignment",
        "Claim " + c.ClaimNumber + " directly assigned to adjuster '"
          + username + "'. Reason: " + reason,
        Priority.TC_NORMAL)
    })
  }

  /**
   * Batch method: re-evaluates assignment rules for all open, unassigned claims.
   * Intended to be called by a ClaimCenter batch process.
   */
  static function rerunAssignmentForUnassignedClaims() {
    var q = Query.make(Claim)
    q.compare("State",          Relop.Equals,  ClaimState.TC_OPEN)
    q.compare("AssignedGroup",  Relop.Equals,  null)
    var unassignedClaims = q.select()

    for (claim in unassignedClaims) {
      try {
        runAssignmentRules(claim)
      } catch (e : Exception) {
        // Log and continue — don't let one failure block the batch
        gw.api.util.Logger.forCategory("ClaimAssignmentService")
          .error("Failed to assign claim: " + claim.ClaimNumber + " — " + e.Message)
      }
    }
  }

  /**
   * Returns all open claims currently assigned to a specific group.
   *
   * @param groupName  Name of the adjuster group to query
   * @return           List of open claims assigned to that group
   */
  static function getOpenClaimsByGroup(groupName : String) : List<Claim> {
    var group = ClaimAssignmentHelper.findGroupByName(groupName)
    if (group == null) return new java.util.ArrayList<Claim>()

    var q = Query.make(Claim)
    q.compare("AssignedGroup", Relop.Equals, group)
    q.compare("State",         Relop.Equals, ClaimState.TC_OPEN)
    return q.select().toList()
  }
}
