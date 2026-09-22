# jev-mcp

An **MCP server** that gives any agent (Claude Code, Codex, Cursor, Pi, …) fast, **typed,
calibrated decisions** from **Jev**, TypeSafe AI's *System One* model — classify, score,
check yes/no, and gate risky tool calls, all as one API call under the hood.

> 🧪 **Try Jev free in your browser (no waitlist):** **[jevtypesafeai.com](https://jevtypesafeai.com)**
> Independent playground & guide. Not affiliated with TypeSafe AI.

Jev doesn't write text — it reads your state and returns a **choice**, a **score**, or a
**probability** in 70–500 ms, for ~$0.0004 a decision. That makes it a great "fuzzy `if`"
inside the agent loop: routing, guardrails, scoring, filtering. `jev-mcp` exposes that as
plain MCP tools your agent can call.

## Tools

| Tool | What it does |
|------|--------------|
| `jev_classify` | Pick one of labelled options (routing, categorization, intent) |
| `jev_score` | Rate the input on an ordered scale you define (risk, urgency, quality) |
| `jev_check` | Calibrated yes/no probability (gates, filters, guardrails) |
| `jev_gate` | Risk-screen an action before it runs → `allow` / `confirm` / `block` |
| `jev_decide` | Full power: many typed questions in one round trip |

## Install

You need a Jev API key. Two ways to get one:

- **Hosted (instant, no waitlist):** buy prepaid credit at [jevtypesafeai.com/pricing](https://jevtypesafeai.com/pricing) and you get a `jv_live_…` key. **No `JEV_BASE_URL` needed** — the server detects a `jv_live_` key and routes it to the hosted gateway automatically.
- **Official TypeSafe:** get a key at [console.typesafe.ai](https://console.typesafe.ai). It's used against `api.typesafe.ai` by default.

> ⚠️ A hosted `jv_live_…` key is **only** valid at the jevtypesafeai.com gateway, not at `api.typesafe.ai`. Older versions of this server defaulted every key to the official endpoint, so a hosted key returned `401 authentication_error`. That's now automatic — just set your key.

Runs straight from GitHub with `npx` — no clone, no build.

### Claude Code

```bash
claude mcp add jev -e TYPESAFE_API_KEY=your_key -- npx -y github:codaaiteam/jev-mcp
```

### Any MCP client (`.mcp.json` / config)

```json
{
  "mcpServers": {
    "jev": {
      "command": "npx",
      "args": ["-y", "github:codaaiteam/jev-mcp"],
      "env": { "TYPESAFE_API_KEY": "your_key" }
    }
  }
}
```

That's it — your agent now has `jev_classify`, `jev_score`, `jev_check`, `jev_gate`, `jev_decide`. Works with a hosted `jv_live_…` key or an official TypeSafe key; the endpoint is chosen for you.

> Once this is on npm you can shorten `github:codaaiteam/jev-mcp` to just `jev-mcp`.

## Configuration

| Env | Default | Notes |
|-----|---------|-------|
| `TYPESAFE_API_KEY` | — | Your Jev key (aliases: `JEV_API_KEY`, `JEV_KEY`). Required. |
| `JEV_BASE_URL` | auto | Chosen from your key: a hosted `jv_live_…` key → `https://jevtypesafeai.com/api/v1/decide`; anything else → `https://api.typesafe.ai/v1/systemone`. Set it explicitly to route through your own gateway (Vercel AI Gateway, OpenRouter, Cloudflare). |
| `JEV_MODEL` | `jev-latest` | Pin a version (e.g. `jev-1.13.0`) in production. |

## Examples

**Guardrail a shell command before running it:**

```
jev_gate({
  action: "rm -rf ./dist && aws s3 sync ./build s3://prod-assets --delete",
  context: "agent is deploying a frontend build"
})
→ { "recommendation": "confirm", "risk_score": 2.8, "touches_prod": true, ... }
```

**Route a request to the right model:**

```
jev_classify({
  state: "Refactor auth to multi-tenant SSO with SAML + SCIM, keep back-compat.",
  instructions: "Which model tier should handle this?",
  options: { fast: "trivial edits", balanced: "normal work", strong: "hard architecture" }
})
→ { "choice": "strong", "confidence": 0.99, "probabilities": { ... } }
```

**Check before auto-approving user content:**

```
jev_check({ state: "<user comment>", instructions: "Is this safe to auto-publish?" })
→ { "probability": 0.12, "likely": false }
```

## How it works

Every tool is a thin wrapper over one Jev call — `state + typed questions → typed answers`.
The value is in *where* you call it (the agent-loop hook) and *what* you ask. Because the
answer type is fixed by the request, Jev can't hallucinate a format or emit an invalid type.

## Links

- ▶️ Free playground & guide: https://jevtypesafeai.com
- 📖 What is Jev: https://jevtypesafeai.com/what-is-jev
- 🔌 API guide: https://jevtypesafeai.com/how-to-use
- 🌐 Ecosystem & gateways: https://jevtypesafeai.com/ecosystem
- 🏢 Official: https://typesafe.ai · Docs: https://docs.typesafe.ai
- 📚 More projects: [awesome-jev](https://github.com/yibie/awesome-jev)

## License

MIT. "Jev", "System One" and "TypeSafe AI" belong to their respective owners.
