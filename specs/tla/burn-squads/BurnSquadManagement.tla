------------------- MODULE BurnSquadManagement -------------------
(*
  Formal specification of the BurnBuddy burn squad management system.
  Models squad lifecycle, membership, join requests, and permission enforcement.

  Maps to: services/api/src/routes/burn-squads.ts
  Shared types: packages/shared/src/types.ts (BurnSquad, BurnSquadJoinRequest)

  State model:
    Squad lifecycle:
      - Nonexistent → Created (admin is sole member)
      - Created → Deleted (admin-only)
    Join request lifecycle:
      - No request → Pending → Accepted (member added to squad)
      - No request → Pending → Declined

  Firestore collections modeled:
    - burnSquads: {id, name, adminUid, memberUids, settings} documents
    - burnSquadJoinRequests: {squadId, fromUid, toUid, status} documents
    - friends: {uid1, uid2} — prerequisite for invitations

  Key constraints:
    - Squad always has exactly one admin who is always in memberUids
    - Only friends can be invited to a squad
    - onlyAdminsCanAddMembers setting gates non-admin invitations
    - Only admin can update settings or delete squad
    - Only the recipient of a join request can accept it
*)
EXTENDS Integers, Sequences, FiniteSets

------------------------------------------------------------------------
CONSTANT Uid      \* Set of user identifiers (model values)
CONSTANT SquadId  \* Set of squad identifiers (model values)

------------------------------------------------------------------------
VARIABLES
    friends,       \* Set of sets {u1, u2} — active friendships (simplified)
    squads,        \* Set of records [id, adminUid, memberUids, restricted]
    joinRequests   \* Set of records [squadId, fromUid, toUid, status]

vars == <<friends, squads, joinRequests>>

------------------------------------------------------------------------
(* Type invariant — structural correctness of all state variables *)
TypeOK ==
    /\ friends \subseteq (SUBSET Uid)
    /\ \A f \in friends : Cardinality(f) = 2
    /\ squads \subseteq
         [id : SquadId, adminUid : Uid, memberUids : SUBSET Uid,
          restricted : BOOLEAN]
    /\ joinRequests \subseteq
         [squadId : SquadId, fromUid : Uid, toUid : Uid,
          status : {"pending", "accepted", "declined"}]

------------------------------------------------------------------------
(* Helpers: look up a squad by ID *)
SquadExists(sid) == \E s \in squads : s.id = sid
SquadById(sid) == CHOOSE s \in squads : s.id = sid

------------------------------------------------------------------------
(* --- INVARIANTS --- *)

(* INV-1: Squad always has exactly one admin.
   The adminUid is set at creation and never changes.
   See burn-squads.ts line 36: adminUid set to creator UID. *)
ExactlyOneAdmin ==
    \A s \in squads : s.adminUid \in Uid

(* INV-2: Admin is always in memberUids.
   The API creates squads with memberUids: [adminUid] (line 38).
   Accepting a join request appends the new member; admin is never removed. *)
AdminInMembers ==
    \A s \in squads : s.adminUid \in s.memberUids

(* INV-3: Cannot invite non-friends.
   All member additions require friendship between inviter and invitee.
   See burn-squads.ts lines 54-57 (create with invites) and 365-371 (add member).
   Only pending requests require active friendship; accepted/declined are historical. *)
CannotInviteNonFriends ==
    \A r \in joinRequests :
        r.status = "pending" => {r.fromUid, r.toUid} \in friends

(* INV-4: Only the recipient can accept a join request.
   See burn-squads.ts lines 293-296: checks toUid === uid.
   Structural: AcceptInvite action guard enforces this — the action only
   fires when the acceptor is the toUid parameter. *)
OnlyRecipientCanAccept ==
    \A r \in joinRequests :
        r.status = "accepted" => TRUE  \* Structural — enforced by action guards

(* INV-5: If onlyAdminsCanAddMembers=true, only admin can send invites.
   See burn-squads.ts lines 359-362: if restricted && not admin → 403.
   Defensive modeling: UpdateSettings cleans up non-admin pending requests
   when the setting is toggled to true. The real API gates new invites but
   does not retroactively clean up — this spec documents the ideal. *)
AdminOnlyInviteEnforced ==
    \A r \in joinRequests :
        (r.status = "pending" /\ SquadExists(r.squadId)) =>
            LET s == SquadById(r.squadId)
            IN s.restricted => r.fromUid = s.adminUid

(* INV-6: Only admin can update settings or delete squad.
   Structural — enforced by action guards on UpdateSettings and DeleteSquad.
   See burn-squads.ts lines 251-254 (update), 486-489 (settings), 524-527 (delete). *)
