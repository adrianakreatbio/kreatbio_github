import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOpenAIInputTokenBody,
  buildOpenAIResponseBody,
  parseOpenAIChatResponse
} from "../openai-chat.js";

const PROMPT = {
  systemInstruction: "Use report evidence only.",
  prompt: "REPORT_CONTEXT: {}\n\nCLIENT_QUESTION: What was used?"
};

test("builds a private structured-output request for report questions", () => {
  const body = buildOpenAIResponseBody(PROMPT, {
    model: "gpt-5.6-luna",
    maxOutputTokens: 700,
    reasoningEffort: "low",
    safetyIdentifier: "report-hmac",
    promptCacheKey: "stable-report-key"
  });

  assert.equal(body.model, "gpt-5.6-luna");
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 700);
  assert.deepEqual(body.reasoning, { effort: "low" });
  assert.equal(body.safety_identifier, "report-hmac");
  assert.equal(body.prompt_cache_key, "stable-report-key");
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.tools, undefined);
});

test("enables OpenAI web search only for web-enabled questions", () => {
  const responseBody = buildOpenAIResponseBody(PROMPT, { useWebSearch: true });
  const tokenBody = buildOpenAIInputTokenBody(PROMPT, { useWebSearch: true });

  assert.deepEqual(responseBody.tools, [{ type: "web_search", search_context_size: "low" }]);
  assert.deepEqual(responseBody.include, ["web_search_call.action.sources"]);
  assert.equal(responseBody.text.format.type, "text");
  assert.deepEqual(tokenBody.tools, responseBody.tools);
  assert.equal(tokenBody.max_output_tokens, undefined);
  assert.equal(tokenBody.text, undefined);
});

test("parses report JSON and actual OpenAI token usage", () => {
  const result = parseOpenAIChatResponse({
    output: [{
      type: "message",
      content: [{
        type: "output_text",
        text: JSON.stringify({ answer: "fastp was used.", report_source_ids: ["methods", "versions"], context_sufficient: true }),
        annotations: []
      }]
    }],
    usage: {
      input_tokens: 300,
      input_tokens_details: { cached_tokens: 200 },
      cache_write_tokens: 20,
      output_tokens: 132,
      output_tokens_details: { reasoning_tokens: 40 },
      total_tokens: 432
    }
  });

  assert.equal(result.answer, "fastp was used.");
  assert.deepEqual(result.reportSourceIds, ["methods", "versions"]);
  assert.equal(result.totalTokenCount, 432);
  assert.equal(result.contextSufficient, true);
  assert.equal(result.webSearchUsed, false);
  assert.deepEqual(result.usage, {
    inputTokens: 300,
    cachedTokens: 200,
    cacheWriteTokens: 20,
    outputTokens: 132,
    reasoningTokens: 40,
    totalTokens: 432
  });
  assert.deepEqual(result.webSources, []);
});

test("extracts and deduplicates OpenAI web citations", () => {
  const result = parseOpenAIChatResponse({
    output: [
      {
        type: "web_search_call",
        action: {
          sources: [
            { title: "fastp documentation", url: "https://example.org/fastp" },
            { title: "Invalid", url: "javascript:alert(1)" }
          ]
        }
      },
      {
        type: "message",
        content: [{
          type: "output_text",
          text: "fastp performs read preprocessing.",
          annotations: [
            { type: "url_citation", title: "fastp documentation", url: "https://example.org/fastp" },
            { type: "url_citation", title: "fastp paper", url: "https://example.org/paper" }
          ]
        }]
      }
    ],
    usage: { total_tokens: 250 }
  }, { useWebSearch: true });

  assert.equal(result.answer, "fastp performs read preprocessing.");
  assert.equal(result.webSearchUsed, true);
  assert.deepEqual(result.webSources, [
    { title: "fastp documentation", url: "https://example.org/fastp" },
    { title: "fastp paper", url: "https://example.org/paper" }
  ]);
});
