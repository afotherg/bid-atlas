const defaultApiUrl = "https://api.openai.com/v1/responses";
const defaultModel = "gpt-5-mini";

export function getLlmConfig(environment = process.env) {
  const apiKey = environment.LLM_API_KEY || environment.OPENAI_API_KEY || "";
  const apiUrl = environment.LLM_API_URL || environment.OPENAI_API_URL || defaultApiUrl;
  const model = environment.LLM_MODEL || environment.OPENAI_MODEL || defaultModel;

  let parsedUrl;
  try {
    parsedUrl = new URL(apiUrl);
  } catch {
    throw new Error(`LLM_API_URL must be an absolute URL; received ${apiUrl}`);
  }
  if (!new Set(["http:", "https:"]).has(parsedUrl.protocol)) throw new Error("LLM_API_URL must use HTTP or HTTPS.");

  return { apiKey, apiUrl: parsedUrl.toString(), model };
}
