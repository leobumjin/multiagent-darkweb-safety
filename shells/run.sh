#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# shellcheck source=./env.sh
source "$SCRIPT_DIR/env.sh"

if [[ -x "$PROJECT_ROOT/.venv/bin/python" ]]; then
  PYTHON_BIN="$PROJECT_ROOT/.venv/bin/python"
else
  PYTHON_BIN="${PYTHON_BIN:-python3}"
fi

export PYTHONUNBUFFERED=1
export PYTHONPATH="$PROJECT_ROOT/src${PYTHONPATH:+:$PYTHONPATH}"

# Web compatibility contract:
# Keep CLI arguments pass-through and preserve lines prefixed with
# @@PBE_EVENT@@ when this script grows additional setup steps.
# A crisis round is a meeting (4), private DMs (4), then recruiter execution (2).
if (( $# == 0 )); then
  if [[ ! "$ROUNDS" =~ ^[1-9][0-9]*$ ]]; then
    echo "ROUNDS must be a positive integer." >&2
    exit 2
  fi
  if [[ "$ARCHITECTURE" == "multi" ]]; then
    if [[ "$SCENARIO_KIND" == "emergency_recruitment" ]]; then
      DISCUSSION_TURNS=$((ROUNDS * 10))
    else
      DISCUSSION_TURNS=$((ROUNDS * 5))
    fi
  else
    DISCUSSION_TURNS="$ROUNDS"
  fi
  RUN_MODEL="${MODEL:-$API_MODEL}"
  set -- \
    --language "$EXPERIMENT_LANGUAGE" \
    --backend "$BACKEND" \
    --scenario "$SCENARIO_KIND" \
    --crisis-level "$CRISIS_LEVEL" \
    --p2-execution "$P2_EXECUTION" \
    --architecture "$ARCHITECTURE" \
    --attack "$ATTACK" \
    --difficulty "$DIFFICULTY" \
    --turns "$DISCUSSION_TURNS" \
    --candidate-count "$CANDIDATE_COUNT" \
    --target-count "$TARGET_COUNT" \
    --max-runs 1 \
    --show-conversation \
    --output-dir "$OUTPUT_DIR"
  if [[ "$BACKEND" == "pi" ]]; then
    set -- "$@" --provider "$API_PROVIDER" --pi-bin "${PI_BIN:-pi}" --model "$RUN_MODEL"
  elif [[ "$BACKEND" == "openai" ]]; then
    set -- "$@" --model "$RUN_MODEL"
  else
    set -- "$@" --mock-policy "$MOCK_POLICY" --model "$RUN_MODEL"
  fi
  if [[ "$FINALIZE" =~ ^(1|true|yes|on)$ ]]; then
    set -- "$@" --finalize
  fi
  if [[ "$COMPACT" =~ ^(1|true|yes|on)$ ]]; then
    set -- "$@" --compact
  fi
fi

exec "$PYTHON_BIN" -m privacy_boundary_eval run "$@"
