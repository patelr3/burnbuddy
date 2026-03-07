------------------- MODULE UserProfileManagement -------------------
(*
  Formal specification of the BurnBuddy user profile management system.
  Models profile creation, username reservation, username changes, and
  profile picture lifecycle.

  Maps to: services/api/src/routes/users.ts
  Shared types: packages/shared/src/types.ts (UserProfile)

  State model:
    - No profile -> Created (with username reservation)
    - Created -> Username changed (old reservation deleted, new created atomically)
    - Created -> Profile picture uploaded / deleted
    - Duplicate creation -> 409 (idempotent guard)

  Firestore collections modeled:
    - users/{uid}: profile documents
    - usernames/{usernameLower}: username reservation documents mapping to uid

  Key constraints:
    - Username uniqueness is case-insensitive, enforced via the usernames
      collection where document IDs are lowercased usernames.
    - Profile creation and username changes are atomic (Firestore batch).
    - Profile creation is idempotent (409 if profile already exists).
    - Profile picture delete is idempotent (succeeds even if no picture).

  Modeling notes:
    - Usernames are modeled as abstract values (CONSTANT Username). In the
      real system, usernames are strings with case-insensitive comparison.
      We model each Username constant as already representing a unique
      case-insensitive equivalence class (i.e., "john" and "John" map to
      the same model value).
    - Username generation (generateUniqueUsername) is modeled as
      non-deterministic selection from available usernames with bounded
      retry (max 3 attempts for collisions).
    - Profile picture URLs are abstracted to a boolean (has picture or not).
    - State is decomposed into separate variables (createdProfiles,
      profileUsername, hasPicture) instead of nested records to avoid
      TLC fingerprinting issues with mixed record/string function values.
*)
EXTENDS Integers, FiniteSets

------------------------------------------------------------------------
CONSTANT Uid       \* Set of user identifiers (model values)
CONSTANT Username  \* Set of possible usernames (model values, case-insensitive)

------------------------------------------------------------------------
VARIABLES
    createdProfiles,   \* SUBSET Uid — set of UIDs that have a profile
    profileUsername,    \* Function Uid -> Username
                       \*   Only meaningful when uid \in createdProfiles
    hasPicture,        \* Function Uid -> BOOLEAN
                       \*   Only meaningful when uid \in createdProfiles
    usernameOwner,     \* Function Username -> Uid \cup {"free"}
                       \*   Models the usernames/{lower} collection.
                       \*   "free" means no reservation exists.
    retryCount         \* Function Uid -> Nat
                       \*   Tracks username generation retry attempts

vars == <<createdProfiles, profileUsername, hasPicture, usernameOwner, retryCount>>

------------------------------------------------------------------------
(* Helper: Check if a profile exists for uid *)
ProfileExists(uid) == uid \in createdProfiles

(* Helper: Check if a username is reserved *)
UsernameTaken(uname) == usernameOwner[uname] /= "free"

(* Helper: Set of unreserved usernames *)
AvailableUsernames == { u \in Username : ~UsernameTaken(u) }

------------------------------------------------------------------------
(* Type invariant -- structural correctness of all state variables *)
TypeOK ==
    /\ createdProfiles \subseteq Uid
    /\ DOMAIN profileUsername = Uid
    /\ \A uid \in createdProfiles : profileUsername[uid] \in Username
    /\ DOMAIN hasPicture = Uid
    /\ \A uid \in createdProfiles : hasPicture[uid] \in BOOLEAN
    /\ DOMAIN usernameOwner = Username
    /\ \A uname \in Username :
        \/ usernameOwner[uname] = "free"
        \/ usernameOwner[uname] \in Uid
    /\ DOMAIN retryCount = Uid
    /\ \A uid \in Uid : retryCount[uid] \in 0..3

------------------------------------------------------------------------
(* --- INVARIANTS --- *)

(* INV-1: Each username (case-insensitive) is unique across all users.
   Enforced via the usernames collection: each lowercased username maps
   to exactly one UID. Two distinct users cannot share the same username.
   See users.ts: existingReservation check before username update. *)
UsernameUniqueness ==
    \A u1, u2 \in createdProfiles :
        u1 /= u2 => profileUsername[u1] /= profileUsername[u2]

