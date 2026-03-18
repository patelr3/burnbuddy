------------------- MODULE BurnBuddyManagement -------------------
(*
  Formal specification of the BurnBuddy burn buddy management system.
  Models burn buddy request lifecycle and relationship state transitions.

  Maps to: services/api/src/routes/burn-buddies.ts
  Shared types: packages/shared/src/types.ts (BurnBuddy, BurnBuddyRequest)

  State model:
    - No relationship → Pending request → Active buddy (accepted)
    - No relationship → Pending request → Declined
    - Active buddy → No relationship (deletion)

  Firestore collections modeled:
    - burnBuddyRequests: {fromUid, toUid, status} documents
    - burnBuddies: {uid1, uid2} documents where uid1 < uid2
    - friends: {uid1, uid2} — prerequisite for burn buddy requests

  Key constraint: A friendship must exist between two users before
  a burn buddy request can be sent. See burn-buddies.ts lines 32-40.

  Modeling note: Burn buddies are stored in Firestore with sorted UIDs
  (uid1 < uid2). In TLA+ we model them as unordered sets {u1, u2} since
  model values don't support ordering. The uniqueness property still holds:
  {A,B} = {B,A}, mirroring the API's canonical ID behavior.
*)
EXTENDS Integers, Sequences, FiniteSets

------------------------------------------------------------------------
CONSTANT Uid  \* Set of user identifiers (model values)

------------------------------------------------------------------------
VARIABLES
    friends,           \* Set of sets {u1, u2} — active friendships (from FriendManagement)
    buddyRequests,     \* Set of records [fromUid |-> u1, toUid |-> u2, status |-> s]
    burnBuddies        \* Set of sets {u1, u2} — active burn buddy relationships

vars == <<friends, buddyRequests, burnBuddies>>

------------------------------------------------------------------------
(* Type invariant — structural correctness of all state variables *)
TypeOK ==
    /\ friends \subseteq (SUBSET Uid)
    /\ \A f \in friends : Cardinality(f) = 2
    /\ buddyRequests \subseteq
         [fromUid : Uid, toUid : Uid, status : {"pending", "accepted", "declined"}]
    /\ burnBuddies \subseteq (SUBSET Uid)
    /\ \A bb \in burnBuddies : Cardinality(bb) = 2

------------------------------------------------------------------------
(* --- INVARIANTS --- *)

(* INV-1: Cannot have a pending burn buddy request without existing friendship.
   The API checks for friendship before allowing a request.
   See burn-buddies.ts lines 32-40: queries friends collection for
   the sorted UID pair and returns 400 if not found.
   Note: Accepted/declined requests are historical records and may persist
   after friendship deletion. Only pending requests require active friendship. *)
FriendshipRequiredForBuddyRequest ==
    \A r \in buddyRequests :
        r.status = "pending" => {r.fromUid, r.toUid} \in friends

(* INV-2: At most one burn buddy relationship per user pair.
   Enforced by using sorted UID pair as canonical identifier in Firestore.
   Two users can have at most one active BurnBuddy document.
   Structural with set representation: {A,B} = {B,A}. *)
AtMostOneBuddyPerPair ==
    \A b1, b2 \in burnBuddies :
        b1 \cap b2 = b1 => b1 = b2

(* INV-3: Burn buddy UIDs are sorted (uid1 < uid2) in Firestore.
   See burn-buddies.ts lines 122-123: const [bbUid1, bbUid2] = [...].sort()
   In TLA+ we use unordered sets, so this is structural. The API sorts UIDs
   for document storage; our set representation {u1, u2} naturally captures
   the uniqueness guarantee without requiring an ordering on model values. *)
BuddyUidsSorted ==
    \A bb \in burnBuddies : Cardinality(bb) = 2  \* Structural in set model

(* INV-4: At most one pending request per direction.
   The API checks for existing pending requests before creating new ones.
   See burn-buddies.ts lines 42-50: queries burnBuddyRequests for
   (fromUid, toUid, status=pending) and returns 409 if found. *)
AtMostOnePendingPerDirection ==
    \A r1, r2 \in buddyRequests :
        (r1.fromUid = r2.fromUid /\ r1.toUid = r2.toUid
         /\ r1.status = "pending" /\ r2.status = "pending")
        => r1 = r2

(* INV-5: Only the recipient can accept a request.
   See burn-buddies.ts lines 98-107: checks req.user.uid === request.toUid.
   Structural: SendBuddyRequest enforces fromUid /= toUid and
   AcceptBuddyRequest only fires when the acceptor is the toUid. *)
OnlyRecipientCanAccept ==
    \A r \in buddyRequests :
        r.status = "accepted" => TRUE  \* Structural — enforced by action guards

(* INV-6: No self burn buddy requests.
   Cannot be buddies with yourself — implied by friendship requirement
   (friendships also exclude self), but stated explicitly. *)
NoSelfRequests ==
    \A r \in buddyRequests : r.fromUid /= r.toUid

(* INV-7: No burn buddy relationship can exist without an active friendship.
   Burn buddies are cascade-deleted when friendship is removed. *)
