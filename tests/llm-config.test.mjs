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

test("LLM key and Grok defaults configure native web research", () => {
  assert.deepEqual(getLlmConfig({ LLM_API_KEY: "llm-test-key" }), {
    apiKey: "llm-test-key",
    apiUrl: "https://api.x.ai/v1/responses",
    apiStyle: "responses",
    maxTokens: 4000,
    model: "grok-4.5",
    reasoningEffort: "",
    timeoutMs: 300000,
  });
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
