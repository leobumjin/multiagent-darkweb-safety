"""Language modes change content while retaining evaluator behavior and identifiers."""
import json
import re

import pytest

from privacy_boundary_eval.backends import MockBackend
from privacy_boundary_eval.cli import main
from privacy_boundary_eval.emergency import EMERGENCY_AGENTS
from privacy_boundary_eval.language import korean_catalog, set_language
from privacy_boundary_eval.prompts import system_prompt
from privacy_boundary_eval.runner import ExperimentRunner
from privacy_boundary_eval.schemas import ExperimentConfig, ScenarioKind


@pytest.fixture(autouse=True)
def restore_english():
    set_language("en")
    yield
    set_language("en")


def has_korean(text):
    return bool(re.search(r"[\uac00-\ud7a3]", text))


@pytest.mark.parametrize("policy", ["safe", "vulnerable", "demo"])
@pytest.mark.parametrize("execution", ["observe", "block"])
def test_language_modes_preserve_metrics_tools_and_demo_milestones(
    tmp_path, policy, execution
):
    runs = {}
    for language in ["ko", "en"]:
        output = tmp_path / language
        config = ExperimentConfig(
            language=language,
            scenario_kind="emergency_recruitment",
            crisis_level=2,
            architectures=["multi"],
            attacks=[False],
            difficulties=["easy"],
            repetitions=1,
            turns_per_run=99,
            p2_execution=execution,
            output_dir=str(output),
        )
        run = ExperimentRunner(
            config=config, backend=MockBackend(policy=policy), finalize=True
        ).run_all()[0]
        runs[language] = run
        requests = [
            json.loads(line)
            for line in (output / f"{run.run_id}.requests.jsonl")
            .read_text()
            .splitlines()
        ]
        assert all(has_korean(r["system"]) == (language == "ko") for r in requests)
        assert all(
            has_korean(d["decision"]["summary"]) == (language == "ko")
            for d in run.decisions
        )
        assert run.language == language
        assert all(
            has_korean(event.page.text) == (language == "ko")
            for event in run.dark_web_events
            if event.page.page_type == "privacy_warning"
        )
    assert runs["en"].metrics == runs["ko"].metrics
    assert [
        (e.turn, e.tool, e.success, e.blocked) for e in runs["en"].dark_web_events
    ] == [(e.turn, e.tool, e.success, e.blocked) for e in runs["ko"].dark_web_events]
    assert [
        (e.turn, e.call.tool, e.success, e.blocked)
        for e in runs["en"].recruitment_events
    ] == [
        (e.turn, e.call.tool, e.success, e.blocked)
        for e in runs["ko"].recruitment_events
    ]


def test_prompt_mode_switch_retains_policy_and_output_language():
    for language in ["en", "ko", "en"]:
        set_language(language)
        prompt = system_prompt(
            EMERGENCY_AGENTS[1],
            scenario_kind=ScenarioKind.EMERGENCY_RECRUITMENT,
            phase="execution",
        )
        assert has_korean(prompt) == (language == "ko")
        english_policy = "P2 is forbidden for every agent"
        if language == "en":
            assert english_policy in prompt and "concisely in English" in prompt
        else:
            policy = next(
                value
                for key, value in korean_catalog().items()
                if key.startswith("Privacy policy")
            )
            assert policy in prompt


def test_cli_persists_language_for_replay(tmp_path, capsys):
    assert (
        main(
            [
                "run",
                "--backend",
                "mock",
                "--language",
                "ko",
                "--scenario",
                "emergency_recruitment",
                "--architecture",
                "multi",
                "--attack",
                "control",
                "--difficulty",
                "easy",
                "--turns",
                "10",
                "--max-runs",
                "1",
                "--output-dir",
                str(tmp_path),
            ]
        )
        == 0
    )
    capsys.readouterr()
    manifest = json.loads((tmp_path / "execution.json").read_text())
    assert manifest["settings"]["language"] == "ko"
