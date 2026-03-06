#!/bin/bash
# Ralph Wiggum - Long-running AI agent loop
#
# Usage:
#   # Parameterized mode (per-PRD, with worktree):
#   ./ralph.sh --prd prd-task-status.json [--tool copilot|claude|amp] [max_iterations]
#
#   # Legacy mode (single prd.json, no worktree):
#   ./ralph.sh [--tool copilot|claude|amp] [max_iterations]

set -e

TOOL="copilot"
MAX_ITERATIONS=10
PRD_ARG=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --prd)
      PRD_ARG="$2"
      shift 2
      ;;
    --prd=*)
      PRD_ARG="${1#*=}"
      shift
      ;;
    --tool)
      TOOL="$2"
      shift 2
      ;;
    --tool=*)
      TOOL="${1#*=}"
      shift
      ;;
    *)
      if [[ "$1" =~ ^[0-9]+$ ]]; then
        MAX_ITERATIONS="$1"
      fi
      shift
      ;;
  esac
done

if [[ "$TOOL" != "amp" && "$TOOL" != "claude" && "$TOOL" != "copilot" ]]; then
  echo "Error: Invalid tool '$TOOL'. Must be 'amp', 'claude', or 'copilot'."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Determine PRD and progress file paths
if [ -n "$PRD_ARG" ]; then
  # Parameterized mode: branch-suffixed files + worktree
  PRD_FILE="$SCRIPT_DIR/$PRD_ARG"
  # Derive progress file: prd-foo.json → progress-foo.txt
  PROGRESS_SUFFIX=$(echo "$PRD_ARG" | sed 's/^prd-//; s/\.json$//')
  PROGRESS_FILE="$SCRIPT_DIR/progress-${PROGRESS_SUFFIX}.txt"

  if [ ! -f "$PRD_FILE" ]; then
    echo "Error: PRD file not found: $PRD_FILE"
    exit 1
  fi

  # Read branch name from PRD
  BRANCH_NAME=$(jq -r '.branchName // empty' "$PRD_FILE")
  if [ -z "$BRANCH_NAME" ]; then
    echo "Error: No branchName found in $PRD_FILE"
    exit 1
  fi

  # Strip ralph/ prefix for worktree directory name
  BRANCH_SUFFIX=$(echo "$BRANCH_NAME" | sed 's|^ralph/||')
  WORKTREE_DIR="$(dirname "$REPO_ROOT")/burnbuddy-${BRANCH_SUFFIX}"

  # Create or reuse worktree
  if [ ! -d "$WORKTREE_DIR" ]; then
    echo "Creating worktree at $WORKTREE_DIR from main..."
    git -C "$REPO_ROOT" fetch origin main 2>/dev/null || true
    git -C "$REPO_ROOT" worktree add "$WORKTREE_DIR" -b "$BRANCH_NAME" origin/main 2>/dev/null || \
      git -C "$REPO_ROOT" worktree add "$WORKTREE_DIR" "$BRANCH_NAME" 2>/dev/null || \
      git -C "$REPO_ROOT" worktree add "$WORKTREE_DIR" -B "$BRANCH_NAME" origin/main || {
        echo "Error: Failed to create worktree at $WORKTREE_DIR for branch $BRANCH_NAME"
        exit 1
      }
    echo "Worktree created: $WORKTREE_DIR"
  else
    echo "Reusing existing worktree: $WORKTREE_DIR"
  fi

  WORK_DIR="$WORKTREE_DIR"
else
  # Legacy mode: single prd.json in script dir, no worktree
  PRD_FILE="$SCRIPT_DIR/prd.json"
  PROGRESS_FILE="$SCRIPT_DIR/progress.txt"
  LAST_BRANCH_FILE="$SCRIPT_DIR/.last-branch"

  # Archive previous run if branch changed (legacy only)
  if [ -f "$PRD_FILE" ] && [ -f "$LAST_BRANCH_FILE" ]; then
    CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
    LAST_BRANCH=$(cat "$LAST_BRANCH_FILE" 2>/dev/null || echo "")

    if [ -n "$CURRENT_BRANCH" ] && [ -n "$LAST_BRANCH" ] && [ "$CURRENT_BRANCH" != "$LAST_BRANCH" ]; then
      ARCHIVE_DIR="$SCRIPT_DIR/archive"
      DATE=$(date +%Y-%m-%d)
      FOLDER_NAME=$(echo "$LAST_BRANCH" | sed 's|^ralph/||')
      ARCHIVE_FOLDER="$ARCHIVE_DIR/$DATE-$FOLDER_NAME"

      echo "Archiving previous run: $LAST_BRANCH"
      mkdir -p "$ARCHIVE_FOLDER"
      [ -f "$PRD_FILE" ] && cp "$PRD_FILE" "$ARCHIVE_FOLDER/"
      [ -f "$PROGRESS_FILE" ] && cp "$PROGRESS_FILE" "$ARCHIVE_FOLDER/"
      echo "   Archived to: $ARCHIVE_FOLDER"

      echo "# Ralph Progress Log" > "$PROGRESS_FILE"
      echo "Started: $(date)" >> "$PROGRESS_FILE"
      echo "---" >> "$PROGRESS_FILE"
    fi
  fi

  # Track current branch (legacy only)
  if [ -f "$PRD_FILE" ]; then
    CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
    if [ -n "$CURRENT_BRANCH" ]; then
      echo "$CURRENT_BRANCH" > "$LAST_BRANCH_FILE"
    fi
  fi

  WORK_DIR="$REPO_ROOT"
fi

# Initialize progress file if it doesn't exist
if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# Ralph Progress Log" > "$PROGRESS_FILE"
  echo "Started: $(date)" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
fi

echo "Starting Ralph - Tool: $TOOL - Max iterations: $MAX_ITERATIONS"
echo "  PRD: $PRD_FILE"
echo "  Progress: $PROGRESS_FILE"
echo "  Working dir: $WORK_DIR"

# Build the prompt with the correct file paths
build_prompt() {
  local prompt
  prompt=$(cat "$SCRIPT_DIR/CLAUDE.md")

  # Inject the PRD and progress file paths into the prompt
  prompt="$prompt

---
## Runtime Configuration
- **PRD file**: $PRD_FILE
- **Progress file**: $PROGRESS_FILE
- **Working directory**: $WORK_DIR
"
  echo "$prompt"
}

for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo "==============================================================="
  echo "  Ralph Iteration $i of $MAX_ITERATIONS ($TOOL)"
  echo "==============================================================="

  PROMPT=$(build_prompt)

  if [[ "$TOOL" == "amp" ]]; then
    OUTPUT=$(cd "$WORK_DIR" && echo "$PROMPT" | amp --dangerously-allow-all 2>&1 | tee /dev/stderr) || true
  elif [[ "$TOOL" == "claude" ]]; then
    OUTPUT=$(cd "$WORK_DIR" && echo "$PROMPT" | claude --dangerously-skip-permissions --print 2>&1 | tee /dev/stderr) || true
  else
    OUTPUT=$(cd "$WORK_DIR" && copilot -p "$PROMPT" --yolo 2>&1 | tee /dev/stderr) || true
  fi

  # Check for completion signal
  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo ""
    echo "Ralph completed all tasks!"
    echo "Completed at iteration $i of $MAX_ITERATIONS"
    exit 0
  fi

  echo "Iteration $i complete. Continuing..."
  sleep 2
done

echo ""
echo "Ralph reached max iterations ($MAX_ITERATIONS) without completing all tasks."
echo "Check $PROGRESS_FILE for status."
exit 1