const defaultApiUrl = "https://api.x.ai/v1/responses";
const defaultModel = "grok-4.5";

export function getLlmConfig(environment = process.env) {
  const apiKey = environment.XAI_KEY || environment.XAI_API_KEY || environment.LLM_API_KEY || environment.OPENAI_API_KEY || "";
  const configuredUrl = environment.LLM_API_URL || environment.OPENAI_API_URL || defaultApiUrl;
  const model = environment.LLM_MODEL || environment.OPENAI_MODEL || defaultModel;
  const maxTokens = Math.max(500, Math.min(16_000, Number(environment.LLM_MAX_TOKENS || 4000)));
  const timeoutMs = Math.max(30_000, Math.min(600_000, Number(environment.LLM_TIMEOUT_MS || 300_000)));
  const reasoningEffort = environment.LLM_REASONING_EFFORT || "";

  let parsedUrl;
  try {
    parsedUrl = new URL(configuredUrl.replace(/^=+/, ""));
  } catch {
    throw new Error(`LLM_API_URL must be an absolute URL; received ${configuredUrl}`);
  }
  if (!new Set(["http:", "https:"]).has(parsedUrl.protocol)) throw new Error("LLM_API_URL must use HTTP or HTTPS.");

  const trimmedPath = parsedUrl.pathname.replace(/\/+$/, "");
  const apiStyle = trimmedPath.endsWith("/responses") ? "responses" : "chat_completions";
  if (apiStyle === "chat_completions" && !trimmedPath.endsWith("/chat/completions")) parsedUrl.pathname = `${trimmedPath}/chat/completions`;

  return { apiKey, apiUrl: parsedUrl.toString(), apiStyle, maxTokens, model, reasoningEffort, timeoutMs };
}
