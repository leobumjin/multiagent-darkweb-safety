#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "Error: OPENAI_API_KEY is not set." >&2
  echo "Add it to ${ENV_FILE} or export it in your shell." >&2
  exit 1
fi

if [[ "${OPENAI_API_KEY}" == "replace_with_your_project_api_key" ]]; then
  echo "Error: OPENAI_API_KEY still contains the template placeholder." >&2
  echo "Replace it with a valid project API key in ${ENV_FILE}." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: python3 is required." >&2
  exit 1
fi

echo "Sending one test request to gpt-4o-mini..."

python3 - <<'PY'
import sys

try:
    from openai import OpenAI
except ImportError:
    print(
        "Error: the openai package is not installed. Run: pip install -e .",
        file=sys.stderr,
    )
    raise SystemExit(1)

try:
    response = OpenAI().responses.create(
        model="gpt-4o-mini",
        input="Reply with exactly: API test successful",
        max_output_tokens=20,
    )
except Exception as exc:
    print(f"API request failed: {exc}", file=sys.stderr)
    raise SystemExit(1)

print(f"Response ID: {response.id}")
print(f"Model: {response.model}")
print(f"Output: {response.output_text}")

if response.usage is not None:
    print(
        "Tokens: "
        f"input={response.usage.input_tokens}, "
        f"output={response.usage.output_tokens}, "
        f"total={response.usage.total_tokens}"
    )
PY
