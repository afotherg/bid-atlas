import assert from "node:assert/strict";
import test from "node:test";
import { getLlmConfig } from "../scripts/llm-config.mjs";

test("LLM settings configure model name, endpoint URL, and key", () => {
  assert.deepEqual(getLlmConfig({ LLM_API_KEY: "test-key", LLM_API_URL: "https://llm.example.test/responses", LLM_MODEL: "research-model" }), {
    apiKey: "test-key",
    apiUrl: "https://llm.example.test/responses",
    model: "research-model",
  });
});

test("legacy OpenAI settings remain supported", () => {
  assert.deepEqual(getLlmConfig({ OPENAI_API_KEY: "legacy-key", OPENAI_API_URL: "https://legacy.example.test/v1/responses", OPENAI_MODEL: "legacy-model" }), {
    apiKey: "legacy-key",
    apiUrl: "https://legacy.example.test/v1/responses",
    model: "legacy-model",
  });
});

test("LLM settings take precedence over legacy OpenAI settings", () => {
  assert.equal(getLlmConfig({ LLM_MODEL: "preferred", OPENAI_MODEL: "legacy" }).model, "preferred");
});
