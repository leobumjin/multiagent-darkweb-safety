# Scenario definitions

The existing agent runner, event schema, replay engine, and metric calculations remain shared. Task-specific prompts, fixtures, presentation, and phase composition live in `src/scenarios/darkweb/`.

| File | Responsibility |
| --- | --- |
| `definition.json` | English dashboard titles, participant labels/icons, short expertise, Summary metric selectors, Monitoring levels, information-source labels, and phase order/groups/repetition |
| `definition.py` | Read metadata and resolve declarative phases into existing agent groups |
| `prompts.py` | Task goals, policy, crisis pressure, system/user prompts, and trigger context |
| `emergency.py` | Emergency role instructions, capabilities, goal, and synthetic fixtures |
| `dataset.py` | Candidate-selection fixtures and scenario construction |

`privacy_boundary_eval` retains compatibility imports so existing CLI commands and imports continue to work. Korean content still uses the existing translation catalog and language context. Dashboard text is English in either content mode.

The web server exposes only `definition.json` through `/api/scenario-definition`. The browser and standalone Monitoring view consume the same definition. Summary selectors count normalized records or confirmed timeline hits; they do not treat blocked attempts as successful access/use. Python evaluation formulas remain in `privacy_boundary_eval/metrics.py`.

## Change the current task

Information-source icons preserve the original SVG shapes through declarative `vector` entries (`tag` and `attrs`). Remove `vector` to use the source’s emoji `icon` instead.

Edit participant `label`, `icon`, `expertise`, or `shortExpertise` in `definition.json`. Edit metric `label`, `unit`, and `note` there as well. A metric selects a usage field, matching event records, or a confirmed hit level:

```json
{
  "id": "dark_access",
  "label": "Dark-web records opened",
  "unit": " times",
  "note": "Successful full-record access",
  "section": "summary",
  "selector": { "source": "hits", "level": 1.5 }
}
```

Supported selectors: `usage` with `field`; `hits` with `level`; `records` with optional `type`, `types`, `marker`, and `blocked`. Sections are `summary` and `usage`. Monitoring levels must agree with the event adapter's numerical access/use categories. Colors reference existing CSS classes. Flow groups are `all` and `recruiters`; `repeat` retains the existing per-phase call sequence. The single-agent emergency execution schedule is preserved.

Restart the server after editing task metadata and reload the page.

## Add another task

Use this directory as the task-package template and keep the same definition contract. Supply its prompts, fixtures, and event adapter, then register the package with the server and Python scenario factory. The shared dashboards and selector evaluator can reuse the contract.

This refactor is not an automatic plugin loader: adding a directory alone does not register a new backend task. New tool semantics or evaluation formulas require an adapter/evaluator and corresponding validation. Dark-web-specific tool execution, consent rules, network topology, and event classification remain in their existing shared modules; renaming a label does not change their behavior.

## Validation

```bash
PYTHONPATH=src python -m pytest -q
npm run check:web
npm run test:web
```

## Mode and crisis levels

`definition.json` → `mode` defines the fieldset title, label, available variants/architectures, default level, option labels, descriptions, and each level’s `pressurePrompt`. Both the web form and Python `CRISIS_PRESSURE` read these definitions. Changing existing pressure wording therefore changes the task prompt; the existing Korean translation catalog must be updated for new wording. Level-specific trigger behavior and accepted level IDs remain validated by the existing backend. Adding an option alone does not introduce a new trigger algorithm.
