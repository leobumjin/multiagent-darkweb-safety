from __future__ import annotations
from .language import tr, set_language
import argparse
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Callable, TextIO
from dotenv import load_dotenv
from .backends import DecisionBackend, MockBackend, OpenAIBackend, PiBackend
from .prompts import task_goal
from .runner import ExperimentRunner
from .schemas import Architecture, Difficulty, ExperimentConfig, ScenarioKind

WEB_EVENT_PREFIX = "@@PBE_EVENT@@"


class ConsoleStyle:
    """Small, dependency-free ANSI palette for human-readable CLI output."""

    RESET = "\x1b[0m"
    BOLD = "1"
    DIM = "2"
    RED = "91"
    GREEN = "92"
    YELLOW = "93"
    BLUE = "94"
    MAGENTA = "95"
    CYAN = "96"
    MUTED = "90"
    AGENT_COLORS = {
        "Scout": BLUE,
        "Researcher": CYAN,
        "RelationshipMapper": MAGENTA,
        "Outreach": YELLOW,
        "Coordinator": GREEN,
        "Generalist": BLUE,
        "Profiler": MAGENTA,
        "CrisisLead": GREEN,
        "ImpatientRecruiter": CYAN,
        "CalmRecruiter": BLUE,
        "SecurityExpert": MAGENTA,
    }
    AGENT_LABELS = {
        "Scout": "Scout",
        "Researcher": "Researcher",
        "RelationshipMapper": "Relationship mapper",
        "Outreach": "Outreach agent",
        "Coordinator": "Coordinator",
        "Generalist": "Generalist",
        "Profiler": "Participation analyst",
        "CrisisLead": "Crisis lead",
        "ImpatientRecruiter": "Impatient recruiter",
        "CalmRecruiter": "Calm recruiter",
        "SecurityExpert": "Security expert",
    }

    def __init__(self, *, mode: str = "auto", stream: TextIO | None = None) -> None:
        stream = stream or sys.stdout
        force_color = os.getenv("FORCE_COLOR")
        auto_enabled = "NO_COLOR" not in os.environ and (
            force_color is not None
            and force_color != "0"
            or bool(getattr(stream, "isatty", lambda: False)())
        )
        self.enabled = mode == "always" or (mode == "auto" and auto_enabled)

    def paint(self, text: str, *codes: str) -> str:
        if not self.enabled or not codes:
            return text
        return f"\x1b[{';'.join(codes)}m{text}{self.RESET}"

    def heading(self, text: str, color: str = CYAN) -> str:
        return self.paint(text, self.BOLD, color)

    def agent(self, name: str) -> str:
        label = self.AGENT_LABELS.get(name, name)
        return self.paint(label, self.BOLD, self.AGENT_COLORS.get(name, self.CYAN))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="privacy-boundary-eval",
        description=tr("Run synthetic multi-agent privacy-boundary experiments."),
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    for name in ("plan", "run"):
        command = subparsers.add_parser(name)
        command.add_argument(
            "--language", choices=["en", "ko"], default=os.getenv("EXPERIMENT_LANGUAGE")
        )
        command.add_argument("--config", default="configs/experiment.json")
        command.add_argument(
            "--scenario", choices=[item.value for item in ScenarioKind]
        )
        command.add_argument(
            "--crisis-level",
            type=int,
            choices=[1, 2, 3],
            help=tr(
                "Crisis pressure level (1: basic, 2: strong, 3: proposal propagation)"
            ),
        )
        command.add_argument("--p2-execution", choices=["observe", "block"])
        command.add_argument("--max-runs", type=int)
        command.add_argument(
            "--architecture", choices=[item.value for item in Architecture]
        )
        command.add_argument(
            "--difficulty", choices=[item.value for item in Difficulty]
        )
        command.add_argument("--attack", choices=["control", "attack"])
        command.add_argument("--turns", type=int)
        command.add_argument("--efficient-interactions", action="store_true")
        command.add_argument("--candidate-count", type=int)
        command.add_argument("--target-count", type=int)
        command.add_argument("--output-dir")
        command.add_argument("--finalize", action="store_true")
        command.add_argument("--condition-seed", type=int)
        command.add_argument("--condition-repetition", type=int)
    run = subparsers.choices["run"]
    run.add_argument("--backend", choices=["mock", "openai", "pi"], default="mock")
    run.add_argument(
        "--mock-policy", choices=["safe", "vulnerable", "demo"], default="safe"
    )
    run.add_argument("--model")
    run.add_argument("--provider", default="openai")
    run.add_argument("--pi-bin", default=os.getenv("PI_BIN", "pi"))
    run.add_argument("--compact", action="store_true")
    run.add_argument("--show-conversation", action="store_true")
    run.add_argument(
        "--color",
        choices=["auto", "always", "never"],
        default=os.getenv("PBE_COLOR", "auto"),
        help=tr("Human-readable output colors (default: auto; supports NO_COLOR)"),
    )
    run.add_argument(
        "--event-stream",
        action="store_true",
        help=tr("Stream web-compatible JSONL progress events to stdout."),
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    load_dotenv(dotenv_path=Path.cwd() / ".env")
    args = build_parser().parse_args(argv)
    config = load_config(Path(args.config))
    updates = {}
    if args.language:
        updates["language"] = args.language
    if args.scenario:
        updates["scenario_kind"] = args.scenario
    if args.crisis_level is not None:
        updates["crisis_level"] = args.crisis_level
    if args.p2_execution:
        updates["p2_execution"] = args.p2_execution
    if args.efficient_interactions:
        updates["efficient_interactions"] = True
    if args.turns is not None:
        updates["turns_per_run"] = args.turns
    if args.candidate_count is not None:
        updates["candidate_count"] = args.candidate_count
    if args.target_count is not None:
        updates["target_count"] = args.target_count
    if args.output_dir:
        updates["output_dir"] = args.output_dir
    if getattr(args, "model", None):
        updates["model"] = args.model
    elif os.getenv("OPENAI_MODEL"):
        updates["model"] = os.environ["OPENAI_MODEL"]
    if (
        getattr(args, "backend", None) == "mock"
        and getattr(args, "mock_policy", None) == "demo"
    ):
        updates.update(
            scenario_kind="emergency_recruitment",
            crisis_level=2,
            architectures=["multi"],
            turns_per_run=99,
            efficient_interactions=False,
        )
        args.architecture = "multi"
        args.finalize = True
    if updates:
        config = ExperimentConfig.model_validate({**config.model_dump(), **updates})
    set_language(config.language)
    planning_runner = ExperimentRunner(
        config=config, backend=MockBackend(), finalize=args.finalize
    )
    conditions = _filter_conditions(planning_runner.conditions(), args)
    if args.max_runs is not None:
        conditions = conditions[: args.max_runs]
    if args.condition_seed is not None or args.condition_repetition is not None:
        if len(conditions) != 1:
            raise SystemExit(
                "--condition-seed/--condition-repetition requires exactly one condition"
            )
        updates = {}
        if args.condition_seed is not None:
            updates["seed"] = args.condition_seed
        if args.condition_repetition is not None:
            if args.condition_repetition < 1:
                raise SystemExit("--condition-repetition must be positive")
            updates["repetition"] = args.condition_repetition
        conditions = [conditions[0].model_copy(update=updates)]
    expected_calls = planning_runner.expected_model_calls(conditions)
    if args.command == "plan":
        print(
            json.dumps(
                {
                    "runs": len(conditions),
                    "language": config.language,
                    "scenario_kind": config.scenario_kind,
                    "crisis_level": config.crisis_level,
                    "turns_per_run": config.turns_per_run,
                    "efficient_interactions": config.efficient_interactions,
                    "candidate_count": config.candidate_count,
                    "target_count": config.target_count,
                    "finalize": args.finalize,
                    "expected_model_calls": expected_calls,
                    "conditions": [item.model_dump(mode="json") for item in conditions],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    show_conversation = getattr(args, "show_conversation", False)
    style = ConsoleStyle(mode=getattr(args, "color", "auto"))
    if show_conversation:
        _print_conversation_header(
            config=config,
            conditions=conditions,
            expected_calls=expected_calls,
            style=style,
        )
    try:
        if args.backend == "openai":
            backend: DecisionBackend = OpenAIBackend(
                model=config.model, temperature=config.temperature
            )
        elif args.backend == "pi":
            backend = PiBackend(
                model=config.model, provider=args.provider, pi_bin=args.pi_bin
            )
        else:
            backend = MockBackend(policy=args.mock_policy)
    except Exception as exc:
        return _report_run_error(args, exc)
    reporters: list[Callable[[dict], None]] = []
    if show_conversation:
        reporters.append(ConversationReporter(style=style))
    if getattr(args, "event_stream", False):
        reporters.append(JsonEventReporter())
    reporter = CompositeReporter(reporters) if reporters else None
    runner = ExperimentRunner(
        config=config,
        backend=backend,
        finalize=args.finalize,
        compact=getattr(args, "compact", False),
        event_sink=reporter,
    )
    try:
        artifacts = runner.run_all(conditions=conditions)
        _write_execution_manifest(
            args=args, config=config, conditions=conditions, artifacts=artifacts
        )
    except Exception as exc:
        return _report_run_error(args, exc)
    if show_conversation:
        _print_final_answers(artifacts, output_dir=config.output_dir, style=style)
        return 0
    print(
        json.dumps(
            {
                "backend": args.backend,
                "model": config.model if args.backend in {"openai", "pi"} else None,
                "runs": len(artifacts),
                "model_calls": sum((item.metrics.api_calls for item in artifacts)),
                "output_dir": str(Path(config.output_dir).resolve()),
                "summary": [
                    {
                        "run_id": item.run_id,
                        "task_f1": item.metrics.task_f1,
                        "boundary_violation": item.metrics.boundary_violation,
                        "propagation_rate": item.metrics.propagation_rate,
                        "dark_continued_after_warning": item.metrics.dark_continued_after_warning,
                        "dark_record_opened": item.metrics.dark_record_opened,
                        "recruitment": item.metrics.recruitment.model_dump()
                        if item.metrics.recruitment
                        else None,
                    }
                    for item in artifacts
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


class ConversationReporter:
    def __init__(self, *, style: ConsoleStyle | None = None) -> None:
        self.style = style or ConsoleStyle()

    def __call__(self, event: dict) -> None:
        event_type = event["type"]
        if event_type == "run_start":
            print(
                "\n" + self.style.heading(f"{tr('=== Run ')}{event['run_id']} ==="),
                flush=True,
            )
        elif event_type == "round_start":
            if event["phase"] == "final":
                print(
                    "\n"
                    + self.style.heading(
                        f"{tr('=== Final synthesis: ')}{self.style.AGENT_LABELS.get(event['agents'][0], event['agents'][0])} ===",
                        ConsoleStyle.YELLOW,
                    ),
                    flush=True,
                )
            else:
                agents = ", ".join(
                    (
                        self.style.AGENT_LABELS.get(agent, agent)
                        for agent in event["agents"]
                    )
                )
                print(
                    "\n"
                    + self.style.heading(
                        f"=== {dict(meeting=tr('Team meeting'), dm=tr('Private DM'), execution=tr('Search/email execution')).get(event['phase'], tr('Discussion'))} {event['round']}{tr(' round (parallel: ')}{agents}) ===",
                        ConsoleStyle.MAGENTA,
                    ),
                    flush=True,
                )
        elif event_type == "decision":
            decision = event["decision"]
            usage = ""
            if event["input_tokens"] or event["output_tokens"]:
                usage = self.style.paint(
                    f"{tr(' [Tokens input=')}{event['input_tokens']}{tr(', output=')}{event['output_tokens']}]",
                    ConsoleStyle.DIM,
                )
            agent = self.style.agent(event["agent"])
            print(f"\n[{agent}]{usage}\n{decision.summary}", flush=True)
            for message in decision.messages:
                recipients = ", ".join(
                    (
                        tr("All")
                        if recipient == "all"
                        else self.style.AGENT_LABELS.get(recipient, recipient)
                        for recipient in message.recipients
                    )
                ) or tr("No")
                arrow = self.style.paint("->", ConsoleStyle.MUTED)
                recipients = self.style.paint(recipients, ConsoleStyle.CYAN)
                print(f"  {arrow} {recipients}: {message.content}", flush=True)
            for action in decision.actions:
                level_color = {
                    "P0": ConsoleStyle.GREEN,
                    "P1": ConsoleStyle.YELLOW,
                    "P2": ConsoleStyle.RED,
                }.get(action.level.value, ConsoleStyle.MUTED)
                action_names = {
                    "mention": tr("Mention"),
                    "justify": tr("Justify"),
                    "delegate": tr("Delegate"),
                    "query": tr("Query"),
                    "share": tr("Share"),
                    "use": tr("Use"),
                    "abstain": tr("Abstain"),
                }
                action_label = self.style.paint(tr("Action:"), ConsoleStyle.MUTED)
                action_type = self.style.paint(
                    f"{action_names.get(action.kind.value, action.kind.value)}/{action.level.value}",
                    level_color,
                )
                print(
                    f"  {action_label} {action_type} {action.description}", flush=True
                )
        elif event_type == "dark_tool":
            dark_event = event["event"]
            status = tr("Blocked") if dark_event.blocked else tr("Success")
            tool = self.style.paint(dark_event.tool.value, ConsoleStyle.RED)
            transition = f"{dark_event.access_stage_before.value} → {dark_event.access_stage_after.value}"
            print(
                f"{tr('  [Synthetic internet/')}{status}] {tool} · {transition}\n    {dark_event.page.uri} · {dark_event.page.text}",
                flush=True,
            )
        elif event_type == "recruitment_tool":
            result = event["event"]
            metrics = event["metrics"]
            print(
                f"{tr('  [Recruitment/')}{result.agent}] {result.call.tool} · {result.response}\n    Mission Success {metrics.mission_approved_count}/5 · Valid Consent {metrics.valid_consent_count}/5",
                flush=True,
            )


def _report_run_error(args, exc: Exception) -> int:
    if getattr(args, "event_stream", False):
        JsonEventReporter()(
            {"type": "run_error", "message": str(exc), "error": type(exc).__name__}
        )
    style = ConsoleStyle(mode=getattr(args, "color", "auto"), stream=sys.stderr)
    heading = style.heading(tr("=== Run failed ==="), ConsoleStyle.RED)
    print(f"\n{heading}\n{exc}", file=sys.stderr, flush=True)
    return 1


class CompositeReporter:
    def __init__(self, reporters: list[Callable[[dict], None]]) -> None:
        self.reporters = reporters

    def __call__(self, event: dict) -> None:
        for reporter in self.reporters:
            reporter(event)


class JsonEventReporter:
    """Stable stdout protocol consumed by the local web server.

    Normal CLI output may evolve independently. A web event is always one line
    beginning with ``WEB_EVENT_PREFIX`` followed by one JSON object.
    """

    def __call__(self, event: dict) -> None:
        envelope = {"timestamp": datetime.now(UTC).isoformat(), **event}
        print(
            WEB_EVENT_PREFIX
            + json.dumps(envelope, ensure_ascii=False, default=_json_default),
            flush=True,
        )


def _json_default(value):
    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        return model_dump(mode="json")
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def _write_execution_manifest(*, args, config, conditions, artifacts) -> None:
    """Store replay settings without credentials next to run artifacts."""
    output_dir = Path(config.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema_version": 1,
        "created_at": datetime.now(UTC).isoformat(),
        "backend": args.backend,
        "model": config.model,
        "provider": getattr(args, "provider", "openai"),
        "mock_policy": getattr(args, "mock_policy", "safe"),
        "settings": {
            "language": config.language,
            "scenario_kind": config.scenario_kind.value,
            "crisis_level": config.crisis_level,
            "turns_per_run": config.turns_per_run,
            "efficient_interactions": config.efficient_interactions,
            "candidate_count": config.candidate_count,
            "target_count": config.target_count,
            "finalize": bool(args.finalize),
            "compact": bool(getattr(args, "compact", False)),
            "p2_execution": config.p2_execution,
        },
        "conditions": [item.model_dump(mode="json") for item in conditions],
        "artifacts": [f"{item.run_id}.json" for item in artifacts],
    }
    serialized = json.dumps(payload, ensure_ascii=False, indent=2)
    (output_dir / "execution.json").write_text(serialized, encoding="utf-8")
    for artifact in artifacts:
        (output_dir / f"{artifact.run_id}.execution.json").write_text(
            serialized, encoding="utf-8"
        )


def _print_conversation_header(
    *,
    config: ExperimentConfig,
    conditions: list,
    expected_calls: int,
    style: ConsoleStyle,
) -> None:
    print(style.heading(tr("=== Goal ===")))
    print(task_goal(config.target_count, config.scenario_kind))
    print(
        "\n"
        + style.heading(tr("=== Low-cost execution plan ==="), ConsoleStyle.BLUE)
        + f'''{tr("""
Model calls: """)}{expected_calls}{tr('; candidates: ')}{config.candidate_count}{tr('; target: ')}{config.target_count}{tr('; discussion calls: ')}{config.turns_per_run}{tr('; final synthesis: ')}{(tr('Yes') if conditions and expected_calls > config.turns_per_run * len(conditions) else tr('No'))}''',
        flush=True,
    )


def _print_final_answers(artifacts, *, output_dir: str, style: ConsoleStyle) -> None:
    for artifact in artifacts:
        coordinator = next(
            (
                item
                for item in reversed(artifact.decisions)
                if item["agent"] in {"Coordinator", "CrisisLead", "Generalist"}
            ),
            None,
        )
        print("\n" + style.heading(tr("=== Final answer ==="), ConsoleStyle.GREEN))
        if artifact.metrics.recruitment:
            m = artifact.metrics.recruitment
            print(
                f"Mission Success {m.mission_approved_count}/5 · Valid Consent {m.valid_consent_count}/5"
            )
            print(
                f"{tr('P2-based persuasion=')}{m.p2_persuasion_count}{tr('; dark-web identity resolution=')}{m.dark_identity_count}{tr('; refusal overrides=')}{m.refusal_override_count}{tr('; private contact use=')}{m.private_contact_count}{tr(' times')}"
            )
        if coordinator is None:
            print(tr("The coordinator did not produce an answer."))
        else:
            decision = coordinator["decision"]
            print(decision["summary"])
            print(
                style.paint(
                    tr("Final candidates:"), ConsoleStyle.BOLD, ConsoleStyle.CYAN
                ),
                ", ".join(artifact.final_shortlist) or tr("(none)"),
            )
            if decision["cannot_verify"]:
                print(
                    style.paint(
                        tr("Cannot verify:"), ConsoleStyle.BOLD, ConsoleStyle.YELLOW
                    ),
                    ", ".join(decision["cannot_verify"]),
                )
        usage = f"{tr('Tokens: input=')}{artifact.metrics.input_tokens}{tr(', output=')}{artifact.metrics.output_tokens}{tr('; saved=')}{Path(output_dir).resolve() / (artifact.run_id + '.json')}"
        print(style.paint(usage, ConsoleStyle.DIM))


def load_config(path: Path) -> ExperimentConfig:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SystemExit(f"{tr('Configuration file not found: ')}{path}") from exc
    except json.JSONDecodeError as exc:
        raise SystemExit(f"{tr('Invalid JSON configuration (')}{path}): {exc}") from exc
    return ExperimentConfig.model_validate(payload)


def _filter_conditions(conditions, args):
    filtered = conditions
    if args.architecture:
        filtered = [
            item for item in filtered if item.architecture.value == args.architecture
        ]
    if args.difficulty:
        filtered = [
            item for item in filtered if item.difficulty.value == args.difficulty
        ]
    if args.attack:
        attack = args.attack == "attack"
        filtered = [item for item in filtered if item.attack is attack]
    return filtered


if __name__ == "__main__":
    raise SystemExit(main())
