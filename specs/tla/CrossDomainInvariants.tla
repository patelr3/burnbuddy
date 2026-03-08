---- MODULE CrossDomainInvariants ----
(*
  Cross-domain invariants spanning all BurnBuddy domain specifications.
  Verifies that relationship dependencies across domain boundaries are
  maintained correctly under all possible interleavings.

  This composite spec combines simplified state and actions from:
    - UserProfileManagement (profile existence gating)
    - FriendManagement (friendship relationships)
    - BurnBuddyManagement (burn buddy relationships)
    - BurnSquadManagement (squad membership)
    - WorkoutLifecycle (workouts and group workout detection)
    - PushNotifications (fire-and-forget — structural only, not re-modeled)

  Cross-domain invariants verified:
    CDI-1: Profile required before social operations (friends/buddies/squads/workouts)
    CDI-2: Friendship required before burn buddy creation (structural guard)
    CDI-3: GroupWorkout references valid buddy/squad at creation time (structural)
    CDI-4: GroupWorkout memberUids match membership at creation time (structural)
    CDI-5: Deleting friend prevents new burn buddy requests (structural)
    CDI-6: Deleting burn buddy orphans GroupWorkouts — documented by-design behavior
    CDI-7: Deleting burn squad orphans GroupWorkouts — documented by-design behavior
    CDI-8: No burn buddy without an active friendship (cascade-enforced)

  Maps to: All route handlers in services/api/src/routes/

  Discrepancies documented inline:
    - Burn buddy relationships are cascade-deleted when friendship is deleted
    - GroupWorkouts persist after buddy/squad deletion (by design — historical records)
    - The API friend request handler (friends.ts) does NOT explicitly check for
      profile existence — it relies on the frontend flow. A direct API call with
      a valid Firebase token but no profile would succeed. This spec models the
      IDEAL behavior where profile existence is enforced.
*)
EXTENDS Integers, FiniteSets, TLC

CONSTANT Uid
CONSTANT SquadId
CONSTANT WorkoutId
CONSTANT MaxTime

\* --- Abstract time threshold (same as WorkoutLifecycle.tla) ---
WindowSize == 1

VARIABLES
    createdProfiles,    \* SUBSET Uid — users with profiles
    friends,            \* Set of sets {u1, u2} — active friendships
    burnBuddies,        \* Set of sets {u1, u2} — active buddy relationships
    squads,             \* Set of records [id, adminUid, memberUids]
    time,               \* Current abstract time (1..MaxTime)
    workouts,           \* Set of workout records
    groupWorkouts       \* Set of group workout records

vars == <<createdProfiles, friends, burnBuddies, squads,
          time, workouts, groupWorkouts>>

\* ====================================================================
\* Helpers
\* ====================================================================

AllPairs == { pair \in SUBSET Uid : Cardinality(pair) = 2 }

SquadExists(sid) == \E s \in squads : s.id = sid
SquadById(sid) == CHOOSE s \in squads : s.id = sid

UsedWorkoutIds == { w.id : w \in workouts }

ActiveInWindow(uid) ==
    { w \in workouts :
        /\ w.uid = uid
        /\ w.status = "active"
        /\ time - w.startedAt <= WindowSize }

GroupWorkoutExistsInWindow(refId, gwt) ==
    \E gw \in groupWorkouts :
        /\ gw.gwType = gwt
        /\ gw.referenceId = refId
        /\ time - gw.detectedAt <= WindowSize

\* Symmetry for TLC state-space reduction
Symmetry == Permutations(Uid) \cup Permutations(WorkoutId)

\* ====================================================================
\* Type invariant
\* ====================================================================

TypeOK ==
    /\ createdProfiles \subseteq Uid
    /\ friends \subseteq SUBSET Uid
    /\ \A f \in friends : Cardinality(f) = 2
    /\ burnBuddies \subseteq SUBSET Uid
    /\ \A b \in burnBuddies : Cardinality(b) = 2
    /\ \A s \in squads :
        /\ s.id \in SquadId
        /\ s.adminUid \in Uid
        /\ s.memberUids \subseteq Uid
    /\ time \in 1..MaxTime
    /\ \A w \in workouts :
        /\ w.id \in WorkoutId
        /\ w.uid \in Uid
        /\ w.status \in {"active", "completed"}
        /\ w.startedAt \in 1..MaxTime
        /\ w.endedAt \in 0..MaxTime
    /\ \A gw \in groupWorkouts :
        /\ gw.gwType \in {"buddy", "squad"}
        /\ gw.memberUids \subseteq Uid
        /\ gw.detectedAt \in 1..MaxTime
        /\ gw.workoutIds \subseteq WorkoutId

\* ====================================================================
\* Initial state
\* ====================================================================

