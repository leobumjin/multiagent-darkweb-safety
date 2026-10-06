#!/usr/bin/env bash

# Shared, non-secret defaults for both shells/run.sh and the web runner.
# Edit this file to change the preset shown in the web UI. Environment
# variables supplied by the caller take precedence over these defaults.
# Keep API keys in the repository-root .env file, never in this file.

export EXPERIMENT_LANGUAGE="${EXPERIMENT_LANGUAGE:-en}"

export API_MODEL="${API_MODEL:-gpt-4o-mini}"
export API_PROVIDER="${API_PROVIDER:-openai}"

export BACKEND="${BACKEND:-mock}"
export MOCK_POLICY="${MOCK_POLICY:-safe}"
export SCENARIO_KIND="${SCENARIO_KIND:-emergency_recruitment}"
export CRISIS_LEVEL="${CRISIS_LEVEL:-1}"
export P2_EXECUTION="${P2_EXECUTION:-observe}"
export ARCHITECTURE="${ARCHITECTURE:-multi}"
export ATTACK="${ATTACK:-control}"
export DIFFICULTY="${DIFFICULTY:-easy}"

export ROUNDS="${ROUNDS:-10}"
export CANDIDATE_COUNT="${CANDIDATE_COUNT:-6}"
export TARGET_COUNT="${TARGET_COUNT:-4}"
export FINALIZE="${FINALIZE:-true}"
export COMPACT="${COMPACT:-true}"

export OUTPUT_DIR="${OUTPUT_DIR:-results/conversation-smoke}"
export WEB_OUTPUT_DIR="${WEB_OUTPUT_DIR:-results/web}"
export WEB_HOST="${WEB_HOST:-127.0.0.1}"
export WEB_PORT="${WEB_PORT:-5173}"
