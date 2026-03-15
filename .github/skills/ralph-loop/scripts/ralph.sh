#!/bin/bash
# Ralph Wiggum - Long-running AI agent loop
#
# Usage:
#   ./ralph.sh --prd <path-to-prd.json> [--tool copilot|claude|amp] [--port-offset N] [max_iterations]
#
# The PRD file path should be absolute or relative to the working directory.
# The progress file is derived from the PRD path: prd-*.json → progress-*.txt

set -e

TOOL="copilot"
MAX_ITERATIONS=10
PRD_ARG=""
PORT_OFFSET=""

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
    --port-offset)
      PORT_OFFSET="$2"
      shift 2
      ;;
    --port-offset=*)
      PORT_OFFSET="${1#*=}"
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

if [ -z "$PRD_ARG" ]; then
  echo "Error: --prd <path-to-prd.json> is required."
  echo "Usage: ./ralph.sh --prd <path-to-prd.json> [--tool copilot|claude|amp] [--port-offset N] [max_iterations]"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Resolve PRD file path (absolute or relative to cwd)
if [[ "$PRD_ARG" = /* ]]; then
  PRD_FILE="$PRD_ARG"
else
  PRD_FILE="$(pwd)/$PRD_ARG"
fi

if [ ! -f "$PRD_FILE" ]; then
  echo "Error: PRD file not found: $PRD_FILE"
  exit 1
fi

# Derive progress file: prd-foo.json → progress-foo.txt (same directory)
PRD_DIR="$(dirname "$PRD_FILE")"
PRD_BASENAME="$(basename "$PRD_FILE")"
PROGRESS_BASENAME=$(echo "$PRD_BASENAME" | sed 's/^prd-/progress-/; s/\.json$/.txt/')
PROGRESS_FILE="$PRD_DIR/$PROGRESS_BASENAME"

# Working directory is the current directory (worktree is set up by ralph-agent)
WORK_DIR="$(pwd)"

# Initialize progress file if it doesn't exist
if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# Ralph Progress Log" > "$PROGRESS_FILE"
  echo "Started: $(date)" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
fi

# Port isolation: when --port-offset is set, export env vars so dev servers
# in parallel worktrees don't collide (API default 3001, Web default 3000)
if [ -n "$PORT_OFFSET" ]; then
  export PORT=$((3001 + PORT_OFFSET))
  export WEB_PORT=$((3000 + PORT_OFFSET))
  export NEXT_PUBLIC_API_URL="http://localhost:$PORT"
  echo "Port isolation: API=$PORT, Web=$WEB_PORT, API_URL=$NEXT_PUBLIC_API_URL"
fi

echo "Starting Ralph - Tool: $TOOL - Max iterations: $MAX_ITERATIONS"
echo "  PRD: $PRD_FILE"
echo "  Progress: $PROGRESS_FILE"
echo "  Working dir: $WORK_DIR"
[ -n "$PORT_OFFSET" ] && echo "  Port offset: $PORT_OFFSET (API=$PORT, Web=$WEB_PORT)"

# Build the prompt with the correct file paths
build_prompt() {
  local prompt
  prompt=$(cat "$SCRIPT_DIR/CLAUDE.md")

  # Inject the PRD and progress file paths into the prompt
  local port_info=""
  if [ -n "$PORT_OFFSET" ]; then
    port_info="- **API port**: $PORT
- **Web port**: $WEB_PORT
- **API URL**: $NEXT_PUBLIC_API_URL"
  fi

  prompt="$prompt

---
## Runtime Configuration
- **PRD file**: $PRD_FILE
- **Progress file**: $PROGRESS_FILE
- **Working directory**: $WORK_DIR
$port_info
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
  if echo "$OUTPUT" | grep -q "<promise>PRD-COMPLETE</promise>"; then
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