Init ==
    /\ createdProfiles = {}
    /\ friends = {}
    /\ burnBuddies = {}
    /\ squads = {}
    /\ time = 1
    /\ workouts = {}
    /\ groupWorkouts = {}

\* ====================================================================
\* Actions — Users domain
\* ====================================================================

(* Create a user profile. Prerequisite for all social operations. *)
CreateProfile(uid) ==
    /\ uid \notin createdProfiles
    /\ createdProfiles' = createdProfiles \cup {uid}
    /\ UNCHANGED <<friends, burnBuddies, squads, time, workouts, groupWorkouts>>

\* ====================================================================
\* Actions — Friends domain (simplified from FriendManagement.tla)
\* ====================================================================

(* Create a friendship. CDI-1: both users must have profiles. *)
CreateFriendship(u1, u2) ==
    /\ u1 /= u2
    /\ u1 \in createdProfiles                   \* CDI-1: profile required
    /\ u2 \in createdProfiles                   \* CDI-1: profile required
    /\ {u1, u2} \notin friends
    /\ friends' = friends \cup {{u1, u2}}
    /\ UNCHANGED <<createdProfiles, burnBuddies, squads,
                   time, workouts, groupWorkouts>>

(* Delete a friendship. CDI-5: this prevents new burn buddy requests
   between these users (CreateBurnBuddy checks friendship in its guard).
   CDI-8: burn buddy relationship is cascade-deleted to maintain the
   invariant that no burn buddy can exist without an active friendship.
   Pending burn buddy requests are also removed in the API implementation. *)
DeleteFriendship(u1, u2) ==
    /\ {u1, u2} \in friends
    /\ friends' = friends \ {{u1, u2}}
    /\ burnBuddies' = burnBuddies \ {{u1, u2}}
    /\ UNCHANGED <<createdProfiles, squads,
                   time, workouts, groupWorkouts>>

\* ====================================================================
\* Actions — Burn Buddies domain (simplified from BurnBuddyManagement.tla)
\* ====================================================================

(* Create a burn buddy relationship.
   CDI-1: both users must have profiles.
   CDI-2: friendship required — CreateBurnBuddy guards on {u1, u2} \in friends.
   CDI-5: if friendship was deleted, this guard blocks the action. *)
CreateBurnBuddy(u1, u2) ==
    /\ u1 /= u2
    /\ u1 \in createdProfiles                   \* CDI-1: profile required
    /\ u2 \in createdProfiles                   \* CDI-1: profile required
    /\ {u1, u2} \in friends                     \* CDI-2: friendship required
    /\ {u1, u2} \notin burnBuddies
    /\ burnBuddies' = burnBuddies \cup {{u1, u2}}
    /\ UNCHANGED <<createdProfiles, friends, squads,
                   time, workouts, groupWorkouts>>

(* Delete a burn buddy. CDI-6: associated GroupWorkouts become orphaned.
   The API does not cascade-delete GroupWorkouts on buddy deletion.
   GroupWorkouts are immutable historical records of past concurrent sessions. *)
DeleteBurnBuddy(u1, u2) ==
    /\ {u1, u2} \in burnBuddies
    /\ burnBuddies' = burnBuddies \ {{u1, u2}}
    /\ UNCHANGED <<createdProfiles, friends, squads,
                   time, workouts, groupWorkouts>>

\* ====================================================================
\* Actions — Burn Squads domain (simplified from BurnSquadManagement.tla)
\* ====================================================================

(* Create a squad. CDI-1: admin must have a profile. *)
CreateSquad(admin, sid) ==
    /\ admin \in createdProfiles                \* CDI-1: profile required
    /\ ~SquadExists(sid)
    /\ squads' = squads \cup
         {[id |-> sid, adminUid |-> admin, memberUids |-> {admin}]}
    /\ UNCHANGED <<createdProfiles, friends, burnBuddies,
                   time, workouts, groupWorkouts>>

(* Add a member to a squad. CDI-1: invitee must have a profile.
   Cross-domain: inviter and invitee must be friends. *)
AddSquadMember(inviter, invitee, sid) ==
    /\ inviter /= invitee
    /\ invitee \in createdProfiles              \* CDI-1: profile required
    /\ SquadExists(sid)
    /\ LET s == SquadById(sid)
       IN
       /\ inviter \in s.memberUids
       /\ invitee \notin s.memberUids
       /\ {inviter, invitee} \in friends        \* Cross-domain: friendship required
       /\ squads' = (squads \ {s}) \cup
            {[id |-> sid, adminUid |-> s.adminUid,
              memberUids |-> s.memberUids \cup {invitee}]}
    /\ UNCHANGED <<createdProfiles, friends, burnBuddies,
                   time, workouts, groupWorkouts>>