(* INV-2: Username changes are atomic -- old reservation deleted and new
   reservation created together. At every reachable state, every profile's
   username matches its reservation in the usernames collection.
   See users.ts: batch.set(usernames/new) + batch.delete(usernames/old)
   executed as a single Firestore batch write. *)
UsernameChangeAtomic ==
    \A uid \in createdProfiles :
        usernameOwner[profileUsername[uid]] = uid

(* INV-3: Profile creation is idempotent -- 409 if profile already exists.
   The API checks for existing profile before creating. This is structural:
   CreateProfile action guards on ~ProfileExists(uid).
   See users.ts: if (existing.exists) return 409. *)
ProfileCreationIdempotent ==
    TRUE  \* Structural -- enforced by CreateProfile action guard

(* INV-4: Cannot have a profile without a username reservation.
   Every profile has a corresponding entry in the usernames collection.
   This follows from atomic profile creation (batch write creates both). *)
NoProfileWithoutReservation ==
    \A uid \in createdProfiles :
        usernameOwner[profileUsername[uid]] = uid

(* INV-5: Cannot have orphaned username reservations.
   Every entry in the usernames collection maps to an existing profile
   that uses that username. This prevents username "leaks" where a
   reservation exists but no profile references it. *)
NoOrphanedReservations ==
    \A uname \in Username :
        UsernameTaken(uname) =>
            LET uid == usernameOwner[uname]
            IN ProfileExists(uid) /\ profileUsername[uid] = uname

(* Combined safety invariant *)
SafetyInvariant ==
    /\ TypeOK
    /\ UsernameUniqueness
    /\ UsernameChangeAtomic
    /\ NoProfileWithoutReservation
    /\ NoOrphanedReservations

------------------------------------------------------------------------
(* --- INITIAL STATE --- *)

(* Choose arbitrary initial values for functions over Uid and Username.
   The profileUsername and hasPicture values for non-created UIDs are
   irrelevant but must be initialized for TLC. We pick an arbitrary
   Username and FALSE as defaults. *)
Init ==
    /\ createdProfiles = {}
    /\ profileUsername = [uid \in Uid |-> CHOOSE u \in Username : TRUE]
    /\ hasPicture = [uid \in Uid |-> FALSE]
    /\ usernameOwner = [uname \in Username |-> "free"]
    /\ retryCount = [uid \in Uid |-> 0]

------------------------------------------------------------------------
(* --- PROFILE CREATION --- *)

(* Create a new user profile. Models POST /users.
   Preconditions:
     - Profile does not already exist (409 guard)
     - The chosen username is available
   The username is auto-generated (modeled as non-deterministic choice).
   Both the profile document and the username reservation are written
   atomically via Firestore batch.
   See users.ts: batch.set(docRef, profile) + batch.set(usernames/lower, {uid}) *)
CreateProfile(uid, uname) ==
    /\ ~ProfileExists(uid)                        \* Idempotent: 409 if exists
    /\ uname \in AvailableUsernames               \* Username must be available
    /\ createdProfiles' = createdProfiles \cup {uid}
    /\ profileUsername' = [profileUsername EXCEPT ![uid] = uname]
    /\ hasPicture' = [hasPicture EXCEPT ![uid] = FALSE]
    /\ usernameOwner' = [usernameOwner EXCEPT ![uname] = uid]
    /\ retryCount' = [retryCount EXCEPT ![uid] = 0]

(* Model username collision during creation -- retry mechanism.
   The API's generateUniqueUsername tries up to 3 times with random
   suffixes if the initial username is taken. We model this as an
   explicit retry action that increments the counter. *)
CreateProfileRetry(uid) ==
    /\ ~ProfileExists(uid)                        \* Still trying to create
    /\ retryCount[uid] < 3                        \* Max 3 retry attempts
    /\ AvailableUsernames /= {}                   \* Some username available
    /\ retryCount' = [retryCount EXCEPT ![uid] = retryCount[uid] + 1]
    /\ UNCHANGED <<createdProfiles, profileUsername, hasPicture, usernameOwner>>

------------------------------------------------------------------------
(* --- USERNAME CHANGE --- *)

(* Change a user's username. Models PUT /users/me with username change.
   Preconditions:
     - Profile must exist
     - New username must be different from current
     - New username must not be taken
   The change is atomic: old reservation deleted + new reservation created
   in a single Firestore batch write.
   See users.ts: batch.set(docRef, updates) + batch.set(usernames/new)
   + batch.delete(usernames/old) *)
