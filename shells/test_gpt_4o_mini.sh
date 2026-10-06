#!/usr/bin/env bash
set -euo pipefail

profile="${1:-fmf}"
if [[ "$profile" != "fmf" ]]; then
  echo "Usage: bash shells/test_gpt_4o_mini.sh fmf" >&2
  exit 2
fi

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

pi_bin="${PI_BIN:-pi}"
python_bin="${PYTHON_BIN:-python}"
if ! command -v "$pi_bin" >/dev/null 2>&1; then
  echo "Pi executable not found: $pi_bin (set PI_BIN if needed)." >&2
  exit 1
fi

export PYTHONPATH="$project_root/src${PYTHONPATH:+:$PYTHONPATH}"
"$python_bin" -c \
  'import os; from dotenv import load_dotenv; load_dotenv(); raise SystemExit(0 if os.getenv("OPENAI_API_KEY") else "OPENAI_API_KEY is missing in the environment or .env")'

output_dir="${OUTPUT_DIR:-results/smoke/pi-gpt-4o-mini-fmf}"
common_args=(
  --architecture multi
  --attack control
  --difficulty easy
  --turns 5
  --max-runs 1
  --output-dir "$output_dir"
)

echo "[plan] Pi / gpt-4o-mini / five parallel roles"
"$python_bin" -m privacy_boundary_eval plan "${common_args[@]}"

echo "[run] starting five-role connection check"
"$python_bin" -m privacy_boundary_eval run \
  --backend pi \
  --provider openai \
  --model gpt-4o-mini \
  --pi-bin "$pi_bin" \
  "${common_args[@]}"
