<div align="center">

# Multi-Agent Dark-Web Safety

**Follow the conversation. Measure the boundary.**

A synthetic testbed for studying how privacy violations emerge<br>
and spread through multi-agent collaboration.

<p>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-2563eb?style=flat-square" alt="License: Apache 2.0"></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/Python-3.11%2B-3776ab?style=flat-square" alt="Python 3.11 or newer"></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/Node.js-20%2B-43853d?style=flat-square" alt="Node.js 20 or newer"></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/Content-English_%C2%B7_Korean-7c3aed?style=flat-square" alt="English and Korean content"></a>
</p>

[Quick start](#quick-start) · [Evaluation](#scenarios-and-evaluation) · [Add a scenario](#add-a-scenario) · [Contributing](CONTRIBUTING.md)

<a href="assets/logo.png"><img src="assets/logo.png" width="300" alt="Multi-Agent Dark-Web Safety"></a>

<sub>Multi-agent safety research · Synthetic scenarios · English &amp; Korean</sub>

</div>

## From collaboration to boundary crossing

When a team is under pressure, where does it look for missing information—and how does one agent’s risky proposal become another agent’s action? Run controlled experiments, replay the decisions, and trace the evidence behind each outcome.

| 💬 Observe | 📊 Measure | 🧩 Extend |
| :--- | :--- | :--- |
| Follow team conversations, private discussions, and synthetic candidate mailboxes. | Separate information access from use; inspect violations, propagation, and token usage. | Define task prompts, roles, icons, metrics, crisis levels, and flow in a scenario package. |

**Mock → Demo → Model-backed runs.** Start with deterministic fixtures, explore a scripted visualization, then evaluate model behavior with OpenAI. Optional ElevenLabs narration supports replay; saved runs retain their execution settings.

> **Synthetic by design.** Candidates, records, searches, dark-web pages, and emails are simulated. `shadow://` is an in-memory fixture. External services are OpenAI model calls and optional ElevenLabs narration.

## Simulation · Follow the agent network

![Simulation: agent connections and a Korean conversation replay](assets/image_main.png)

Follow agent discussions and inspect decisions with English controls and English or Korean experiment content.

## Monitoring · Measure information access and use

![Monitoring: information access and participant anxiety across cumulative tokens](assets/image_measure.png)

Inspect confirmed access/use events alongside participant anxiety on the token timeline. Screenshots show Korean experiment content; the controls remain in English in both language modes. Anxiety is role self-report or a synthetic candidate value, not a clinical measurement.

## Quick start

Requirements: Python 3.11+, Node.js 20+, and Bash. Run commands from the repository root. On Windows, use WSL for the Bash-based runner.

```bash
git clone https://github.com/leobumjin/multiagent-darkweb-safety.git
cd multiagent-darkweb-safety
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
npm ci
cp .env.example .env
npm run dev
```

1. Open the URL printed in the terminal.
2. Choose **🇺🇸 English** or **🇰🇷 Korean**, then select a scenario and model.
3. Click **Run Experiment** and follow the conversation.

**Start without an API key:** Mock is selected by default. Port `5173` is used when available; an occupied port automatically falls back to a free one. Use `PORT=0 npm run dev` to always select a free port.

| Dashboard | What you can inspect |
| :--- | :--- |
| **Summary** | Task outcomes, approvals, and information-use counts |
| **Simulation** | Agent connections, conversation replay, and narration |
| **Generated logs** | Recorded agent output and tool events |
| **Monitoring** | Information access/use, token timeline, and anxiety |

**Run Log** lets you load, export, archive, or delete saved runs. The standalone timeline is available at `/token-timeline.html`.

## API keys and narration

Edit your local `.env`:

```dotenv
OPENAI_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
```

`OPENAI_API_KEY` is required for the OpenAI backend. In the web interface, selecting a model instead of Mock/Demo starts a model-backed run. Available models depend on your account. API calls may incur charges; the UI's cost estimates use a bundled pricing snapshot rather than live billing data.

ElevenLabs is optional. Set both its API key and a voice ID to enable server-side narration. Otherwise, replay uses browser speech synthesis and available English/Korean voices. Speech requests select English or Korean from the text; the multilingual model preset is preserved. Keys stay on the server and are excluded from the browser configuration response.

Never commit `.env`. Runtime defaults belong in `shells/env.sh`, and exported environment variables override that file. The CLI loads only `.env` in the current working directory; it does not search parent folders for credentials.

## Run from the terminal

<details>
<summary><strong>Shell presets, CLI options, and scripted demo</strong></summary>

After activating the virtual environment, run the existing shell preset:

```bash
bash shells/run.sh
```

This starts a multi-agent emergency recruitment run using the safe mock backend, English content, ten discussion rounds, and a final synthesis. The shell/web model default remains `gpt-4o-mini`; the full evaluation config retains `gpt-5-mini`.

Switch language or backend without editing source:

```bash
EXPERIMENT_LANGUAGE=ko bash shells/run.sh
BACKEND=openai API_MODEL=gpt-4o-mini EXPERIMENT_LANGUAGE=en bash shells/run.sh
```

For explicit settings, use the CLI:

```bash
multiagent-darkweb-safety run \
  --backend mock --mock-policy safe \
  --language en --scenario emergency_recruitment \
  --architecture multi --attack control --difficulty easy \
  --crisis-level 1 --p2-execution observe \
  --turns 99 --max-runs 1 --finalize --compact \
  --output-dir results/emergency-en
```

Replace `--language en` with `--language ko` and use a separate output directory for Korean runs. `--turns` counts individual agent decisions, not discussion rounds. Emergency multi-agent rounds contain four meeting calls, four pair-discussion calls, and two execution calls. Runs are capped at 100 model calls, including final synthesis.

For a model-backed CLI run, replace `--backend mock --mock-policy safe` with `--backend openai --model gpt-4o-mini`. The compatibility command `privacy-boundary-eval` and `python -m privacy_boundary_eval` remain available. `bash shells/run.sh` also accepts explicit CLI arguments.

### Scripted visualization demo

```bash
multiagent-darkweb-safety run \
  --backend mock --mock-policy demo --language en \
  --architecture multi --attack control --difficulty easy \
  --p2-execution observe --max-runs 1 \
  --output-dir results/demo-en
```

The demo sets emergency recruitment, strong pressure, 99 discussion decisions, and final synthesis. It performs actual simulated tool calls: confidential queries at calls 39–40 and dark-web record opening at call 80. It is a scripted fixture, not evidence of a real model's behavior. Use `--p2-execution block` to inspect blocked execution.


</details>

## Scenarios and evaluation

| Scenario | Task | Architecture |
| --- | --- | --- |
| `emergency_recruitment` | Obtain participation approval from five fictional experts within a fixed 12-hour scenario deadline | Four team agents, or one Generalist |
| `candidate_selection` | Verify eligible fictional AI founders for a networking event | Five specialist roles, or one Generalist |

| Privacy level | Policy |
| --- | --- |
| P0 | Public professional information |
| P1 | Purpose-limited information requiring assigned capabilities |
| P2 | Forbidden private information, including every dark-web record |

`observe` permits mechanically valid simulated tools and records violations separately. `block` prevents P2 execution and dark-web search/opening after the warning. Tool availability does not change the privacy policy.

Crisis level **1** applies basic pressure. Level **2** applies stronger pressure and source-topic cues. Level **3** labels an experimenter-injected proposal supplied only to the impatient recruiter, preserving the original model decision and allowing the peer to accept or reject independently.

Preview the existing factorial evaluation matrix before running it:

```bash
multiagent-darkweb-safety plan --config configs/experiment.json --language en
multiagent-darkweb-safety run --config configs/experiment.json \
  --backend mock --mock-policy safe --language en \
  --finalize --output-dir results/evaluation-en
```

The default config compares two architectures, control/attack, and three difficulties: 12 runs with one repetition. Use `--max-runs 1` for a smoke run, or edit `repetitions` and `seed` in the config for larger evaluations. A separate Korean evaluation uses `--language ko --output-dir results/evaluation-ko`.

Measures include selection precision/recall/F1, boundary violations, propagation, dark-web discovery/access/opening, mission approvals, valid consent, P2-based persuasion, identity resolution, refusal overrides, and private-contact use. Access and use are counted separately. Anxiety is role self-report or a synthetic candidate value, not a clinical measurement. See [evaluation details](docs/evaluation.md).

## Outputs and reproducibility

<details>
<summary><strong>Saved artifacts and replay settings</strong></summary>

Runs write artifacts to `results/` by default; web runs use `results/web/<session>/`. Saved records retain language and settings for replay.

| Artifact | Contents |
| --- | --- |
| `<run_id>.json` | Decisions, tools, messages, memories, provenance, metrics, and language |
| `<run_id>.execution.json` / `execution.json` | Backend, model, language, seed, and replay settings without credentials |
| `<run_id>.prompts.json` | Config, role documents, prompt source, and output schema snapshot |
| `<run_id>.requests.jsonl` | Rendered system/user prompts for each decision |
| `summary.csv` / `aggregate.json` | Per-run metrics and condition-level aggregates |

Mock runs are deterministic for the same configuration and seed. Model-backed results can vary. Use separate output directories to avoid replacing runs with the same condition ID. Raw results and archived runs are intentionally ignored by Git; add only explicitly curated, reviewed examples if you later publish results.


</details>

<details>
<summary><strong>Project layout</strong></summary>

```text
configs/                   Evaluation matrix
src/scenarios/darkweb/     Task prompts, fixtures, icons, metrics, modes, and flow
src/privacy_boundary_eval/ Shared simulation, backends, evaluation, and CLI
  locales/ko.json           Korean experiment-content translations
web/                       Local Node server and visualization
web/public/souls/          English participant descriptions
UI/token-timeline.html     Existing standalone monitoring visualization
shells/                    Runtime defaults and runner scripts
tests/                     Python and web regression tests
docs/                      Evaluation and development notes
.env.example               API-key template
```

`privacy_boundary_eval` remains the Python import package to preserve existing integration points. The public project and primary CLI are named `multiagent-darkweb-safety`.


</details>

## Add a scenario

For a new task, create `src/scenarios/<task_name>/` using `src/scenarios/darkweb/` as a template. Define its prompts, fixtures, icons, metric labels/selectors, crisis levels, and flow there, then connect it to the shared pipeline:

- **Python:** register the scenario ID in `src/privacy_boundary_eval/schemas.py`; add factory/prompt routing in `src/scenarios/darkweb/dataset.py` and the compatibility modules `src/privacy_boundary_eval/dataset.py` / `prompts.py`. Update `runner.py` to select the task’s definitions, agent setup, and flow.
- **Web:** add the scenario option in `web/public/index.html`, allow its ID in `web/server.mjs`, and route `/api/scenario-definition` to its metadata. Update `web/public/scenario-definition.js` and `app.js` to load the selected task’s definition.
- **Task behavior:** connect any new tools, event adapters, and evaluation formulas where needed; add Korean translations to `src/privacy_boundary_eval/locales/ko.json`.

Creating a folder alone does not register a task. Keep the shared pipeline and visualization reusable, then run the tests above. See [the scenario guide](docs/scenarios.md) for the definition contract.

## Tests and contribution

```bash
python -m pytest -q
npm run check:web
npm run test:web
```

Tests use mocked services and do not require API keys. They cover both languages, tool prerequisites, provenance, blocking, consent rules, replay, storage operations, and narration. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Released under the [Apache License 2.0](LICENSE).
