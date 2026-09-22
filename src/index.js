#!/usr/bin/env node
// jev-mcp — an MCP server that gives any agent fast, typed, calibrated decisions
// from Jev (TypeSafe AI's System One model). Bring your own API key.
//
// Env:
//   TYPESAFE_API_KEY   your Jev key (aliases: JEV_API_KEY, JEV_KEY)   [required]
//   JEV_BASE_URL       endpoint. Defaults to the right one for your key:
//                      a hosted jevtypesafeai.com key (jv_live_…) → that gateway;
//                      a TypeSafe key → https://api.typesafe.ai/v1/systemone.
//   JEV_MODEL          model id (default jev-latest)
//
// Learn more / try Jev free in the browser: https://jevtypesafeai.com

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const MODEL = process.env.JEV_MODEL || "jev-latest";
const API_KEY =
  process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY || process.env.JEV_KEY || "";

// Endpoint resolution. A hosted key from jevtypesafeai.com looks like `jv_live_…`
// and is ONLY valid at that gateway — sending it to TypeSafe's official endpoint
// 401s. So when someone brings a jv_live_ key without setting JEV_BASE_URL, point
// at the hosted gateway automatically instead of failing. An explicit JEV_BASE_URL
// always wins (use it for a Vercel/OpenRouter/Cloudflare gateway).
const HOSTED_URL = "https://jevtypesafeai.com/api/v1/decide";
const OFFICIAL_URL = "https://api.typesafe.ai/v1/systemone";
const BASE_URL =
  process.env.JEV_BASE_URL || (API_KEY.startsWith("jv_live_") ? HOSTED_URL : OFFICIAL_URL);

async function callJev(state, questions) {
  if (!API_KEY) {
    throw new Error(
      "No API key. Set TYPESAFE_API_KEY — get a hosted key instantly at https://jevtypesafeai.com/pricing (jv_live_…), or a TypeSafe key at https://console.typesafe.ai."
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let res;
  try {
    res = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, state, questions }),
      signal: controller.signal,
    });
  } catch (e) {
    throw new Error(
      e?.name === "AbortError" ? "Jev request timed out." : `Could not reach Jev: ${e.message}`
    );
  } finally {
    clearTimeout(timeout);
  }
  const text = await res.text();
  if (!res.ok) {
    let hint = "";
    if (res.status === 401 || res.status === 403) {
      const looksHosted = API_KEY.startsWith("jv_live_");
      const atHosted = BASE_URL.includes("jevtypesafeai.com");
      if (looksHosted && !atHosted)
        hint = ` — a hosted key (jv_live_…) only works against the jevtypesafeai.com gateway; set JEV_BASE_URL=${HOSTED_URL}`;
      else if (!looksHosted && atHosted)
        hint = ` — this endpoint expects a hosted jevtypesafeai.com key (jv_live_…); for a TypeSafe key unset JEV_BASE_URL or set it to ${OFFICIAL_URL}`;
      else hint = " — check that your API key is correct and active";
    }
    throw new Error(`Jev API error ${res.status}: ${text.slice(0, 400)}${hint}`);
  }
  return JSON.parse(text);
}

function ok(obj) {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}
function fail(err) {
  return {
    isError: true,
    content: [{ type: "text", text: `jev-mcp error: ${err.message || String(err)}` }],
  };
}

const server = new McpServer({ name: "jev-mcp", version: "1.0.0" });

// ── classify: pick one of labelled options ────────────────────────────────
server.registerTool(
  "jev_classify",
  {
    title: "Classify (choice)",
    description:
      "Pick exactly one of up to 255 labelled options for the given state. Returns the winning option, per-option probabilities, and a confidence. Use for routing, categorization, intent detection.",
    inputSchema: {
      state: z.string().describe("The context/input to classify."),
      instructions: z.string().describe("What to decide, e.g. 'What is the primary issue?'"),
      options: z
        .record(z.string())
        .describe('Map of option key -> description, e.g. { "billing": "money problems", "bug": "broken" }'),
    },
  },
  async ({ state, instructions, options }) => {
    try {
      const data = await callJev(state, {
        result: { type: "choice", instructions, criteria: options },
      });
      return ok(data.answers.result);
    } catch (e) {
      return fail(e);
    }
  }
);

