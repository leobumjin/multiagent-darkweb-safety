# Contributing

Use Python 3.11+, Node.js 20+, and Bash. Follow the README setup and run all Python/web checks before submitting a change.

Keep executable source, comments, documentation, UI labels, buttons, and metric identifiers in English. Store Korean content translations in `src/privacy_boundary_eval/locales/ko.json`. Support both `en` and `ko` without changing source IDs, tool enums, permissions, or evaluator rules. Test semantic behavior and both-language parity when changing simulation logic.

Preserve the distinction between mentions, attempted tools, successful access, evidence-linked use, and approval. Label scripted behavior and injected interventions explicitly. Retain original model responses and traceable sources when adding interventions.

Never commit API keys, `.env`, private documents, generated run logs, or audio. Tests should use synthetic fixtures and mocked external services. Keep raw outputs in ignored `results/` or `arxived_results/` directories. Run the web server locally; it has no account authentication and is intended as a local research tool.

For a pull request, explain the behavior change and the checks you ran. The repository uses Apache License 2.0.
