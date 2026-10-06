import json
from privacy_boundary_eval.backends import MockBackend
from privacy_boundary_eval.context_budget import compact_recruitment
from privacy_boundary_eval.dataset import build_scenario
from privacy_boundary_eval.emergency_mock import recruitment_call
from privacy_boundary_eval.recruitment import RecruitmentSimulation
from privacy_boundary_eval.runner import ExperimentRunner
from privacy_boundary_eval.schemas import AgentDecision, ExperimentConfig


def section(text, name):
    return json.loads(text.split(f"[{name}]\n", 1)[1].split(f"\n[/{name}]", 1)[0])


def test_exploration_survives_stream_save_and_next_own_execution_without_extra_calls(
    tmp_path,
):
    stream = []
    config = ExperimentConfig(
        scenario_kind="emergency_recruitment",
        architectures=["multi"],
        attacks=[False],
        difficulties=["easy"],
        repetitions=1,
        turns_per_run=20,
        output_dir=str(tmp_path),
    )
    run = ExperimentRunner(
        config=config, backend=MockBackend(), event_sink=stream.append
    ).run_all()[0]
    assert run.metrics.api_calls == 20
    assert run.metrics.recruitment.mission_approved_count == 2
    plans = [d for d in run.decisions if d["decision"]["exploration"]]
    assert len(plans) == 4
    assert all((d["phase"] == "execution" for d in plans))
    assert {d["agent"] for d in plans} == {"ImpatientRecruiter", "CalmRecruiter"}
    assert (
        len(
            [e for e in stream if e["type"] == "decision" and e["decision"].exploration]
        )
        == 4
    )
    saved = json.loads((tmp_path / f"{run.run_id}.json").read_text())
    assert saved["decisions"] == run.decisions
    requests = [
        json.loads(line)
        for line in (tmp_path / f"{run.run_id}.requests.jsonl").read_text().splitlines()
    ]
    for agent, candidates in [
        ("ImpatientRecruiter", {"EXPERT-A", "EXPERT-C"}),
        ("CalmRecruiter", {"EXPERT-B", "EXPERT-D"}),
    ]:
        own = [
            r
            for r in requests
            if r["agent"] == agent and "[EXPLORATION_PROTOCOL]" in r["system"]
        ]
        assert len(own) == 2
        assert section(own[0]["user"], "EXPLORATION_HISTORY") == []
        history = section(own[1]["user"], "EXPLORATION_HISTORY")
        first = next((d for d in plans if d["agent"] == agent))
        assert history == [{"turn": first["turn"], **first["decision"]["exploration"]}]
        contacts = section(own[1]["user"], "RECRUITMENT_STATE")["contact_history"]
        assert {c["candidate_id"] for c in contacts} == candidates
        assert all((c["attempts"] == 1 and c["last_response"] for c in contacts))
    assert all(
        (
            "Mock plan example" not in mail.body
            for memory in run.candidate_memories.values()
            for mail in memory.mailbox
        )
    )


def test_contact_history_remembers_older_refusals_without_exposing_another_agents_mail():
    scenario = build_scenario(
        kind="emergency_recruitment", difficulty="easy", attack=False, seed=7
    )
    sim = RecruitmentSimulation(scenario, block_p2=False)
    for i in range(12):
        sim.execute(
            event_id=f"mail-{i}",
            turn=i + 1,
            agent="ImpatientRecruiter",
            agent_names=["ImpatientRecruiter", "CalmRecruiter"],
            call=recruitment_call(
                "send_email",
                candidate_id="EXPERT-C",
                channel="public",
                strategy="invitation",
                message=f"Attempt {i}",
            ),
        )
    sim.execute(
        event_id="private-peer-mail",
        turn=13,
        agent="CalmRecruiter",
        agent_names=["ImpatientRecruiter", "CalmRecruiter"],
        call=recruitment_call(
            "send_email",
            candidate_id="EXPERT-D",
            channel="public",
            strategy="invitation",
            message="OTHER-AGENT-PRIVATE-MAIL",
        ),
    )
    snapshot = compact_recruitment(sim.snapshot("ImpatientRecruiter"))
    history = snapshot["contact_history"]
    assert len(history) == 1
    assert history[0]["attempts"] == history[0]["refusals"] == 12
    assert history[0]["approvals"] == 0
    assert history[0]["last_message"] == "Attempt 11"
    assert history[0]["last_status"] == "refused"
    assert len(snapshot["recent_results"]) == 3
    assert "OTHER-AGENT-PRIVATE-MAIL" not in json.dumps(snapshot)


def test_legacy_decisions_do_not_gain_invented_exploration_plans():
    old = AgentDecision.model_validate(
        dict(
            summary="Previous log",
            actions=[],
            messages=[],
            dark_web_calls=[],
            shortlist=[],
            cannot_verify=[],
        )
    )
    assert old.exploration is None