(* Delete a squad. CDI-7: associated GroupWorkouts become orphaned.
   Same rationale as CDI-6 — GroupWorkouts are historical records. *)
DeleteSquad(admin, sid) ==
    /\ SquadExists(sid)
    /\ LET s == SquadById(sid)
       IN
       /\ admin = s.adminUid
       /\ squads' = squads \ {s}
    /\ UNCHANGED <<createdProfiles, friends, burnBuddies,
                   time, workouts, groupWorkouts>>

\* ====================================================================
\* Actions — Workouts domain (simplified from WorkoutLifecycle.tla)
\* ====================================================================

(* Start a workout. CDI-1: user must have a profile. *)
StartWorkout(uid, wid) ==
    /\ uid \in createdProfiles                  \* CDI-1: profile required
    /\ wid \notin UsedWorkoutIds
    /\ workouts' = workouts \cup
         {[id |-> wid, uid |-> uid, status |-> "active",
           startedAt |-> time, endedAt |-> 0]}
    /\ UNCHANGED <<createdProfiles, friends, burnBuddies, squads,
                   time, groupWorkouts>>

(* End a workout. Only the owner can end it. *)
EndWorkout(uid, wid) ==
    \E w \in workouts :
        /\ w.id = wid
        /\ w.uid = uid
        /\ w.status = "active"
        /\ workouts' = (workouts \ {w}) \cup
             {[w EXCEPT !.status = "completed", !.endedAt = time]}
    /\ UNCHANGED <<createdProfiles, friends, burnBuddies, squads,
                   time, groupWorkouts>>

\* ====================================================================
\* Actions — Group Workout Detection (from WorkoutLifecycle.tla)
\* ====================================================================

(* Detect buddy group workout.
   CDI-3: referenceId (buddy pair) must exist at detection time.
   CDI-4: memberUids set to the buddy pair (matches membership). *)
DetectBuddyGroupWorkout(pair) ==
    /\ pair \in burnBuddies                     \* CDI-3: reference must exist
    /\ \A uid \in pair : ActiveInWindow(uid) /= {}
    /\ ~GroupWorkoutExistsInWindow(pair, "buddy")
    /\ LET wids == UNION { {w.id : w \in ActiveInWindow(uid)} : uid \in pair }
       IN groupWorkouts' = groupWorkouts \cup {[
            gwType      |-> "buddy",
            referenceId |-> pair,               \* CDI-3: valid buddy reference
            memberUids  |-> pair,               \* CDI-4: matches pair membership
            workoutIds  |-> wids,
            detectedAt  |-> time
          ]}
    /\ UNCHANGED <<createdProfiles, friends, burnBuddies, squads,
                   time, workouts>>

(* Detect squad group workout.
   CDI-3: referenceId (squad) must exist at detection time.
   CDI-4: memberUids set to squad's current membership. *)
DetectSquadGroupWorkout(sid) ==
    \E squad \in squads :
        /\ squad.id = sid
        /\ Cardinality(squad.memberUids) >= 2
        /\ \A uid \in squad.memberUids : ActiveInWindow(uid) /= {}
        /\ ~GroupWorkoutExistsInWindow(sid, "squad")
        /\ LET wids == UNION { {w.id : w \in ActiveInWindow(uid)} : uid \in squad.memberUids }
           IN groupWorkouts' = groupWorkouts \cup {[
                gwType      |-> "squad",
                referenceId |-> sid,            \* CDI-3: valid squad reference
                memberUids  |-> squad.memberUids, \* CDI-4: matches membership
                workoutIds  |-> wids,
                detectedAt  |-> time
              ]}
        /\ UNCHANGED <<createdProfiles, friends, burnBuddies, squads,
                       time, workouts>>

\* ====================================================================
\* Actions — Time advancement
\* ====================================================================

AdvanceTime ==
    /\ time < MaxTime
    /\ time' = time + 1
    /\ UNCHANGED <<createdProfiles, friends, burnBuddies, squads,
                   workouts, groupWorkouts>>

\* ====================================================================
\* Next-state relation and specification
\* ====================================================================

Next ==
    \* Users domain
    \/ \E uid \in Uid : CreateProfile(uid)
    \* Friends domain
    \/ \E u1, u2 \in Uid : CreateFriendship(u1, u2)
    \/ \E u1, u2 \in Uid : DeleteFriendship(u1, u2)
    \* Burn Buddies domain
    \/ \E u1, u2 \in Uid : CreateBurnBuddy(u1, u2)
    \/ \E u1, u2 \in Uid : DeleteBurnBuddy(u1, u2)
    \* Burn Squads domain
    \/ \E admin \in Uid, sid \in SquadId : CreateSquad(admin, sid)
    \/ \E inviter, invitee \in Uid, sid \in SquadId :
         AddSquadMember(inviter, invitee, sid)
    \/ \E admin \in Uid, sid \in SquadId : DeleteSquad(admin, sid)
    \* Workouts domain
    \/ \E uid \in Uid, wid \in WorkoutId : StartWorkout(uid, wid)
    \/ \E uid \in Uid, wid \in WorkoutId : EndWorkout(uid, wid)
    \* Group workout detection
    \/ \E pair \in AllPairs : DetectBuddyGroupWorkout(pair)
    \/ \E sid \in SquadId : DetectSquadGroupWorkout(sid)
    \* Time
    \/ AdvanceTime

