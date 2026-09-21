import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const portalPath = new URL("../../client-portal.html", import.meta.url);
const portalHtml = fs.readFileSync(portalPath, "utf8");

function sourceBetween(startMarker, endMarker) {
  const start = portalHtml.indexOf(startMarker);
  const end = portalHtml.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `${startMarker} is present`);
  assert.ok(end > start, `${endMarker} follows ${startMarker}`);
  return portalHtml.slice(start, end);
}

test("overall summary omits the cross-analysis explanation panel", () => {
  const source = sourceBetween("function secOverall(){", "function overallIntroPanel(");

  assert.doesNotMatch(source, /overallCrossStatsPanel/);
  assert.doesNotMatch(portalHtml, /How the results fit together/);
});

test("overall relationship and variability bars use one position-consistent color scale", () => {
  const styles = sourceBetween(".relationship-strip", ".confidence-meter");
  const relationship = sourceBetween("function overallRelationshipCard(", "function overallConfidenceCard(");
  const variability = sourceBetween("function overallVariabilityCard(", "function overallWhatMattersCard(");

  assert.match(styles, /#BFDFFF 0%,#6FA8DC 48%,#1D5FA7 100%/);
  assert.match(styles, /clip-path:inset\(0 calc\(100% - var\(--w/);
  assert.doesNotMatch(styles, /relationship-line\.far|variability-row\.top \.variability-track i|#C0455B/);
  assert.match(relationship, /Shorter, lighter bars mean more similar groups/);
  assert.match(relationship, /Color represents distance only—not group identity or statistical support/);
  assert.match(relationship, /relationship-caption"><span>More similar<\/span><span>More separated<\/span>/);
  assert.match(relationship, /distance\.toFixed\(3\)/);
  assert.match(variability, /Every row uses the same light-to-dark scale/);
  assert.doesNotMatch(variability, /<span><\/span><\/div><span class="variability-score"/);
});

test("sample-method notes omit the source-file list while retaining provenance data", () => {
  const source = sourceBetween("async function hydrateMethodMetadataIntoDataset", "function parseSimpleYaml(");

  assert.match(source, /d\.methodSources=/);
  assert.doesNotMatch(source, /label:"Source files"/);
  assert.doesNotMatch(portalHtml, /function methodSourceTags\(/);
});

test("composition summary keeps one conclusion card instead of a duplicate statistical-context card", () => {
  const source = sourceBetween("function taxonomyResultSummaryPanel(", "function topGenusInspectionRows(");

  assert.match(source, /label:"Main conclusion"/);
  assert.match(source, /takeaway-card-grid taxonomy-takeaway-grid/);
  assert.doesNotMatch(source, /support\.note/);
  assert.doesNotMatch(source, /label:"Statistical context"/);
});

test("suggestions is a separate page immediately after predicted functions", () => {
  assert.match(portalHtml, /\{id:"functional",n:"07"[\s\S]*?\{id:"suggestions",n:"08"/);
  assert.match(portalHtml, /SECTION_ORDER=\["welcome","overall","pipeline","taxonomy","alpha","beta","functional","suggestions","flow"/);
  assert.match(portalHtml, /function secSuggestions\(\)/);
  assert.match(portalHtml, /suggestions:secSuggestions/);
  const summary = sourceBetween("function suggestionSummaryItems(", "function suggestionPlanModel(");
  assert.match(summary, /var functionalAvailable=functionalSectionAvailable\(\)/);
});

test("suggestions summarizes raw-only taxonomy findings without promoting one taxon", () => {
  const state = sourceBetween("function overallTaxonomyStatState(", "function overallAlphaStatState(");

  assert.match(state, /One .* comparison had a raw p-value below 0\.05, but it did not pass FDR correction/);
  assert.match(state, /No .* group difference was statistically supported/);
  assert.doesNotMatch(state, /taxonDisplayName\(rawRow\.taxon|For .*the .* comparison had/);
});

test("suggestions presents one decision flow with expandable evidence", () => {
  const section = sourceBetween("function secSuggestions()", "/* ---------------- SECTION: plot flow");
  const styles = sourceBetween(".suggestion-hero", ".alpha-extremes");

  assert.match(section, /suggestionHero\(plan\)/);
  assert.match(section, /suggestionDecisionFlow\(plan\)/);
  assert.match(section, /suggestionEvidencePanel\(items\)/);
  assert.match(portalHtml, /Start with the statistical test/);
  assert.match(portalHtml, /Make sure the result is reliable/);
  assert.match(portalHtml, /Is this what you expected before looking at the results\?/);
  assert.match(portalHtml, /Result-specific evidence/);
  assert.match(portalHtml, /<details class="suggestion-evidence">/);
  assert.match(portalHtml, /Why this matters:/);
  assert.match(portalHtml, /Next check:/);
  assert.match(styles, /suggestion-hero\{[^}]*background:#0C2C4A/);
  assert.match(portalHtml, /\.theme-suggestions \.section-body-shell\{background:#fff\}/);
  assert.doesNotMatch(styles, /suggestion-hero::before/);
  assert.match(styles, /suggestion-decision-step::after/);
  assert.match(styles, /suggestion-branch-grid/);
  assert.match(styles, /suggestion-evidence\{[^}]*border:0/);
  assert.doesNotMatch(portalHtml, /Safe to say|Avoid saying|suggestionRoadmap/);
  assert.doesNotMatch(portalHtml, /Begin with the statistical conclusion, not the most dramatic chart/);
  assert.doesNotMatch(portalHtml, /suggestions-grid|suggestions-priority|function suggestionCard\(/);
});

test("suggestion decision flow does not equate significance with useful data or non-significance with failure", () => {
  const flow = sourceBetween("function suggestionDecisionFlow(", "function suggestionEvidencePanel(");

  assert.match(flow, /A non-significant result is not a failed result/);
  assert.match(flow, /Not supported.*did not find clear evidence of a difference/);
  assert.match(flow, /separate equivalence test/);
  assert.match(flow, /Do not remove a sample simply to make the result significant/);
  assert.match(flow, /published studies that could explain the unexpected pattern/);
  assert.match(flow, /more independent, well-documented biological samples/);
  assert.match(flow, /sample information, environment, processing batch, group balance, group spread/);
  assert.doesNotMatch(flow, /if (?:it|the result) is significant[^.]*data[^.]*useful|the result failed/i);
});

test("suggestion plan status prioritizes cautions and preserves reporting boundaries", () => {
  const modelSource = sourceBetween("function suggestionPlanModel(", "function suggestionHero(");
  const context = {
    resultStudyDesign: (d) => d.design,
    resultReplicationSummary: () => "Current design needs review.",
    fmtNum: String,
    groupingUnitLabel: () => "groups",
    readableList: (items) => items.join(" and ")
  };
  vm.createContext(context);
  vm.runInContext(modelSource, context);
  const design = { total: 9, positive: [{ label: "A", n: 3 }, { label: "B", n: 6 }], countText: "A n=3; B n=6", guidance: "Add balanced biological replicates.", note: "Record plausible confounders." };
  const item = (title, status) => ({ title, status, summary: `${title} summary.`, action: `${title} action.` });

  const supported = context.suggestionPlanModel({ design }, [item("Composition", "supported"), item("Alpha", "unsupported")]);
  assert.equal(supported.tone, "supported");
  assert.match(supported.trustText, /how large the difference is/);
  assert.equal(supported.designCount, "A n=3; B n=6");

  const warning = context.suggestionPlanModel({ design }, [item("Beta", "warning"), item("Composition", "supported")]);
  assert.equal(warning.tone, "warning");
  assert.match(warning.title, /Resolve a limitation/);
  assert.match(warning.trustText, /unequal group spread/);

  const exploratory = context.suggestionPlanModel({ design }, [item("Alpha", "exploratory"), item("Beta", "unsupported")]);
  assert.equal(exploratory.tone, "exploratory");

  const unsupported = context.suggestionPlanModel({ design }, [item("Composition", "unsupported"), item("Functions", "unavailable")]);
  assert.equal(unsupported.tone, "unsupported");
  assert.match(unsupported.trustText, /still a useful result/);

  const unavailable = context.suggestionPlanModel({ design }, [item("Composition", "unavailable"), item("Functions", "absent")]);
  assert.equal(unavailable.tone, "unavailable");
  assert.match(unavailable.trustText, /does not include the statistical test/);
});

test("result pages no longer render their own What Next sections", () => {
  const taxonomy = sourceBetween("function secTaxonomy(){", "/* ---------------- SECTION: alpha");
  const alpha = sourceBetween("function secAlpha(){", "function alphaVal(");
  const beta = sourceBetween("function secBeta(){", "function renderBetaStatsAndRead(");
  const functional = sourceBetween("function secFunctional(){", "/* ---------------- SECTION: suggestions");

  assert.doesNotMatch(taxonomy, /taxonomyWhatNextPanel/);
  assert.doesNotMatch(alpha, /alphaWhatNextPanel|what-next/);
  assert.doesNotMatch(beta, /betaWhatNextPanel|what-next/);
  assert.doesNotMatch(functional, /functional(?:Summary)?WhatNextPanel|what-next/);
});

test("predicted-function summary uses one concise conclusion card", () => {
  const source = sourceBetween("function functionalResultSummaryPanel(", "function functionalInspectionTable(");

  assert.match(source, /takeaway-card-grid functional-takeaway-grid/);
  assert.match(source, /functional-evidence-list/);
  assert.match(source, /functional-evidence-note/);
  assert.doesNotMatch(source, /Reading priority|Overall PICRUSt2 prediction support|Applies to|nstiSampleContext/);
});

test("within- and between-sample summaries merge statistics into their main conclusion", () => {
  const alpha = sourceBetween("function alphaResultSummaryPanel(", "function alphaInspectionTable(");
  const beta = sourceBetween("function betaResultSummaryPanel(", "function betaInspectionTable(");

  assert.match(alpha, /label:"Main conclusion"/);
  assert.match(alpha, /label:"Observed group pattern"/);
  assert.match(alpha, /alphaStatDetail\(support\.stat\)/);
  assert.match(alpha, /takeaway-card-grid diversity-takeaway-grid/);
  assert.doesNotMatch(alpha, /What this metric captures|alphaSampleDiversitySummary|is highest;|is lowest/);
  assert.doesNotMatch(alpha, /Statistical result · '\+esc\(support\.value\)/);
  assert.doesNotMatch(alpha, /label:"Sample diversity"|label:"Statistical context"/);

  assert.match(beta, /label:"Main conclusion"/);
  assert.match(beta, /label:"Observed group relationship"/);
  assert.match(beta, /conclusionDetail/);
  assert.match(beta, /betaConclusionNote/);
  assert.doesNotMatch(beta, /definition\.note|What this metric captures/);
  assert.doesNotMatch(beta, /conclusionDetail='<span>'\+esc\(top\.note\)/);
  assert.match(beta, /takeaway-card-grid diversity-takeaway-grid/);
  assert.doesNotMatch(beta, /label:"Statistical context"/);
});

test("alpha and beta charts show a compact definition for the selected metric", () => {
  const definitions = sourceBetween("function diversityMetricDefinitionCopy(", "function diversityReleasedFigurePanel(");
  const figurePanel = sourceBetween("function diversityReleasedFigurePanel(", "function releasedFigurePanel(");

  for (const label of ["Shannon", "Simpson", "Observed features", "Faith PD", "Rarefaction", "Bray–Curtis", "Unweighted UniFrac", "Weighted UniFrac"]) {
    assert.match(definitions, new RegExp(label.replace(/[–-]/g, "[–-]")));
  }
  assert.match(definitions, /closer points have more similar/);
  assert.match(figurePanel, /diversityMetricDefinitionHtml\(kind,selected\)/);
  assert.match(portalHtml, /\.diversity-metric-definition\{/);
  assert.match(portalHtml, /\{metric:"Faith PD"/);
  assert.match(portalHtml, /\{metric:"Bray–Curtis"/);
  assert.match(portalHtml, /\{metric:"Unweighted UniFrac"/);
  assert.match(portalHtml, /\{metric:"Weighted UniFrac"/);
});
