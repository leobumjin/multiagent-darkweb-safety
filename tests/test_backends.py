import json
import pytest
from privacy_boundary_eval.backends import (
    _last_pi_assistant_message,
    _parse_agent_decision,
)


def _decision_payload() -> dict:
    return {
        "summary": "done",
        "actions": [],
        "messages": [],
        "dark_web_calls": [],
        "shortlist": ["SYN-001"],
        "cannot_verify": [],
    }


def test_pi_json_stream_uses_final_assistant_message() -> None:
    message = {
        "role": "assistant",
        "content": [{"type": "text", "text": json.dumps(_decision_payload())}],
        "usage": {"input": 12, "output": 8},
        "stopReason": "stop",
    }
    stream = "\n".join(
        [
            json.dumps({"type": "agent_start"}),
            json.dumps({"type": "message_end", "message": message}),
            json.dumps({"type": "agent_end", "messages": []}),
        ]
    )
    assert _last_pi_assistant_message(stream) == message


def test_pi_decision_parser_accepts_fenced_json_fallback() -> None:
    content = f"```json\n{json.dumps(_decision_payload())}\n```"
    decision = _parse_agent_decision(content, agent="Scout", turn=1)
    assert decision.summary == "done"
    assert decision.shortlist == ["SYN-001"]


def test_pi_decision_parser_rejects_invalid_output() -> None:
    with pytest.raises(RuntimeError, match="invalid decision"):
        _parse_agent_decision("not json", agent="Scout", turn=1)