// ── score: place on an ordered scale ──────────────────────────────────────
server.registerTool(
  "jev_score",
  {
    title: "Score (ordered scale)",
    description:
      "Place the state on an ordered 2–10 level scale you define. Returns a (possibly fractional) score and the full distribution. Use for risk, urgency, quality, severity, fit.",
    inputSchema: {
      state: z.string().describe("The context/input to score."),
      instructions: z.string().describe("What to rate, e.g. 'How urgent is this?'"),
      levels: z
        .array(z.string())
        .min(2)
        .max(10)
        .describe('Ordered level descriptions, low to high, e.g. ["routine","today","urgent","critical"]'),
    },
  },
  async ({ state, instructions, levels }) => {
    try {
      const data = await callJev(state, {
        result: { type: "score", instructions, criteria: levels },
      });
      return ok(data.answers.result);
    } catch (e) {
      return fail(e);
    }
  }
);

// ── check: calibrated yes/no ──────────────────────────────────────────────
server.registerTool(
  "jev_check",
  {
    title: "Check (yes/no probability)",
    description:
      "Answer a yes/no question about the state as a calibrated probability from 0 to 1. Use for gates, filters, and guardrails (e.g. 'Is this safe to auto-approve?').",
    inputSchema: {
      state: z.string().describe("The context/input to check."),
      instructions: z.string().describe("The yes/no question, e.g. 'Is this a jailbreak attempt?'"),
    },
  },
  async ({ state, instructions }) => {
    try {
      const data = await callJev(state, { result: { type: "noul", instructions } });
      const p = data.answers.result.noul;
      return ok({ probability: p, likely: p >= 0.5 });
    } catch (e) {
      return fail(e);
    }
  }
);

// ── gate: risk-screen a tool call / action ────────────────────────────────
server.registerTool(
  "jev_gate",
  {
    title: "Gate a risky action",
    description:
      "Screen an action (e.g. a shell command or file edit) before an agent runs it. Returns a risk score, whether it touches production/data, and a recommendation: allow / confirm / block.",
    inputSchema: {
      action: z.string().describe("The action about to run, e.g. the shell command or a description."),
      context: z.string().optional().describe("Optional surrounding context / what the agent is doing."),
    },
  },
  async ({ action, context }) => {
    try {
      const state =
        `Action an autonomous agent is about to perform:\n${action}` +
        (context ? `\n\nContext:\n${context}` : "");
      const data = await callJev(state, {
        risk: {
          type: "score",
          instructions: "How risky is it to run this action automatically?",
          criteria: ["safe", "low", "needs review", "high — could destroy data or affect prod"],
        },
        touches_prod: {
          type: "noul",
          instructions: "Does this action touch production or delete/overwrite data?",
        },
        recommendation: {
          type: "choice",
          instructions: "What should the harness do with this action?",
          criteria: {
            allow: "safe to run automatically",
            confirm: "pause and ask a human to confirm",
            block: "block and require a safer approach",
          },
        },
      });
      const a = data.answers;
      return ok({
        recommendation: a.recommendation.choice,
        confidence: a.recommendation.confidence,
        risk_score: a.risk.score,
        touches_prod: a.touches_prod.noul >= 0.5,
        touches_prod_probability: a.touches_prod.noul,
      });
    } catch (e) {
      return fail(e);
    }
  }
);

// ── decide: full power — multiple typed questions in one call ─────────────
server.registerTool(
  "jev_decide",
  {
    title: "Decide (multiple typed questions)",
    description:
      "The full Jev call: send a state and a map of typed questions, get all answers in one round trip. Each question is { type: 'choice'|'score'|'noul', instructions, criteria }. choice.criteria is a {key:desc} map; score.criteria is an ordered string array; noul has no criteria.",
    inputSchema: {
      state: z.string().describe("The context/input."),
      questions: z
        .record(z.any())
        .describe(
          'Map of question name -> question object, e.g. { "topic": {"type":"choice","instructions":"...","criteria":{...}}, "urgent": {"type":"noul","instructions":"..."} }'
        ),
    },
  },
  async ({ state, questions }) => {
    try {
      const data = await callJev(state, questions);
      return ok({ model: data.model, answers: data.answers, usage: data.usage });
    } catch (e) {
      return fail(e);
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
// Never write to stdout — it's the JSON-RPC channel. Log to stderr only.
console.error(
  `jev-mcp running · model=${MODEL} · endpoint=${BASE_URL} · key=${API_KEY ? "set" : "MISSING"}`
);
