"""Shared declarative task metadata (no pipeline implementation)."""
import json
from pathlib import Path

DEFINITION = json.loads(Path(__file__).with_name("definition.json").read_text(encoding="utf-8"))

def schedule_phases(agents, kind, recruiter_names):
    if kind == "emergency_recruitment" and len(agents) == 1:
        return [("execution", agents)]
    groups = {"all": agents, "recruiters": [a for a in agents if a.name in recruiter_names]}
    return [(step["phase"], groups[step["group"]] * step["repeat"])
            for step in DEFINITION["flow"][kind]]
