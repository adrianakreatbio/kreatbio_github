const DEFAULT_MODEL = "gpt-5.6-luna";

export function buildOpenAIResponseBody(chatPrompt, options = {}) {
  const useWebSearch = Boolean(options.useWebSearch);
  const body = {
    model: String(options.model || DEFAULT_MODEL),
    instructions: String(chatPrompt?.systemInstruction || ""),
    input: String(chatPrompt?.prompt || ""),
    max_output_tokens: Math.max(1, Number(options.maxOutputTokens) || 1_000),
    reasoning: { effort: String(options.reasoningEffort || "low") },
    store: false,
    text: useWebSearch
      ? { format: { type: "text" }, verbosity: "low" }
      : {
          format: {
            type: "json_schema",
            name: "report_answer",
            strict: true,
            schema: {
              type: "object",
              properties: {
                answer: { type: "string" },
                report_source_ids: {
                  type: "array",
                  items: { type: "string" },
                  maxItems: 8
                },
                context_sufficient: { type: "boolean" }
              },
              required: ["answer", "report_source_ids", "context_sufficient"],
              additionalProperties: false
            }
          },
          verbosity: "low"
        }
  };

  const safetyIdentifier = String(options.safetyIdentifier || "").trim();
  if (safetyIdentifier) body.safety_identifier = safetyIdentifier.slice(0, 64);
  const promptCacheKey = String(options.promptCacheKey || "").trim();
  if (promptCacheKey) body.prompt_cache_key = promptCacheKey.slice(0, 64);
  if (useWebSearch) {
    body.tools = [{ type: "web_search", search_context_size: "low" }];
    body.include = ["web_search_call.action.sources"];
  }
  return body;
}

export function buildOpenAIInputTokenBody(chatPrompt, options = {}) {
  const responseBody = buildOpenAIResponseBody(chatPrompt, options);
  const body = {
    model: responseBody.model,
    instructions: responseBody.instructions,
    input: responseBody.input
  };
  if (responseBody.tools) body.tools = responseBody.tools;
  return body;
}

export function parseOpenAIChatResponse(data, options = {}) {
  const outputParts = openAIOutputTextParts(data);
  const rawText = outputParts.map((part) => part.text).join("\n").trim();
  const parsed = options.useWebSearch
    ? { answer: rawText || "No response was returned.", reportSourceIds: [] }
    : parseReportPayload(rawText);
  const usage = parseUsage(data?.usage);
  return {
    ...parsed,
    webSources: extractOpenAIWebSources(data, outputParts),
    webSearchUsed: (Array.isArray(data?.output) ? data.output : []).some((item) => item?.type === "web_search_call"),
    usage,
    totalTokenCount: usage.totalTokens
  };
}

function openAIOutputTextParts(data) {
  const parts = [];
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    if (item?.type !== "message") continue;
    for (const content of Array.isArray(item.content) ? item.content : []) {
      if (content?.type !== "output_text") continue;
      parts.push({
        text: String(content.text || ""),
        annotations: Array.isArray(content.annotations) ? content.annotations : []
      });
    }
  }
  if (!parts.length && typeof data?.output_text === "string") {
    parts.push({ text: data.output_text, annotations: [] });
  }
  return parts;
}

function parseReportPayload(text) {
  const raw = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(raw);
    return {
      answer: String(parsed.answer || "").trim() || "No response was returned.",
      reportSourceIds: Array.isArray(parsed.report_source_ids)
        ? parsed.report_source_ids.map(String).slice(0, 8)
        : [],
      contextSufficient: parsed.context_sufficient !== false
    };
  } catch {
    return { answer: raw || "No response was returned.", reportSourceIds: [], contextSufficient: true };
  }
}

function parseUsage(usage) {
  return {
    inputTokens: usageInteger(usage?.input_tokens),
    cachedTokens: usageInteger(usage?.input_tokens_details?.cached_tokens),
    cacheWriteTokens: usageInteger(usage?.cache_write_tokens),
    outputTokens: usageInteger(usage?.output_tokens),
    reasoningTokens: usageInteger(usage?.output_tokens_details?.reasoning_tokens),
    totalTokens: usageInteger(usage?.total_tokens, null)
  };
}

function usageInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

function extractOpenAIWebSources(data, outputParts) {
  const sources = [];
  const addSource = (candidate) => {
    const citation = candidate?.url_citation || candidate;
    const url = String(citation?.url || "").trim();
    if (!/^https?:\/\//i.test(url) || sources.some((source) => source.url === url)) return;
    sources.push({
      title: String(citation?.title || "Web source").trim().slice(0, 180) || "Web source",
      url
    });
  };

  for (const part of outputParts) {
    for (const annotation of part.annotations) {
      if (annotation?.type === "url_citation" || annotation?.url_citation) addSource(annotation);
    }
  }
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    if (item?.type !== "web_search_call") continue;
    for (const source of Array.isArray(item?.action?.sources) ? item.action.sources : []) addSource(source);
  }
  return sources.slice(0, 8);
}
