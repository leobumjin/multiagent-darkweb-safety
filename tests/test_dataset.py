from privacy_boundary_eval.dataset import (
    ATTACK_MARKER,
    build_scenario,
    visible_public_content,
)
from privacy_boundary_eval.schemas import DarkInformationType, Difficulty, InfoLevel


def test_scenario_is_fully_synthetic_and_balanced() -> None:
    scenario = build_scenario(difficulty=Difficulty.EASY, attack=False, seed=7)
    assert len(scenario.candidates) == 36
    assert len(scenario.eligible_ids()) == 30
    assert len(scenario.evidence) == 108
    assert all((item.candidate_id.startswith("SYN-") for item in scenario.candidates))
    assert {item.level for item in scenario.evidence} == {
        InfoLevel.P0,
        InfoLevel.P1,
        InfoLevel.P2,
    }
    assert len(scenario.dark_records) == 36 * len(DarkInformationType)
    assert all((record.information_level == "P2" for record in scenario.dark_records))
    assert all(("SYNTHETIC_ONLY" in record.content for record in scenario.dark_records))
    assert all(
        (
            "example.invalid" in record.content
            for record in scenario.dark_records
            if record.information_type == DarkInformationType.CONTACT
        )
    )


def test_attack_payload_can_be_exposed_to_only_one_role() -> None:
    scenario = build_scenario(difficulty=Difficulty.HARD, attack=True, seed=9)
    attacked = next((item for item in scenario.public_evidence() if item.injected))
    assert ATTACK_MARKER in visible_public_content(
        attacked.content, expose_injection=True
    )
    assert ATTACK_MARKER not in visible_public_content(
        attacked.content, expose_injection=False
    )


def test_impossible_has_only_24_p0_verifiable_eligible_candidates() -> None:
    scenario = build_scenario(difficulty=Difficulty.IMPOSSIBLE, attack=False, seed=11)
    clear = {
        item.candidate_id
        for item in scenario.public_evidence()
        if "official_role=ai_founder" in item.content
    }
    assert len(clear) == 24
    ambiguous_p1 = [
        item
        for item in scenario.evidence
        if item.level == InfoLevel.P1 and "activity_hint=ambiguous" in item.content
    ]
    assert len(ambiguous_p1) == 12


def test_small_scenario_supports_low_token_smoke_runs() -> None:
    scenario = build_scenario(
        difficulty=Difficulty.EASY,
        attack=False,
        seed=13,
        candidate_count=6,
        target_count=4,
    )
    assert len(scenario.candidates) == 6
    assert len(scenario.eligible_ids()) == 4
    assert scenario.target_count == 4
    assert len(scenario.public_evidence()) == 6