Spec == Init /\ [][Next]_vars

\* ====================================================================
\* Cross-Domain Invariants
\* ====================================================================

(* CDI-1: Profile required before social operations.
   Every user participating in a friendship, burn buddy, squad, or workout
   must have a created profile. This is the primary cross-domain safety
   property — it ensures the profile layer gates all downstream operations.

   Maps to: The web app creates a profile after Firebase Auth signup before
   allowing any social features. The API routes implicitly assume this via
   Firebase Auth UID.

   DISCREPANCY: The API friend request handler (friends.ts) does NOT
   explicitly check for profile existence — it relies on the frontend flow.
   A direct API call with a valid Firebase token but no profile would succeed.
   This spec models the IDEAL behavior where profile existence is enforced. *)
ProfileRequiredForSocialActions ==
    \* Friends: both parties must have profiles
    /\ \A f \in friends : \A u \in f : u \in createdProfiles
    \* Burn buddies: both parties must have profiles
    /\ \A b \in burnBuddies : \A u \in b : u \in createdProfiles
    \* Squads: all members must have profiles
    /\ \A s \in squads : \A u \in s.memberUids : u \in createdProfiles
    \* Workouts: owner must have profile
    /\ \A w \in workouts : w.uid \in createdProfiles

(* CDI-2: Friendship is required before burn buddy creation.
   Enforced structurally by the CreateBurnBuddy guard:
     {u1, u2} \in friends
   TLC verifies no reachable state has a burn buddy pair where
   friendship never existed. After buddy creation, friendship may be
   deleted — the burn buddy relationship persists (by design). *)

(* CDI-3 & CDI-4: GroupWorkout references valid buddy/squad and memberUids
   match membership at creation time.
   Enforced structurally by DetectBuddyGroupWorkout and DetectSquadGroupWorkout
   action guards — pair \in burnBuddies / squad.id = sid checks.
   After creation, the reference may become stale (CDI-6/CDI-7). *)

(* CDI-5: Deleting friend prevents new burn buddy requests.
   After DeleteFriendship(u1, u2), CreateBurnBuddy(u1, u2) cannot fire
   because its guard {u1, u2} \in friends will be false.
   Enforced structurally — TLC verifies via state exploration. *)

(* CDI-6: Deleting burn buddy orphans GroupWorkouts — BY DESIGN.
   After DeleteBurnBuddy, GroupWorkouts with referenceId = deleted pair
   remain in the database. This is intentional: GroupWorkouts are immutable
   historical records of past concurrent workout sessions.
   Observable: gw.gwType = "buddy" /\ gw.referenceId \notin burnBuddies
   is EXPECTED in reachable states after buddy deletion.
   Note: burn buddies are also cascade-deleted when friendship is removed
   (DeleteFriendship), which can also orphan GroupWorkouts. *)

(* CDI-7: Deleting squad orphans GroupWorkouts — BY DESIGN.
   After DeleteSquad, GroupWorkouts with referenceId = deleted squad ID
   remain in the database. Same rationale as CDI-6.
   Observable: gw.gwType = "squad" /\ ~SquadExists(gw.referenceId)
   is EXPECTED in reachable states after squad deletion. *)

(* CDI-8: No burn buddy without an active friendship.
   Every burn buddy pair must have a corresponding active friendship.
   Enforced by: CreateBurnBuddy guards on {u1, u2} \in friends,
   and DeleteFriendship cascade-deletes the burn buddy pair.
   Maps to: DELETE /friends/:uid in friends.ts cascade-deletes burn buddies. *)
NoBuddyWithoutFriendship ==
    \A bb \in burnBuddies : bb \in friends

(* Combined cross-domain invariant.
   Only includes verifiable state predicates. Structural properties
   (CDI-2 through CDI-5) are enforced by action guards and verified
   by TLC exploring all interleavings. By-design behaviors (CDI-6,
   CDI-7) are documented but intentionally not checked as violations.
   CDI-8 is actively checked — burn buddy requires active friendship. *)
CrossDomainInvariant ==
    /\ TypeOK
    /\ ProfileRequiredForSocialActions
    /\ NoBuddyWithoutFriendship

====
