import assert from "node:assert/strict";
import test from "node:test";
import {
  answerLocalReportQuestion,
  projectChatContext,
  reasoningEffortForChat,
  selectChatContextProfile,
  shouldRetryChatContext
} from "../chat-context.js";

const CONTEXT = {
  context_schema_version: "1.0",
  report_id: "120000000",
  study_design: {
    sample_count: 20,
    grouping_id: "condition",
    grouping_label: "Condition",
    groups: ["Air-1", "Air-5", "CO2-1", "CO2-5"].map((label) => ({ id: label, label, sample_count: 5 })),
    samples: Array.from({ length: 20 }, (_, index) => ({ id: `S${index + 1}`, group_id: "Air-1" }))
  },
  sections: {
    overview: { title: "Overall", summary: "Four groups", pipeline_methods: { quality_control: { filtering_tool: "fastp 1.1.0" } } },
    beta_diversity: {
      title: "Between-Sample Diversity",
      summary: { value: "Exploratory" },
      metrics: ["bray", "unweighted", "weighted"].map((id) => ({
        id,
        label: id === "bray" ? "Bray–Curtis" : `${id} UniFrac`,
        axes: { pc1_explained_percent: 23.4, pc2_explained_percent: 14.2 },
        points: Array.from({ length: 20 }, (_, index) => ({ sample_id: `S${index + 1}`, pc1: index, pc2: -index })),
        permanova: { pseudo_f: 1.256, r_squared: 0.1906, p_value: 0.097, permutations: 999 },
        permdisp: { f_statistic: 0.8, p_value: 0.5, permutations: 999 },
        pairwise_tests: [{ group_a: "Air-1", group_b: "CO2-1", adjusted_p_value: 0.2 }]
      })),
      charts: [{ id: "huge-chart" }],
      limitations: ["PCoA is descriptive."]
    }
  },
  sources: [
    { id: "metadata", label: "Sample metadata", section: "overview" },
    { id: "permanova", label: "PERMANOVA results", section: "beta_diversity" }
  ]
};

test("answers exact group and sample-count questions locally", () => {
  const groups = answerLocalReportQuestion("how many groups?", CONTEXT);
  assert.equal(groups.answer, "There are 4 groups: Air-1, Air-5, CO2-1, and CO2-5.");
  assert.deepEqual(groups.reportSourceIds, ["metadata"]);

  const samples = answerLocalReportQuestion("how many samples are there?", CONTEXT);
  assert.match(samples.answer, /^There are 20 samples in total/);
  assert.equal(answerLocalReportQuestion("How do the groups differ?", CONTEXT), null);
});

test("explicit intent wins and ambiguous follow-ups inherit the recent profile", () => {
  assert.equal(selectChatContextProfile("Explain PERMANOVA", [], { section: "overview" }), "beta_statistics");
  assert.equal(selectChatContextProfile("How is that calculated?", [
    { role: "user", text: "What did we use PERMANOVA for?" },
    { role: "assistant", text: "PERMANOVA tested group composition." }
  ], { section: "overview" }), "beta_statistics");
  assert.equal(selectChatContextProfile("What is fastp?", [], { section: "beta_diversity" }), "methods");
  assert.equal(selectChatContextProfile("quality control", [], { section: "beta_diversity" }), "methods");
});

test("PERMANOVA profile excludes ordination points and pairwise tests unless requested", () => {
  const focused = projectChatContext(CONTEXT, "beta_statistics", { message: "Explain PERMANOVA" });
  const metric = focused.sections.beta_diversity.metrics[0];
  assert.deepEqual(metric.permanova, CONTEXT.sections.beta_diversity.metrics[0].permanova);
  assert.equal(metric.points, undefined);
  assert.equal(metric.axes, undefined);
  assert.equal(metric.pairwise_tests, undefined);
  assert.deepEqual(focused.sources.map((source) => source.id), ["permanova"]);
  assert.ok(Buffer.byteLength(JSON.stringify(focused)) < 2_500);
  assert.ok(Buffer.byteLength(JSON.stringify(focused)) < Buffer.byteLength(JSON.stringify(CONTEXT)) * 0.3);

  const expanded = projectChatContext(CONTEXT, "beta_statistics", { message: "Which groups pairwise?", expanded: true });
  assert.equal(expanded.sections.beta_diversity.metrics[0].pairwise_tests.length, 1);
});

test("allows at most one controlled context retry", () => {
  assert.equal(shouldRetryChatContext("report", { contextSufficient: false }, false), true);
  assert.equal(shouldRetryChatContext("report", { contextSufficient: false }, true), false);
  assert.equal(shouldRetryChatContext("web", { contextSufficient: false }, false), false);
});

test("uses no reasoning for simple local profiles and low reasoning for interpretation", () => {
  assert.equal(reasoningEffortForChat("methods", "report", "low"), "none");
  assert.equal(reasoningEffortForChat("beta_statistics", "report", "low"), "low");
  assert.equal(reasoningEffortForChat("methods", "mixed", "low"), "low");
});
