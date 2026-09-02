import assert from "node:assert/strict";
import test from "node:test";
import {
  answerLocalReportQuestion,
  projectChatContext,
  reasoningEffortForChat,
  selectChatAnswerScope,
  selectChatContextProfile,
  selectChatHistory,
  selectChatTopic,
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
    overview: {
      title: "Overall",
      summary: "Four groups",
      pipeline_methods: {
        assay: "Illumina 16S V3-V4 marker-gene profiling.",
        sequencing_input: { read_type: "Illumina paired-end short reads", raw_reads: "Illumina paired-end FASTQ reads" },
        primer_trimming: { tool: "Cutadapt 5.1", primers: "341F / 785R" },
        quality_control: {
          filtering_tool: "fastp 1.1.0",
          filtering_description: "Primer sequences were removed and paired reads were quality-filtered.",
          filtering_settings: "fastp 1.1.0 used quality threshold 20 and maximum unqualified bases 30%. DADA2 used forward/reverse truncation lengths 240/220 bp and maximum expected errors 2.0/2.0.",
          qc_tools: "FastQC v0.12.1 and MultiQC profiled read/run-level QC outputs.",
          purpose: "QC checked read quality and pairing."
        },
        feature_inference: {
          input: "Quality-filtered paired reads",
          output: "ASV feature table",
          tools_and_method: "QIIME 2 DADA2 paired-end processing retained ASVs at least 350 bp long.",
          description: "DADA2 denoised paired reads, removed chimeras, and produced an ASV feature table."
        },
        taxonomy: { tools_and_databases: "SILVA 138.2" },
        statistical_analysis: "Alpha and beta diversity were calculated."
      }
    },
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
    { id: "methods", label: "Methods auto-draft", section: "overview" },
    { id: "params", label: "Parameters snapshot", section: "overview" },
    { id: "versions", label: "Software versions", section: "overview" },
    { id: "read-depth", label: "Read depth summary", section: "overview" },
    { id: "filtering", label: "Filtering summary", section: "overview" },
    { id: "rarefaction", label: "Rarefaction adequacy", section: "overview" },
    { id: "permanova", label: "PERMANOVA results", section: "beta_diversity" }
  ]
};

test("answers exact group and sample-count questions locally", () => {
  const groups = answerLocalReportQuestion("how many groups?", CONTEXT);
  assert.equal(groups.answer, "There are 4 groups: Air-1, Air-5, CO2-1, and CO2-5.");
  assert.ok(groups.reportSourceIds.includes("metadata"));

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
  assert.equal(selectChatContextProfile("What is fastp?", [], { section: "beta_diversity" }), "methods_qc");
  assert.equal(selectChatContextProfile("quality control", [], { section: "beta_diversity" }), "methods_qc");
  assert.equal(selectChatContextProfile("How did DADA2 know where to trim?", [], { section: "overview" }), "methods_dada2");
});

test("answers exact QC and DADA2 parameter lists locally", () => {
  const qc = answerLocalReportQuestion("list down all in bulletpoints - the quality control done in this report.", CONTEXT);
  assert.equal(qc.profile, "methods_qc");
  assert.match(qc.answer, /Cutadapt 5\.1/);
  assert.match(qc.answer, /FastQC v0\.12\.1/);
  assert.match(qc.answer, /240\/220 bp/);
  assert.match(qc.answer, /Rarefaction adequacy/);
  assert.ok(qc.reportSourceIds.includes("params"));

  const parameters = answerLocalReportQuestion("List the DADA2 settings used", CONTEXT);
  assert.equal(parameters.profile, "methods_dada2");
  assert.match(parameters.answer, /maximum expected errors 2\.0\/2\.0/);
  assert.match(parameters.answer, /350 bp/);
  assert.equal(answerLocalReportQuestion("How did DADA2 know where to trim?", CONTEXT), null);
});

test("uses structured topics, concept scope, and only relevant follow-up history", () => {
  const history = [
    { role: "user", text: "Unrelated older question" },
    { role: "assistant", text: "Older answer" },
    { role: "user", text: "How did DADA2 know where to trim?" },
    { role: "assistant", text: "The truncation lengths were 240/220 bp." }
  ];
  assert.equal(selectChatTopic("where exactly?", history, "methods_dada2"), "dada2_filtering");
  assert.equal(selectChatAnswerScope("theoretically", "methods_dada2"), "concept");
  assert.equal(selectChatAnswerScope("Were reverse reads reverse-complemented?", "methods_dada2"), "concept");
  assert.deepEqual(selectChatHistory("where exactly?", history), history.slice(-2));
  assert.deepEqual(selectChatHistory("What is fastp?", history), []);
});

test("DADA2 profile sends a compact evidence bundle and expands only on demand", () => {
  const focused = projectChatContext(CONTEXT, "methods_dada2", {
    message: "How did DADA2 know where to trim?",
    topic: "dada2_filtering",
    answerScope: "report"
  });
  const full = CONTEXT.sections.overview.pipeline_methods;
  assert.equal(focused.study_design, undefined);
  assert.equal(focused.sections.overview.pipeline_methods.taxonomy, undefined);
  assert.match(focused.sections.overview.pipeline_methods.quality_control.filtering_settings, /240\/220/);
  assert.ok(Buffer.byteLength(JSON.stringify(focused)) < Buffer.byteLength(JSON.stringify(full)));

  const expanded = projectChatContext(CONTEXT, "methods_dada2", { expanded: true });
  assert.deepEqual(expanded.sections.overview.pipeline_methods.taxonomy, full.taxonomy);
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
  assert.equal(reasoningEffortForChat("methods_dada2", "report", "low"), "none");
  assert.equal(reasoningEffortForChat("beta_statistics", "report", "low"), "low");
  assert.equal(reasoningEffortForChat("methods", "mixed", "low"), "low");
});
