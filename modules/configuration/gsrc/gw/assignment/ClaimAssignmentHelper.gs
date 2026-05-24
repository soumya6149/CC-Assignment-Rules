package gw.assignment

uses gw.api.database.Query
uses gw.api.util.DateUtil
uses gw.transaction.Transaction
uses java.math.BigDecimal

/**
 * ClaimAssignmentHelper.gs
 * ==========================
 * Central Gosu helper class for Claim Assignment Rules in ClaimCenter.
 *
 * Responsibilities:
 *  - Assign claims to adjuster groups by name or jurisdiction
 *  - Find adjuster groups from the ClaimCenter database
 *  - Calculate total reserve amounts across all exposures
 *  - Create assignment notification activities
 *  - Escalate unassigned claims after SLA breach
 *
 * Compatible: Guidewire ClaimCenter 9.x / 10.x / Cloud (Jasmine+)
 * Author    : Soumya | Senior Guidewire ClaimCenter Developer
 */
class ClaimAssignmentHelper {

  // ─── Assignment Methods ────────────────────────────────────────────────────

  /**
   * Assigns a claim to an adjuster group by exact group name.
   * Logs a warning activity if the group is not found.
   *
   * @param claim      Claim entity to assign
   * @param groupName  Display name of the target adjuster group
   */
  static function assignToGroup(claim : Claim, groupName : String) {
    var group = findGroupByName(groupName)
    if (group != null) {
      claim.AssignedGroup = group
      claim.AssignedUser  = null  // Clear individual assignment; group owns it
    } else {
      // Fallback: assign to General Adjusters if target group not found
      var fallback = findGroupByName("General Adjusters")
      if (fallback != null) {
        claim.AssignedGroup = fallback
      }
      createAssignmentActivity(claim,
        "Assignment Warning — Group Not Found",
        "Target group '" + groupName + "' not found for claim " + claim.ClaimNumber
          + ". Assigned to General Adjusters as fallback.",
        Priority.TC_HIGH)
    }
  }

  /**
   * Assigns a claim to a jurisdiction-specific adjuster group.
   * Constructs group name as "<baseGroupName> - <StateName>".
   * Falls back to the base group if no state-specific group exists.
   *
   * @param claim          Claim entity to assign
   * @param baseGroupName  Base group name (e.g. "Auto PD Adjusters")
   * @param state          JurisdictionState typekey (e.g. TC_TX)
   */
  static function assignToGroupByJurisdiction(claim : Claim, baseGroupName : String, state : typekey.State) {
    if (state != null) {
      // Try state-specific group first: e.g. "Auto PD Adjusters - Texas"
      var stateGroupName = baseGroupName + " - " + state.DisplayName
      var stateGroup     = findGroupByName(stateGroupName)
      if (stateGroup != null) {
        claim.AssignedGroup = stateGroup
        return
      }
    }
    // Fallback to base group (no state-specific group configured)
    assignToGroup(claim, baseGroupName)
  }

  /**
   * Assigns the claim directly to a specific adjuster user by username.
   * Used for VIP accounts or direct supervisor assignments.
   *
   * @param claim     Claim entity to assign
   * @param username  Username of the target adjuster
   */
  static function assignToUser(claim : Claim, username : String) {
    var user = findUserByUsername(username)
    if (user != null) {
      claim.AssignedUser  = user
      claim.AssignedGroup = user.Group
    } else {
      createAssignmentActivity(claim,
        "Assignment Warning — User Not Found",
        "Target user '" + username + "' not found for claim " + claim.ClaimNumber + ".",
        Priority.TC_HIGH)
    }
  }

  // ─── Reserve Calculation ──────────────────────────────────────────────────

  /**
   * Calculates the total reserve amount across all exposures on the claim.
   * Sums loss reserves only (excludes ALAE, expense reserves).
   *
   * @param claim  Claim entity
   * @return       Total reserve as BigDecimal (0 if no exposures/reserves)
   */
  static function getTotalReserveAmount(claim : Claim) : BigDecimal {
    var total = 0bd
    if (claim.Exposures == null or claim.Exposures.isEmpty()) {
      return total
    }
    for (exposure in claim.Exposures) {
      if (exposure.PrimaryReserve != null and exposure.PrimaryReserve.ReserveAmount != null) {
        total = total + exposure.PrimaryReserve.ReserveAmount
      }
    }
    return total
  }

  /**
   * Returns true if total reserves exceed the given threshold.
   *
   * @param claim      Claim entity
   * @param threshold  BigDecimal dollar threshold to compare against
   */
  static function isHighReserveClaim(claim : Claim, threshold : BigDecimal) : boolean {
    return getTotalReserveAmount(claim) > threshold
  }

  // ─── Activity Creation ────────────────────────────────────────────────────

  /**
   * Creates an assignment notification activity on the claim.
   *
   * @param claim        Claim entity
   * @param subject      Activity subject line
   * @param description  Detailed activity description
   * @param priority     Priority typekey (TC_NORMAL, TC_HIGH, TC_URGENT)
   */
  static function createAssignmentActivity(claim : Claim, subject : String,
                                            description : String, priority : Priority) {
    var activity             = claim.newActivity()
    activity.ActivityPattern = ActivityPattern.finder.getActivityPatternByCode("claim_assignment_notification")
    activity.Subject         = subject
    activity.Description     = description
    activity.TargetDate      = DateUtil.addDays(DateUtil.currentDate(), 1)
    activity.Priority        = priority
    activity.Status          = ActivityStatus.TC_OPEN
  }

  // ─── SLA Escalation ──────────────────────────────────────────────────────

  /**
   * Escalates claim to supervisor if assignment SLA is breached.
   * SLA: claim must be acknowledged within 24 hours of assignment.
   * Called by scheduled batch process.
   *
   * @param claim  Claim entity to check and potentially escalate
   */
  static function escalateIfSLABreached(claim : Claim) {
    if (claim.AssignedGroup == null) return
    var assignedDate = claim.CreateTime
    if (assignedDate == null) return

    var hoursSinceAssignment = DateUtil.differenceBetweenDates(
      assignedDate, DateUtil.currentDateTime(), java.util.concurrent.TimeUnit.HOURS)

    if (hoursSinceAssignment > 24 and claim.State == ClaimState.TC_OPEN) {
      // Find supervisor of current assigned group
      var supervisor = findGroupSupervisor(claim.AssignedGroup)
      if (supervisor != null) {
        createAssignmentActivity(claim,
          "SLA Breach — Escalation Required",
          "Claim " + claim.ClaimNumber + " has not been acknowledged within 24 hours. "
            + "Escalating to supervisor: " + supervisor.DisplayName,
          Priority.TC_URGENT)
        claim.AssignedUser = supervisor
      }
    }
  }

  // ─── Database Lookup Utilities ────────────────────────────────────────────

  /**
   * Finds a Group entity by its display name.
   */
  static function findGroupByName(name : String) : Group {
    var q = Query.make(Group)
    q.compare("Name", Relop.Equals, name)
    return q.select().FirstResult
  }

  /**
   * Finds a User entity by their username (login ID).
   */
  static function findUserByUsername(username : String) : User {
    var q = Query.make(User)
    q.compare("Credential.UserName", Relop.Equals, username)
    return q.select().FirstResult
  }

  /**
   * Returns the supervisor/manager user of a given Group.
   */
  private static function findGroupSupervisor(group : Group) : User {
    if (group == null) return null
    return group.Supervisor
  }
}