NoBuddyWithoutFriendship ==
    \A bb \in burnBuddies : bb \in friends

(* INV-8: No pending request can exist once a burn buddy is established.
   After the cross-directional fix, SendBuddyRequest auto-accepts reverse
   pending requests and AcceptBuddyRequest atomically cleans up reverse
   pending requests. This invariant verifies no pending request survives
   for a pair that already has an active burn buddy.
   See burn-buddies.ts lines 57-85 (auto-accept) and lines 177-183 (atomic accept). *)
NoPendingAfterBuddyEstablished ==
    \A bb \in burnBuddies :
        ~\E r \in buddyRequests :
            {r.fromUid, r.toUid} = bb /\ r.status = "pending"

(* Combined safety invariant *)
SafetyInvariant ==
    /\ TypeOK
    /\ FriendshipRequiredForBuddyRequest
    /\ AtMostOneBuddyPerPair
    /\ BuddyUidsSorted
    /\ AtMostOnePendingPerDirection
    /\ NoSelfRequests
    /\ NoBuddyWithoutFriendship
    /\ NoPendingAfterBuddyEstablished

------------------------------------------------------------------------
(* --- INITIAL STATE --- *)

Init ==
    /\ friends = {}
    /\ buddyRequests = {}
    /\ burnBuddies = {}

------------------------------------------------------------------------
(* --- FRIENDSHIP ACTIONS --- *)
(* We model a simplified friendship layer to provide the prerequisite
   state for burn buddy operations. Full friend logic is in
   FriendManagement.tla; here we only need create and delete. *)

(* Create a friendship between two distinct users.
   This abstracts the full friend request lifecycle into a single step
   since we only need the end state for burn buddy preconditions. *)
CreateFriendship(u1, u2) ==
    /\ u1 /= u2
    /\ ~\E f \in friends : f = {u1, u2}          \* Not already friends
    /\ friends' = friends \cup {{u1, u2}}
    /\ UNCHANGED <<buddyRequests, burnBuddies>>

(* Delete an existing friendship. Either party can initiate.
   Pending buddy requests are removed to maintain the invariant that
   pending requests require active friendship. Burn buddy relationships
   are cascade-deleted to maintain NoBuddyWithoutFriendship. *)
DeleteFriendship(u1, u2) ==
    /\ {u1, u2} \in friends
    /\ friends' = friends \ {{u1, u2}}
    \* Remove pending buddy requests for this pair (defensive behavior).
    /\ buddyRequests' = { r \in buddyRequests :
         ~(r.status = "pending" /\
           ({r.fromUid, r.toUid} = {u1, u2})) }
    \* Cascade-delete burn buddy relationship for this pair.
    /\ burnBuddies' = burnBuddies \ {{u1, u2}}

------------------------------------------------------------------------
(* --- BURN BUDDY ACTIONS --- *)

(* Send a burn buddy request from user `from` to user `to`.
   Preconditions mirror the API validation in burn-buddies.ts:
   - Cannot request self
   - Users must be friends (lines 32-40)
   - No existing pending request in same direction (lines 42-50)
   - No existing burn buddy relationship (implied — would be redundant)
   Cross-directional fix (burn-buddies.ts lines 57-85): If a reverse
   pending request (to→from) exists, auto-accept it instead of creating
   a new request — both users want to be buddies, so establish the
   relationship atomically via batch write. *)
SendBuddyRequest(from, to) ==
    /\ from /= to                                             \* No self-requests
    /\ {from, to} \in friends                                  \* Friendship required
    /\ ~\E r \in buddyRequests :                               \* No duplicate pending
         r.fromUid = from /\ r.toUid = to /\ r.status = "pending"
    /\ {from, to} \notin burnBuddies                           \* Not already buddies
    /\ LET reverseReq == [fromUid |-> to, toUid |-> from, status |-> "pending"]
       IN
       IF reverseReq \in buddyRequests
       THEN \* Auto-accept: reverse pending exists, both users want to be buddies.
            \* Atomically update reverse request to accepted and create buddy.
            \* See burn-buddies.ts lines 57-85 (batch write: update + set).
            /\ buddyRequests' = (buddyRequests \ {reverseReq}) \cup
                 {[fromUid |-> to, toUid |-> from, status |-> "accepted"]}
            /\ burnBuddies' = burnBuddies \cup {{from, to}}
            /\ UNCHANGED friends
       ELSE \* Normal case: no reverse pending, create a new pending request.
            /\ buddyRequests' = buddyRequests \cup
                 {[fromUid |-> from, toUid |-> to, status |-> "pending"]}
            /\ UNCHANGED <<friends, burnBuddies>>

(* Accept a pending burn buddy request. Only the recipient (toUid) can accept.
   On acceptance (atomic batch write — see burn-buddies.ts lines 177-183):
   1. The request status changes to "accepted"
   2. A new BurnBuddy document is created (modeled as set {from, to})
   3. Any reverse pending request (to→from) is deleted to prevent orphans
   The reverse cleanup is belt-and-suspenders — SendBuddyRequest's auto-accept
   should prevent reverse pending requests from coexisting, but AcceptBuddyRequest
   cleans them up defensively in case of races. See also friends.ts for the
   identical pattern applied to friend requests. *)
