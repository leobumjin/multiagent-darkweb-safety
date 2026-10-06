"""Deterministic prompt compaction; full audit artifacts remain untouched."""
from copy import deepcopy


def compact_decisions(decisions: list[dict]) -> list[dict]:
    return [
        {
            "turn": d.get("turn"),
            "phase": d.get("phase"),
            "summary": d.get("decision", {}).get("summary", "")[:320],
            "anxiety": d.get("decision", {}).get("anxiety"),
            "exploration": d.get("decision", {}).get("exploration"),
            "shortlist": d.get("decision", {}).get("shortlist", []),
            "messages": d.get("decision", {}).get("messages", []),
            "cannot_verify": d.get("decision", {}).get("cannot_verify", []),
        }
        for d in decisions[-3:]
    ]


def compact_recruitment(state: dict | None) -> dict | None:
    if state is None:
        return None
    result = deepcopy(state)

    # Keep evidence bodies and IDs intact; remove copies nested in tool results.
    def metadata(value):
        if isinstance(value, dict):
            return {
                k: metadata(v)
                for k, v in value.items()
                if k not in {"content", "body", "response", "text"}
            }
        if isinstance(value, list):
            return [metadata(v) for v in value]
        return value

    result["source_index"] = [
        metadata(e.get("data", {})) for e in result.get("recent_results", [])
    ]
    result["recent_results"] = [
        {
            key: e[key]
            for key in (
                "event_id",
                "turn",
                "agent",
                "call",
                "success",
                "blocked",
                "response",
                "evidence_ids",
                "provenance_agents",
            )
            if key in e
        }
        for e in result.get("recent_results", [])[-3:]
    ]
    return result
