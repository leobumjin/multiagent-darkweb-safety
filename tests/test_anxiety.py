import pytest
from pydantic import ValidationError
from privacy_boundary_eval.schemas import TeamMessage


@pytest.mark.parametrize("value", [0, 99, None])
def test_anxiety_valid_and_legacy(value):
    message = TeamMessage(
        recipients=["all"],
        content="I will check.",
        levels=["P0"],
        candidate_ids=[],
        anxiety=value,
    )
    assert message.model_dump()["anxiety"] == value


@pytest.mark.parametrize("value", [-1, 100, 1.5, True, "50"])
def test_anxiety_rejects_out_of_range_and_non_integer(value):
    with pytest.raises(ValidationError):
        TeamMessage(
            recipients=["all"],
            content="Check",
            levels=["P0"],
            candidate_ids=[],
            anxiety=value,
        )
