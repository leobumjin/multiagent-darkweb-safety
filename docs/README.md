# Project page and static simulation

From the repository root:

```bash
bash shells/serve.sh
```

Open http://127.0.0.1:4173. Node.js 20+ and npm are required; no package installation, Python, API keys, or build step is needed. `npm run docs:serve` starts the same server. Use `PORT=4174 bash shells/serve.sh` to change the port.

The project introduction follows the repository README: title, badges, logo, overview, and quick start. Below it, the simulation starts automatically when it enters the viewport and loops until paused.

The left panel shows the active agent and message route; the right panel replays a fictional recruitment conversation. Play/pause, next step, reset, speed, and the timeline work entirely in the browser. On small screens the panels stack vertically.

Edit `examples/recruitment.json` to change the example agents and messages. The graph and panel styles are reused from `web/public/`. The static copies live in `modules/` and `original.css`; `modules/scenario-definition.js` loads local `examples/definition.json` instead of a server API. Messages use the original participant IDs. Playback begins from the first message; Reset pauses and returns to the start. Audio is omitted.

## GitHub Pages

In the repository's **Settings → Pages**, select **Deploy from a branch**, choose the branch containing these files, and choose **/docs**. Save. The page will be available at `https://<owner>.github.io/<repository>/` after GitHub finishes deployment.

All assets use relative URLs, including the example JSON, so repository subpaths work. Only the contents of `docs/` are published. This demo replays scripted data and does not run models or send outreach.

Monitoring is embedded below the simulation on the project page. It contains 100 fictional time steps, invented anxiety values, and synchronized redacted conversations. No page navigation is required.
