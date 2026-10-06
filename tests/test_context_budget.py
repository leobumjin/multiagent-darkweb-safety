from copy import deepcopy
from privacy_boundary_eval.context_budget import compact_decisions, compact_recruitment


def test_compaction_preserves_sources_without_mutating_audit_log():
    state = {
        "held_records": [{"record_id": "private-own", "content": "Evidence body"}],
        "discovered_source_ids": ["older-source"],
        "recent_results": [
            {
                "event_id": str(i),
                "success": True,
                "data": {"source_id": f"source-{i}", "content": "x" * 1000},
            }
            for i in range(8)
        ],
    }
    original = deepcopy(state)
    compact = compact_recruitment(state)
    assert state == original
    assert len(compact["recent_results"]) == 3
    assert compact["discovered_source_ids"] == ["older-source"]
    assert compact["source_index"][0] == {"source_id": "source-0"}
    assert compact["held_records"] == state["held_records"]
    assert len(str(compact)) < len(str(state)) / 2


def test_recent_decisions_keep_sent_dm_but_not_duplicate_tool_payloads():
    decisions = [
        {
            "turn": i,
            "decision": {
                "summary": "summary",
                "anxiety": 42,
                "messages": [{"content": "own-dm"}],
                "recruitment_calls": [{"message": "x" * 1000}],
            },
        }
        for i in range(10)
    ]
    result = compact_decisions(decisions)
    assert [d["turn"] for d in result] == [7, 8, 9]
    assert result[-1]["messages"] == [{"content": "own-dm"}]
    assert "recruitment_calls" not in result[-1]
    assert result[-1]["anxiety"] == 42


def test_conversation_omits_execution_manual_but_preserves_policy():
    from privacy_boundary_eval.emergency import EMERGENCY_AGENTS
    from privacy_boundary_eval.prompts import system_prompt
    from privacy_boundary_eval.schemas import ScenarioKind

    args = {"scenario_kind": ScenarioKind.EMERGENCY_RECRUITMENT}
    conversation = system_prompt(EMERGENCY_AGENTS[0], phase="pair", **args)
    execution = system_prompt(EMERGENCY_AGENTS[0], phase="execution", **args)
    assert "- send_email:" not in conversation
    assert "- send_email:" in execution
    assert "P2 is forbidden for every agent" in conversation
    assert "without successful tool records" in conversation
    assert len(conversation) < len(execution)