ChangeUsername(uid, newName) ==
    /\ ProfileExists(uid)                          \* Profile must exist
    /\ newName /= profileUsername[uid]             \* Must be different
    /\ ~UsernameTaken(newName)                     \* Must not be taken
    \* Atomic batch: update profile, create new reservation, delete old
    /\ LET oldName == profileUsername[uid]
       IN
       /\ profileUsername' = [profileUsername EXCEPT ![uid] = newName]
       /\ usernameOwner' = [usernameOwner EXCEPT
            ![newName] = uid,
            ![oldName] = "free"]
    /\ UNCHANGED <<createdProfiles, hasPicture, retryCount>>

------------------------------------------------------------------------
(* --- PROFILE PICTURE --- *)

(* Upload a profile picture. Models POST /users/me/profile-picture.
   Preconditions:
     - Profile must exist
   The profile picture URL is stored in the user's profile document.
   We abstract the URL to a boolean flag (has picture or not). *)
UploadProfilePicture(uid) ==
    /\ ProfileExists(uid)
    /\ hasPicture' = [hasPicture EXCEPT ![uid] = TRUE]
    /\ UNCHANGED <<createdProfiles, profileUsername, usernameOwner, retryCount>>

(* Delete a profile picture. Models DELETE /users/me/profile-picture.
   Preconditions:
     - Profile must exist
   The delete is idempotent -- succeeds even if no picture exists.
   See users.ts: Storage delete ignores 404, FieldValue.delete() on
   profilePictureUrl field. *)
DeleteProfilePicture(uid) ==
    /\ ProfileExists(uid)
    /\ hasPicture' = [hasPicture EXCEPT ![uid] = FALSE]
    /\ UNCHANGED <<createdProfiles, profileUsername, usernameOwner, retryCount>>

------------------------------------------------------------------------
(* --- UPDATE PROFILE (non-username fields) --- *)

(* Update profile fields other than username. Models PUT /users/me
   when only displayName/email changes (no username change).
   We abstract this as a no-op since we don't model display names.
   Included for completeness. *)
UpdateProfile(uid) ==
    /\ ProfileExists(uid)
    /\ UNCHANGED vars

------------------------------------------------------------------------
(* --- CONCURRENT SCENARIOS --- *)

(* Two users creating profiles with overlapping username pools:
   TLC explores all interleavings. The AvailableUsernames guard ensures
   no two users can grab the same username. Under concurrent creation,
   the Firestore batch serialization means one will succeed and the other
   will find the username taken -- modeled by TLC as the second creator
   choosing a different available username. *)

(* Username change race: two users trying to take the same username:
   The ~UsernameTaken(newName) guard means only one can succeed per step.
   TLC verifies no interleaving can lead to duplicate ownership. *)

(* Profile picture upload + delete race condition:
   Both operations require ProfileExists, and the hasPicture variable is
   a simple boolean. TLC explores all orderings, and the final state
   is always consistent (either TRUE or FALSE). *)

------------------------------------------------------------------------
(* --- NEXT STATE RELATION --- *)

Next ==
    \* Profile creation and retry
    \/ \E uid \in Uid, uname \in Username : CreateProfile(uid, uname)
    \/ \E uid \in Uid : CreateProfileRetry(uid)
    \* Username changes
    \/ \E uid \in Uid, newName \in Username : ChangeUsername(uid, newName)
    \* Profile picture management
    \/ \E uid \in Uid : UploadProfilePicture(uid)
    \/ \E uid \in Uid : DeleteProfilePicture(uid)
    \* Non-username profile updates
    \/ \E uid \in Uid : UpdateProfile(uid)

Spec == Init /\ [][Next]_vars

------------------------------------------------------------------------
(* --- PROPERTIES --- *)

(* Sanity check: number of profiles never exceeds number of users *)
BoundedProfiles ==
    Cardinality(createdProfiles) <= Cardinality(Uid)

(* Sanity check: number of reservations always equals number of profiles.
   Because creation atomically adds both, and username changes swap one
   for one, the counts must always match. *)
ReservationsMatchProfiles ==
    Cardinality({ uname \in Username : UsernameTaken(uname) }) =
    Cardinality(createdProfiles)

========================================================================