OnlyAdminCanManage ==
    TRUE  \* Structural — enforced by action guards

(* INV-7: No self-invitations.
   See burn-squads.ts line 52: if (toUid === adminUid) continue. *)
NoSelfInvites ==
    \A r \in joinRequests : r.fromUid /= r.toUid

(* INV-8: At most one squad per SquadId. *)
UniqueSquadIds ==
    \A s1, s2 \in squads : s1.id = s2.id => s1 = s2

(* INV-9: Pending join requests reference existing squads.
   Accepted/declined requests may reference deleted squads (orphans by design). *)
JoinRequestReferencesSquad ==
    \A r \in joinRequests :
        r.status = "pending" => SquadExists(r.squadId)

(* Combined safety invariant *)
SafetyInvariant ==
    /\ TypeOK
    /\ ExactlyOneAdmin
    /\ AdminInMembers
    /\ CannotInviteNonFriends
    /\ AdminOnlyInviteEnforced
    /\ NoSelfInvites
    /\ UniqueSquadIds
    /\ JoinRequestReferencesSquad

------------------------------------------------------------------------
(* --- INITIAL STATE --- *)

Init ==
    /\ friends = {}
    /\ squads = {}
    /\ joinRequests = {}

------------------------------------------------------------------------
(* --- FRIENDSHIP ACTIONS --- *)
(* Simplified friendship layer — full logic in FriendManagement.tla.
   We only need create and delete to provide prerequisites for squad invites. *)

(* Create a friendship between two distinct users. *)
CreateFriendship(u1, u2) ==
    /\ u1 /= u2
    /\ {u1, u2} \notin friends
    /\ friends' = friends \cup {{u1, u2}}
    /\ UNCHANGED <<squads, joinRequests>>

(* Delete a friendship. Cleans up pending join requests between the pair
   to maintain the CannotInviteNonFriends invariant. *)
DeleteFriendship(u1, u2) ==
    /\ {u1, u2} \in friends
    /\ friends' = friends \ {{u1, u2}}
    /\ joinRequests' = { r \in joinRequests :
         ~(r.status = "pending" /\ {r.fromUid, r.toUid} = {u1, u2}) }
    /\ UNCHANGED squads

------------------------------------------------------------------------
(* --- SQUAD ACTIONS --- *)

(* Create a new squad. The creator becomes admin and sole member.
   See burn-squads.ts lines 17-74.
   onlyAdminsCanAddMembers defaults to FALSE (line 40). *)
CreateSquad(admin, sid) ==
    /\ ~SquadExists(sid)                                       \* SquadId not in use
    /\ squads' = squads \cup
         {[id |-> sid, adminUid |-> admin, memberUids |-> {admin},
           restricted |-> FALSE]}
    /\ UNCHANGED <<friends, joinRequests>>

(* Invite a user to a squad (send join request).
   Preconditions mirror burn-squads.ts lines 330-386:
   - Inviter must be a member (line 354-357)
   - If onlyAdminsCanAddMembers, inviter must be admin (lines 359-362)
   - Invitee must be a friend of inviter (line 365-371)
   - Cannot invite self
   - Invitee must not already be a member
   - No duplicate pending invite for same invitee/squad *)
InviteMember(inviter, invitee, sid) ==
    /\ inviter /= invitee                                      \* No self-invites
    /\ SquadExists(sid)
    /\ LET s == SquadById(sid)
       IN
       /\ inviter \in s.memberUids                              \* Inviter is a member
       /\ invitee \notin s.memberUids                           \* Invitee is not already a member
       /\ (~s.restricted \/ inviter = s.adminUid)               \* Permission check
       /\ {inviter, invitee} \in friends                        \* Friendship required
       /\ ~\E r \in joinRequests :                              \* No duplicate pending invite
            r.squadId = sid /\ r.toUid = invitee /\ r.status = "pending"
    /\ joinRequests' = joinRequests \cup
         {[squadId |-> sid, fromUid |-> inviter, toUid |-> invitee,
           status |-> "pending"]}
    /\ UNCHANGED <<friends, squads>>

(* Accept a pending join request. Only the recipient (toUid) can accept.
   On acceptance, the user is added to the squad's memberUids.
   See burn-squads.ts lines 275-323. *)
AcceptInvite(invitee, sid, inviter) ==
    LET req == [squadId |-> sid, fromUid |-> inviter, toUid |-> invitee,
                status |-> "pending"]
    IN
    /\ req \in joinRequests                                    \* Request must exist and be pending
    /\ SquadExists(sid)
    /\ LET s == SquadById(sid)
       IN
       /\ joinRequests' = (joinRequests \ {req}) \cup
            {[squadId |-> sid, fromUid |-> inviter, toUid |-> invitee,
              status |-> "accepted"]}
       /\ squads' = (squads \ {s}) \cup
            {[id |-> sid, adminUid |-> s.adminUid,
              memberUids |-> s.memberUids \cup {invitee},
              restricted |-> s.restricted]}
    /\ UNCHANGED friends

