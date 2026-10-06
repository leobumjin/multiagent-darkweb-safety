from privacy_boundary_eval.dataset import build_scenario
from privacy_boundary_eval.emergency import EMERGENCY_AGENTS
from privacy_boundary_eval.inspection import participant_definitions
from privacy_boundary_eval.schemas import Difficulty, ScenarioKind


def test_inspector_uses_actual_roles_and_per_user_records():
    scenario = build_scenario(
        kind=ScenarioKind.EMERGENCY_RECRUITMENT,
        difficulty=Difficulty.EASY,
        attack=False,
        seed=7,
    )
    definitions = participant_definitions(
        scenario,
        EMERGENCY_AGENTS,
        crisis_level=2,
        souls={"EXPERT-C/SOUL.md": "saved soul"},
    )
    people = definitions["participants"]
    assert people["CrisisLead"]["role"] == EMERGENCY_AGENTS[0].role
    assert "Crisis level 2" in people["CrisisLead"]["system_prompt"]
    assert people["SecurityExpert"]["crisis_pressure"] is None
    assert people["EXPERT-C"]["soul"] == "saved soul"
    assert people["EXPERT-A"]["person"]["initial_response"] == "approved"
    assert {r["level"] for r in people["EXPERT-A"]["records"]} == {"P0", "P1"}
    private = [r for r in people["EXPERT-C"]["records"] if r["level"] == "P2"]
    assert {r["origin"] for r in private} == {"internet", "dark_web"}
    assert all(
        (
            "spouse_treatment_facility=Fictional Dawn Hospital" in r["content"]
            for r in private
        )
    )
    assert all((r["candidate_id"] == "EXPERT-C" for r in people["EXPERT-C"]["records"]))
    assert any(
        (r["candidate_id"] == "VectorGhost" for r in people["EXPERT-E"]["records"])
    )


def test_observer_metadata_is_saved_but_not_given_to_model(tmp_path):
    import json
    from privacy_boundary_eval.backends import MockBackend
    from privacy_boundary_eval.runner import ExperimentRunner
    from privacy_boundary_eval.schemas import ExperimentConfig

    events = []
    config = ExperimentConfig(
        scenario_kind="emergency_recruitment",
        architectures=["multi"],
        attacks=[False],
        difficulties=["easy"],
        repetitions=1,
        turns_per_run=4,
        output_dir=str(tmp_path),
    )
    artifact = ExperimentRunner(
        config=config, backend=MockBackend(), event_sink=events.append
    ).run_all()[0]
    start = next((event for event in events if event["type"] == "run_start"))
    assert start["participant_definitions"] == artifact.participant_definitions
    saved = json.loads((tmp_path / f"{artifact.run_id}.json").read_text())
    assert "SIM-PHONE-C" in json.dumps(saved["participant_definitions"])
    requests = (tmp_path / f"{artifact.run_id}.requests.jsonl").read_text()
    assert "SIM-PHONE-C" not in requests
    assert "Fictional Dawn Hospital" not in requests
