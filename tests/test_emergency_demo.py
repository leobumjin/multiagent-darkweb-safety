import pytest
from privacy_boundary_eval.backends import MockBackend
from privacy_boundary_eval.runner import ExperimentRunner
from privacy_boundary_eval.schemas import ExperimentConfig


def test_demo_cli_preset_preserves_milestones_even_with_short_efficient_options(
    tmp_path, capsys
):
    import json
    from privacy_boundary_eval.cli import main

    assert (
        main(
            [
                "run",
                "--backend",
                "mock",
                "--mock-policy",
                "demo",
                "--turns",
                "8",
                "--efficient-interactions",
                "--architecture",
                "single",
                "--attack",
                "control",
                "--difficulty",
                "easy",
                "--max-runs",
                "1",
                "--output-dir",
                str(tmp_path),
            ]
        )
        == 0
    )
    assert json.loads(capsys.readouterr().out)["model_calls"] == 100
    manifest = json.loads((tmp_path / "execution.json").read_text())
    assert manifest["mock_policy"] == "demo"
    assert manifest["settings"]["efficient_interactions"] is False


@pytest.mark.parametrize("mode", ["observe", "block"])
def test_demo_uses_actual_tools_at_40_and_80_and_honors_blocking(tmp_path, mode):
    config = ExperimentConfig(
        scenario_kind="emergency_recruitment",
        crisis_level=2,
        architectures=["multi"],
        attacks=[False],
        difficulties=["easy"],
        repetitions=1,
        turns_per_run=99,
        efficient_interactions=False,
        p2_execution=mode,
        output_dir=str(tmp_path),
    )
    run = ExperimentRunner(
        config=config, backend=MockBackend(policy="demo"), finalize=True
    ).run_all()[0]
    import json

    requests = [
        json.loads(line)
        for line in (tmp_path / f"{run.run_id}.requests.jsonl").read_text().splitlines()
    ]
    assert all(
        (("Observe: the runner" in r["user"]) == (mode == "observe") for r in requests)
    )
    assert all(
        (("Block: the runner" in r["user"]) == (mode == "block") for r in requests)
    )
    assert len(run.decisions) == 100
    p2 = [
        (d["turn"], a)
        for d in run.decisions
        for a in d["decision"]["actions"]
        if a["kind"] == "query" and a["level"] == "P2"
    ]
    assert [turn for turn, _ in p2] == [39, 40]
    dark = {e.tool.value: e for e in run.dark_web_events}
    assert dark["discover_dark_source"].turn == 50
    assert dark["request_dark_access"].turn == 60
    assert dark["search_dark_web"].turn == 70
    if mode == "observe":
        assert dark["open_dark_record"].turn == 80
        assert dark["open_dark_record"].success
        assert run.metrics.recruitment.mission_approved_count == 5
        assert run.metrics.recruitment.valid_consent_count == 2
        assert run.metrics.recruitment.p2_persuasion_count == 2
        assert run.metrics.recruitment.dark_identity_count == 1
    else:
        assert dark["search_dark_web"].blocked
        assert "open_dark_record" not in dark
        assert run.metrics.recruitment.mission_approved_count == 2
        assert run.metrics.recruitment.p2_persuasion_count == 0
        assert run.metrics.recruitment.dark_identity_count == 0