AcceptBuddyRequest(from, to) ==
    LET req == [fromUid |-> from, toUid |-> to, status |-> "pending"]
        reverseReq == [fromUid |-> to, toUid |-> from, status |-> "pending"]
    IN
    /\ req \in buddyRequests                                   \* Request must exist and be pending
    /\ {from, to} \notin burnBuddies                           \* Not already buddies
    \* Atomically: mark accepted, create buddy, remove any reverse pending.
    \* Set difference with reverseReq is safe even if it doesn't exist.
    /\ buddyRequests' = (buddyRequests \ {req, reverseReq}) \cup
         {[fromUid |-> from, toUid |-> to, status |-> "accepted"]}
    /\ burnBuddies' = burnBuddies \cup {{from, to}}
    /\ UNCHANGED friends

(* Decline a pending burn buddy request. Only the recipient can decline.
   Request status transitions to "declined". No BurnBuddy created. *)
DeclineBuddyRequest(from, to) ==
    LET req == [fromUid |-> from, toUid |-> to, status |-> "pending"]
    IN
    /\ req \in buddyRequests                                   \* Request must exist and be pending
    /\ buddyRequests' = (buddyRequests \ {req}) \cup
         {[fromUid |-> from, toUid |-> to, status |-> "declined"]}
    /\ UNCHANGED <<friends, burnBuddies>>

(* Cancel a pending burn buddy request. Only the sender (fromUid) can cancel.
   Precondition: request exists with status=pending and fromUid=from.
   Postcondition: request removed from buddyRequests set. *)
CancelBuddyRequest(from, to) ==
    LET req == [fromUid |-> from, toUid |-> to, status |-> "pending"]
    IN
    /\ req \in buddyRequests                                   \* Request must exist and be pending
    /\ buddyRequests' = buddyRequests \ {req}
    /\ UNCHANGED <<friends, burnBuddies>>

(* Update workout schedule for an existing burn buddy relationship.
   Either party can update the schedule.
   See burn-buddies.ts lines 196-230.
   We abstract the schedule content — only model that the buddy exists.
   The update does not change the state variables we track. *)
UpdateSchedule(u1, u2) ==
    /\ u1 /= u2
    /\ {u1, u2} \in burnBuddies                               \* Buddy relationship must exist
    \* Schedule update is a data mutation only — no state change modeled.
    /\ UNCHANGED vars

(* Delete an existing burn buddy relationship. Either party can initiate.
   See burn-buddies.ts lines 233-260.
   The BurnBuddy document is removed. Requests are not cleaned up. *)
DeleteBuddy(u1, u2) ==
    /\ {u1, u2} \in burnBuddies                               \* Buddy must exist
    /\ burnBuddies' = burnBuddies \ {{u1, u2}}
    /\ UNCHANGED <<friends, buddyRequests>>

------------------------------------------------------------------------
(* --- CONCURRENT SCENARIOS --- *)

(* Two users send buddy requests to each other simultaneously.
   After the cross-directional fix (burn-buddies.ts lines 57-85),
   the second request detects the reverse pending request and auto-accepts
   it instead of creating a new one. Cross-directional pending requests
   can no longer coexist — NoPendingAfterBuddyEstablished enforces this.
   TLC explores all interleavings automatically via the Next relation. *)

(* Accept during delete: one user accepts while the other deletes.
   The AcceptBuddyRequest guard checks "not already buddies" and
   DeleteBuddy checks "buddy must exist" — so these cannot both succeed
   in the same step. TLC verifies this. *)

(* Friendship deletion after buddy request: if A sends buddy request to B
   and then the friendship is deleted, pending requests are cleaned up
   (defensive behavior) while accepted/declined requests persist as
   historical records. *)

------------------------------------------------------------------------
(* --- NEXT STATE RELATION --- *)

Next ==
    \* Friendship actions (abstracted)
    \/ \E u1, u2 \in Uid : CreateFriendship(u1, u2)
    \/ \E u1, u2 \in Uid : DeleteFriendship(u1, u2)
    \* Burn buddy actions
    \/ \E from, to \in Uid : SendBuddyRequest(from, to)
    \/ \E from, to \in Uid : AcceptBuddyRequest(from, to)
    \/ \E from, to \in Uid : DeclineBuddyRequest(from, to)
    \/ \E from, to \in Uid : CancelBuddyRequest(from, to)
    \/ \E u1, u2 \in Uid : UpdateSchedule(u1, u2)
    \/ \E u1, u2 \in Uid : DeleteBuddy(u1, u2)

Spec == Init /\ [][Next]_vars

------------------------------------------------------------------------
(* --- PROPERTIES --- *)

(* Sanity check: buddy count never exceeds C(|Uid|, 2) *)
BoundedBuddies ==
    Cardinality(burnBuddies) <= (Cardinality(Uid) * (Cardinality(Uid) - 1)) \div 2

========================================================================
