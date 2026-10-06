from __future__ import annotations
import json
from types import SimpleNamespace
from privacy_boundary_eval.cli import ConsoleStyle, _write_execution_manifest, main
from privacy_boundary_eval.schemas import (
    Architecture,
    Difficulty,
    ExperimentConfig,
    RunCondition,
)


class _TTY:
    def isatty(self) -> bool:
        return True


def test_console_style_always_adds_ansi_codes() -> None:
    style = ConsoleStyle(mode="always")
    assert style.paint("Scout", ConsoleStyle.BLUE) == "\x1b[94mScout\x1b[0m"
    assert style.heading("=== Goal ===").startswith("\x1b[1;96m")


def test_console_style_never_is_plain() -> None:
    style = ConsoleStyle(mode="never")
    assert style.agent("Coordinator") == "Coordinator"


def test_console_style_auto_respects_no_color(monkeypatch) -> None:
    monkeypatch.setenv("NO_COLOR", "1")
    monkeypatch.setenv("FORCE_COLOR", "1")
    style = ConsoleStyle(mode="auto", stream=_TTY())
    assert style.enabled is False


def test_console_style_auto_uses_color_for_tty(monkeypatch) -> None:
    monkeypatch.delenv("NO_COLOR", raising=False)
    monkeypatch.delenv("FORCE_COLOR", raising=False)
    style = ConsoleStyle(mode="auto", stream=_TTY())
    assert style.enabled is True


def test_execution_manifest_stores_replay_settings_without_credentials(
    tmp_path,
) -> None:
    config = ExperimentConfig(
        architectures=[Architecture.MULTI],
        attacks=[False],
        difficulties=[Difficulty.EASY],
        repetitions=1,
        turns_per_run=5,
        crisis_level=2,
        candidate_count=6,
        target_count=4,
        output_dir=str(tmp_path),
    )
    condition = RunCondition(
        architecture=Architecture.MULTI,
        attack=False,
        difficulty=Difficulty.EASY,
        repetition=1,
        seed=7,
    )
    args = SimpleNamespace(
        backend="mock",
        provider="openai",
        mock_policy="safe",
        finalize=True,
        compact=True,
    )
    _write_execution_manifest(
        args=args,
        config=config,
        conditions=[condition],
        artifacts=[SimpleNamespace(run_id=condition.condition_id)],
    )
    manifest = json.loads((tmp_path / "execution.json").read_text())
    assert manifest["settings"]["turns_per_run"] == 5
    assert manifest["settings"]["crisis_level"] == 2
    assert manifest["backend"] == "mock"
    assert "api_key" not in json.dumps(manifest).lower()
    assert (tmp_path / f"{condition.condition_id}.execution.json").exists()


def test_plan_accepts_crisis_level_override(capsys) -> None:
    assert (
        main(["plan", "--scenario", "emergency_recruitment", "--crisis-level", "2"])
        == 0
    )
    assert json.loads(capsys.readouterr().out)["crisis_level"] == 2
