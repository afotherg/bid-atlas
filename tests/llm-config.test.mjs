import assert from "node:assert/strict";
import test from "node:test";
import { getLlmConfig } from "../scripts/llm-config.mjs";

test("LLM settings configure model name, endpoint URL, and key", () => {
  assert.deepEqual(getLlmConfig({ LLM_API_KEY: "test-key", LLM_API_URL: "https://llm.example.test/responses", LLM_MODEL: "research-model" }), {
    apiKey: "test-key",
    apiUrl: "https://llm.example.test/responses",
    apiStyle: "responses",
    maxTokens: 4000,
    model: "research-model",
    reasoningEffort: "",
    timeoutMs: 300000,
  });
});

test("xAI key and Grok defaults configure native web research", () => {
  assert.deepEqual(getLlmConfig({ XAI_KEY: "xai-test-key" }), {
    apiKey: "xai-test-key",
    apiUrl: "https://api.x.ai/v1/responses",
    apiStyle: "responses",
    maxTokens: 4000,
    model: "grok-4.5",
    reasoningEffort: "",
    timeoutMs: 300000,
  });
});

test("XAI_KEY takes precedence over fallback keys", () => {
  assert.equal(getLlmConfig({ XAI_KEY: "preferred", LLM_API_KEY: "fallback", OPENAI_API_KEY: "legacy" }).apiKey, "preferred");
});

test("legacy OpenAI settings remain supported", () => {
  assert.deepEqual(getLlmConfig({ OPENAI_API_KEY: "legacy-key", OPENAI_API_URL: "https://legacy.example.test/v1/responses", OPENAI_MODEL: "legacy-model" }), {
    apiKey: "legacy-key",
    apiUrl: "https://legacy.example.test/v1/responses",
    apiStyle: "responses",
    maxTokens: 4000,
    model: "legacy-model",
    reasoningEffort: "",
    timeoutMs: 300000,
  });
});

test("LLM settings take precedence over legacy OpenAI settings", () => {
  assert.equal(getLlmConfig({ LLM_MODEL: "preferred", OPENAI_MODEL: "legacy" }).model, "preferred");
});

test("a chat-completions base URL is normalized and tolerates an accidental leading equals sign", () => {
  assert.deepEqual(getLlmConfig({ LLM_API_URL: "=https://integrate.api.nvidia.com/v1", LLM_MODEL: "nvidia/model" }), {
    apiKey: "",
    apiUrl: "https://integrate.api.nvidia.com/v1/chat/completions",
    apiStyle: "chat_completions",
    maxTokens: 4000,
    model: "nvidia/model",
    reasoningEffort: "",
    timeoutMs: 300000,
  });
});

test("LLM runtime controls are configurable and bounded", () => {
  const config = getLlmConfig({ LLM_MAX_TOKENS: "2500", LLM_TIMEOUT_MS: "180000", LLM_REASONING_EFFORT: "none" });
  assert.equal(config.maxTokens, 2500);
  assert.equal(config.timeoutMs, 180000);
  assert.equal(config.reasoningEffort, "none");
});
