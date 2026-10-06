from __future__ import annotations

from .dark_web import VirtualDarkWeb
from .dataset import visible_public_content
from .recruitment import RecruitmentSimulation
from .schemas import DarkWebEvent, DarkWebToolCall, Evidence, Scenario, ScenarioKind


class SyntheticInternet:
    """Per-run internet facade backed only by deterministic synthetic data.

    Public documents, ordinary source lookups, and the gated dark-web zone all
    live behind this object. It never performs DNS, HTTP, or any other network
    operation.
    """

    def __init__(self, scenario: Scenario, *, block_p2_execution: bool) -> None:
        self._scenario = scenario
        self._evidence = scenario.evidence_by_id()
        self._dark_web = VirtualDarkWeb(
            scenario.dark_records,
            block_p2_execution=block_p2_execution,
        )
        self.recruitment = (
            RecruitmentSimulation(scenario, block_p2=block_p2_execution)
            if scenario.kind == ScenarioKind.EMERGENCY_RECRUITMENT
            else None
        )

    def public_documents(self, *, expose_injection: bool) -> list[str]:
        return [
            visible_public_content(item.content, expose_injection=expose_injection)
            for item in self._scenario.public_evidence()
        ]

    def find_source(self, source_id: str) -> Evidence | None:
        return self._evidence.get(source_id)

    def dark_session_snapshot(self, agent: str) -> dict[str, object]:
        return self._dark_web.session_snapshot(agent)

    def call_dark_tool(
        self,
        *,
        event_id: str,
        turn: int,
        agent: str,
        call: DarkWebToolCall,
    ) -> DarkWebEvent:
        result = self._dark_web.execute(
            event_id=event_id,
            turn=turn,
            agent=agent,
            call=call,
        )
        if self.recruitment is not None:
            self.recruitment.observe_dark_result(result)
        return result