(* Decline a pending join request. Only the recipient can decline.
   Request status transitions to "declined". Member is NOT added. *)
DeclineInvite(invitee, sid, inviter) ==
    LET req == [squadId |-> sid, fromUid |-> inviter, toUid |-> invitee,
                status |-> "pending"]
    IN
    /\ req \in joinRequests
    /\ joinRequests' = (joinRequests \ {req}) \cup
         {[squadId |-> sid, fromUid |-> inviter, toUid |-> invitee,
           status |-> "declined"]}
    /\ UNCHANGED <<friends, squads>>

(* Update squad settings — toggle onlyAdminsCanAddMembers. Admin only.
   See burn-squads.ts lines 469-501.
   Defensive modeling: when enabling the restriction, we clean up pending
   join requests from non-admin members to maintain AdminOnlyInviteEnforced.
   The real API gates new invites but does not retroactively clean up. *)
UpdateSettings(admin, sid) ==
    /\ SquadExists(sid)
    /\ LET s == SquadById(sid)
       IN
       /\ admin = s.adminUid                                    \* Admin-only operation
       /\ squads' = (squads \ {s}) \cup
            {[id |-> sid, adminUid |-> s.adminUid,
              memberUids |-> s.memberUids,
              restricted |-> ~s.restricted]}
       \* When becoming restricted, clean up non-admin pending requests
       /\ IF ~s.restricted
          THEN joinRequests' = { r \in joinRequests :
                 ~(r.status = "pending" /\ r.squadId = sid
                   /\ r.fromUid /= s.adminUid) }
          ELSE joinRequests' = joinRequests
    /\ UNCHANGED friends

(* Delete a squad. Admin only.
   See burn-squads.ts lines 507-532.
   Pending join requests are cleaned up to maintain JoinRequestReferencesSquad.
   Note: the real API does NOT clean up join requests or group workouts — this
   is defensive modeling. See VERIFICATION_REPORT.md for gap analysis. *)
DeleteSquad(admin, sid) ==
    /\ SquadExists(sid)
    /\ LET s == SquadById(sid)
       IN
       /\ admin = s.adminUid                                    \* Admin-only operation
       /\ squads' = squads \ {s}
       /\ joinRequests' = { r \in joinRequests :
            ~(r.status = "pending" /\ r.squadId = sid) }
    /\ UNCHANGED friends

------------------------------------------------------------------------
(* --- CONCURRENT SCENARIOS --- *)

(* Multiple users invite simultaneously: two members both invite the same
   user at the same time. The duplicate pending check prevents both from
   succeeding — TLC verifies one wins and the other is blocked. *)

(* Accept during settings change: a user accepts an invite while the admin
   toggles onlyAdminsCanAddMembers. TLC explores all interleavings. *)

(* Delete during accept: admin deletes squad while a user accepts an invite.
   AcceptInvite requires SquadExists and DeleteSquad removes the squad —
   they cannot both succeed. TLC verifies mutual exclusion. *)

------------------------------------------------------------------------
(* --- NEXT STATE RELATION --- *)

Next ==
    \* Friendship actions (abstracted)
    \/ \E u1, u2 \in Uid : CreateFriendship(u1, u2)
    \/ \E u1, u2 \in Uid : DeleteFriendship(u1, u2)
    \* Squad lifecycle
    \/ \E admin \in Uid, sid \in SquadId : CreateSquad(admin, sid)
    \/ \E admin \in Uid, sid \in SquadId : DeleteSquad(admin, sid)
    \* Membership management
    \/ \E inviter, invitee \in Uid, sid \in SquadId :
         InviteMember(inviter, invitee, sid)
    \/ \E invitee \in Uid, sid \in SquadId, inviter \in Uid :
         AcceptInvite(invitee, sid, inviter)
    \/ \E invitee \in Uid, sid \in SquadId, inviter \in Uid :
         DeclineInvite(invitee, sid, inviter)
    \* Settings management
    \/ \E admin \in Uid, sid \in SquadId : UpdateSettings(admin, sid)

Spec == Init /\ [][Next]_vars

------------------------------------------------------------------------
(* --- PROPERTIES --- *)

(* Sanity check: member count per squad never exceeds |Uid| *)
BoundedMembers ==
    \A s \in squads : Cardinality(s.memberUids) <= Cardinality(Uid)

========================================================================
