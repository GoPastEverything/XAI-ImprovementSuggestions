const CHAT_URL = "https://api.x.ai/v1/chat/completions";
const RESPONSES_URL = "https://api.x.ai/v1/responses";

export type GrokChatResult = {
  content: string;
  model: string;
  liveSearch: boolean;
};

function resolveModel(env: NodeJS.ProcessEnv, override?: string): string {
  return (
    override?.trim() ||
    env.XAI_LIVE_SESSIONS_MODEL?.trim() ||
    env.XAI_MODEL?.trim() ||
    "grok-4.3"
  );
}

/** Pull final assistant text from xAI Responses API payload. */
export function extractResponsesOutputText(body: Record<string, unknown>): string {
  const parts: string[] = [];
  const output = body.output;
  if (!Array.isArray(output)) return "";

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const rec = item as { content?: unknown; type?: string };
    const content = rec.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (!c || typeof c !== "object") continue;
      const block = c as { type?: string; text?: string; annotations?: unknown };
      if (block.type === "output_text" && typeof block.text === "string") {
        parts.push(block.text);
      }
    }
  }
  return parts.join("\n\n").trim();
}

/** xAI Agent Tools API (x_search) — replaces deprecated search_parameters live search (HTTP 410). */
async function runGrokResponsesWithXSearch(
  env: NodeJS.ProcessEnv,
  opts: {
    userPrompt: string;
    systemPrompt?: string;
    model?: string;
    temperature?: number;
  }
): Promise<GrokChatResult> {
  const key = env.XAI_API_KEY?.trim();
  if (!key) throw new Error("Missing XAI_API_KEY in server environment");

  const model = resolveModel(env, opts.model);
  const input: { role: string; content: string }[] = [];
  if (opts.systemPrompt?.trim()) {
    input.push({ role: "system", content: opts.systemPrompt.trim() });
  }
  input.push({ role: "user", content: opts.userPrompt });

  const body = {
    model,
    input,
    tools: [{ type: "x_search" as const }, { type: "web_search" as const }],
    temperature: opts.temperature ?? 0.2
  };

  const res = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000)
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(text.slice(0, 600) || `xAI Responses HTTP ${res.status}`);
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("xAI Responses returned invalid JSON");
  }

  const content = extractResponsesOutputText(json);
  if (!content) {
    throw new Error("xAI Responses returned no output_text (tool run may have failed)");
  }

  return { content, model, liveSearch: true };
}

/** Legacy chat completions (no live X search — deprecated search_parameters returns 410). */
async function runGrokChatCompletions(
  env: NodeJS.ProcessEnv,
  opts: {
    userPrompt: string;
    systemPrompt?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<GrokChatResult> {
  const key = env.XAI_API_KEY?.trim();
  if (!key) throw new Error("Missing XAI_API_KEY in server environment");

  const model = resolveModel(env, opts.model);
  const body = {
    model,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 8192,
    messages: [
      {
        role: "system" as const,
        content:
          opts.systemPrompt ??
          "You are a precise research assistant. Return real https://x.com URLs only."
      },
      { role: "user" as const, content: opts.userPrompt }
    ]
  };

  const res = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000)
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(text.slice(0, 500) || `HTTP ${res.status}`);
  }

  const json = JSON.parse(text) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("Empty completion from xAI");
  }
  return { content, model, liveSearch: false };
}

/**
 * Grok with real-time X discovery via Responses API + x_search (Heavy-equivalent).
 * Falls back to chat completions only when liveSearch is explicitly false.
 */
export async function runGrokChatWithLiveSearch(
  env: NodeJS.ProcessEnv,
  opts: {
    userPrompt: string;
    systemPrompt?: string;
    model?: string;
    liveSearch?: boolean;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<GrokChatResult> {
  const wantLive =
    opts.liveSearch ??
    (env.XAI_LIVE_SEARCH === "1" || env.XAI_LIVE_SEARCH === "true");

  if (wantLive) {
    try {
      return await runGrokResponsesWithXSearch(env, opts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[ifixedx] x_search Responses failed, trying chat fallback:", msg.slice(0, 200));
    }
  }

  return runGrokChatCompletions(env, opts);
}
