import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const portalPath = new URL("../../client-portal.html", import.meta.url);
const portalHtml = fs.readFileSync(portalPath, "utf8");
const serverPath = new URL("../server.js", import.meta.url);
const serverSource = fs.readFileSync(serverPath, "utf8");
const startMarker = "/* ALPHA_LEARNING_CORE_START */";
const endMarker = "/* ALPHA_LEARNING_CORE_END */";
const start = portalHtml.indexOf(startMarker);
const end = portalHtml.indexOf(endMarker);

assert.ok(start >= 0, "alpha-learning core start marker is present");
assert.ok(end > start, "alpha-learning core end marker follows its start");

const context = {};
vm.createContext(context);
vm.runInContext(portalHtml.slice(start + startMarker.length, end), context);

const statsStartMarker = "/* ALPHA_STATS_CORE_START */";
const statsEndMarker = "/* ALPHA_STATS_CORE_END */";
const statsStart = portalHtml.indexOf(statsStartMarker);
const statsEnd = portalHtml.indexOf(statsEndMarker);
assert.ok(statsStart >= 0, "alpha-statistics core start marker is present");
assert.ok(statsEnd > statsStart, "alpha-statistics core end marker follows its start");
const statsContext = {};
vm.createContext(statsContext);
vm.runInContext(portalHtml.slice(statsStart + statsStartMarker.length, statsEnd), statsContext);

test("alpha-learning distributions remain normalized and respond to dominance", () => {
  const even = context.alphaLearningDistribution(4, 0);
  const dominant = context.alphaLearningDistribution(4, 100);

  assert.equal(even.length, 4);
  assert.ok(even.every((value) => Math.abs(value - 0.25) < 1e-12));
  assert.ok(Math.abs(dominant.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
  assert.ok(dominant[0] > even[0]);
});

test("Shannon, Simpson, Observed Features, and Pielou teach distinct properties", () => {
  const even = context.alphaLearningDistribution(4, 0);
  const dominant = context.alphaLearningDistribution(4, 90);

  assert.ok(Math.abs(context.alphaLearningShannon(even) - Math.log(4)) < 1e-12);
  assert.ok(context.alphaLearningShannon(even) > context.alphaLearningShannon(dominant));
  assert.ok(Math.abs(context.alphaLearningSimpson(even) - 0.75) < 1e-12);
  assert.ok(context.alphaLearningSimpson(even) > context.alphaLearningSimpson(dominant));
  assert.equal(context.alphaLearningObserved(even), context.alphaLearningObserved(dominant));
  assert.ok(Math.abs(context.alphaLearningPielou(even) - 1) < 1e-12);
  assert.equal(context.alphaLearningShannon([1]), 0);
  assert.equal(context.alphaLearningPielou([1]), 0);
});

test("the Simpson lesson directly explains its weighting difference from Shannon", () => {
  assert.match(portalHtml, /Simpson squares each type's relative abundance \(p²\)/);
  assert.match(portalHtml, /Shannon uses −p ln\(p\), which gives rare types more influence/);
  assert.match(portalHtml, /the gap is smaller in Shannon and much larger in Simpson/);
  assert.match(portalHtml, /alphaLearningFixedMeaningHtml\(metric\)\+\(copy\.detail\?/);
});

test("Faith PD increases when the same number of types spans more branches", () => {
  const paths = {
    A: ["root", "ab", "a"],
    B: ["root", "ab", "b"],
    C: ["root", "cd", "c"]
  };
  const lengths = { root: 0.5, ab: 1, cd: 1, a: 0.4, b: 0.4, c: 0.4 };

  assert.equal(context.alphaLearningFaithPd(["A", "B"], paths, lengths), 2.3);
  assert.equal(context.alphaLearningFaithPd(["A", "C"], paths, lengths), 3.3);
});

test("a plateauing rarefaction curve gains fewer late features than a rising curve", () => {
  const plateauGain = context.alphaLearningRarefaction(100, "plateau") - context.alphaLearningRarefaction(80, "plateau");
  const risingGain = context.alphaLearningRarefaction(100, "rising") - context.alphaLearningRarefaction(80, "rising");

  assert.ok(plateauGain > 0);
  assert.ok(risingGain > plateauGain);
});

test("alpha page exposes separate Example and This report views", () => {
  assert.match(portalHtml, /data-alpha-view="example"/);
  assert.match(portalHtml, /data-alpha-view="report"/);
  assert.doesNotMatch(portalHtml, /Simulated examples · not report data/);
  assert.match(portalHtml, /New to alpha diversity\? Start with Example\./);
});

test("the learning view teaches purpose before simulation and explains practical meaning", () => {
  assert.match(portalHtml, /The situation/);
  assert.match(portalHtml, /What the metric notices/);
  assert.match(portalHtml, /Why researchers use it/);
  assert.match(portalHtml, /Now try changing the communities/);
  assert.match(portalHtml, /<b>Observation:<\/b><p>/);
  assert.doesNotMatch(portalHtml, /What you saw/);
  assert.match(portalHtml, /Why it matters/);
  assert.match(portalHtml, /What this alone cannot tell you/);
  assert.doesNotMatch(portalHtml, /class="alpha-learning-score-key"/);
  assert.match(portalHtml, /class="alpha-learning-controls-section"/);
  assert.match(portalHtml, /class="alpha-meaning-grid is-fixed"/);
  assert.match(portalHtml, /Sample A ["']?\+\(equal\?["']=["']/);
  assert.match(portalHtml, /equal=alphaLearningScoreText\(metric,a\)===alphaLearningScoreText\(metric,b\)/);
  assert.match(portalHtml, /same displayed ["']?\+alphaLearningMetricCopy\(metric\)\.title\+["'] score after rounding/);
  assert.match(portalHtml, /class="alpha-learning-comparison-mark"/);
  assert.match(portalHtml, /considered ["']?\+\(a>b\?["']more/);
  assert.doesNotMatch(portalHtml, /Do not overinterpret:/);
});

test("each supported lesson has a concrete research purpose", () => {
  assert.match(portalHtml, /Shannon notices variety and balance/);
  assert.match(portalHtml, /Simpson notices dominance/);
  assert.match(portalHtml, /Observed Features counts types/);
  assert.match(portalHtml, /Faith PD follows the tree/);
  assert.match(portalHtml, /Pielou isolates balance/);
  assert.match(portalHtml, /The curve notices sampling completeness/);
});

test("each report metric uses its supplied three-image story", () => {
  ["shannon", "obsfeat", "simpson", "faithpd"].forEach((metric) => {
    const first = portalHtml.indexOf(`client_supplements/12_example_${metric}_1.png`);
    const second = portalHtml.indexOf(`client_supplements/12_example_${metric}_2.png`);
    const third = portalHtml.indexOf(`client_supplements/12_example_${metric}_3.png`);

    assert.ok(first >= 0, `${metric} image 1 is mapped`);
    assert.ok(second > first, `${metric} image 2 follows image 1`);
    assert.ok(third > second, `${metric} image 3 follows image 2`);
  });
  assert.match(portalHtml, /class="alpha-story-board is-image-story"/);
  assert.match(portalHtml, /data-alpha-story-main/);
  assert.match(portalHtml, /class="alpha-story-thumbs"/);
  assert.match(portalHtml, /grid-template-rows:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(portalHtml, /data-alpha-story-image/);
  assert.match(portalHtml, /main\.src=button\.dataset\.src/);
  assert.doesNotMatch(portalHtml, /title="Hover or focus to magnify 2×"/);
});

test("the lesson provides a selected-metric handoff to real report results", () => {
  assert.match(portalHtml, /data-alpha-learn-report=/);
  assert.match(portalHtml, /function openAlphaReportMetric\(metric\)/);
  assert.match(portalHtml, /Connect this lesson to your data/);
  assert.match(portalHtml, /class="alpha-learning-report-row"/);
  assert.match(portalHtml, />Return<\/button>/);
  assert.doesNotMatch(portalHtml, />Return to Report<\/button>/);
  assert.doesNotMatch(portalHtml, />See ['"]?\+esc\(copy\.title\)/);
});

test("derived Kruskal-Wallis effect size is epsilon-squared and never labelled eta-squared", () => {
  const effect = statsContext.alphaKruskalEpsilonSquared(0.08888888888888857, 9);
  assert.ok(Math.abs(effect - 0.011111111111111071) < 1e-12);
  assert.equal(statsContext.alphaKruskalEpsilonSquared(Number.NaN, 9), null);
  assert.match(portalHtml, /Epsilon-squared \(ε²\)/);
  assert.match(portalHtml, /Calculated · ε²/);
  assert.match(portalHtml, /Reported effect size/);
  assert.doesNotMatch(portalHtml, /rank eta-squared|Calculated · η/i);
});

test("sensitivity-analysis p-values never render a numeric zero", () => {
  assert.equal(statsContext.alphaSelfPValue(0.0004), "<0.001");
  assert.equal(statsContext.alphaSelfPValue(0.0124), "=0.012");
  assert.equal(statsContext.alphaSelfPValue(null), "=Not estimable");
});

test("sensitivity plots can be downloaded as SVG or high-resolution PNG", () => {
  assert.match(portalHtml, /data-download-format="svg">Download SVG/);
  assert.match(portalHtml, /data-download-format="png">Download PNG/);
  assert.match(portalHtml, /function downloadSvgMarkupAsPng\(filename,markup\)/);
  assert.match(portalHtml, /canvas\.toBlob\(function\(blob\)/);
  assert.match(
    portalHtml,
    /downloadSelfExperimentPlots\(button\.dataset\.selfExperimentDownload,button\.dataset\.downloadFormat\)/
  );
});

test("the report keeps one collapsed advanced alpha disclosure after the chart", () => {
  const sectionStart = portalHtml.indexOf("function secAlpha(){");
  const sectionEnd = portalHtml.indexOf("function alphaVal", sectionStart);
  const section = portalHtml.slice(sectionStart, sectionEnd);
  assert.ok(section.indexOf("alphaResultSummaryPanel") < section.indexOf("releasedFigurePanel"));
  assert.ok(section.indexOf("releasedFigurePanel") < section.indexOf("alphaAdvancedDetailsPanel"));
  assert.doesNotMatch(section, /supplementFigureStack|alphaSupplementFigureForMetric/);
  assert.match(portalHtml, /clinicalDetails\("Advanced alpha details"/);
  assert.match(portalHtml, /All-metric statistical tests/);
  assert.match(portalHtml, /Sensitivity analysis — not part of the released report/);
  assert.match(portalHtml, /data-alpha-advanced-details/);
});

test("alpha details use header help and keep sample values below chart observations", () => {
  const statsStart = portalHtml.indexOf("function alphaStatsPanel(");
  const statsEnd = portalHtml.indexOf("function alphaSelfLogGamma(", statsStart);
  const stats = portalHtml.slice(statsStart, statsEnd);
  const advancedStart = portalHtml.indexOf("function alphaAdvancedDetailsPanel(");
  const advancedEnd = portalHtml.indexOf("function betaSupportTone(", advancedStart);
  const advanced = portalHtml.slice(advancedStart, advancedEnd);

  assert.match(stats, /class="alpha-stat-help"/);
  assert.match(stats, /data-tooltip="'\+esc\(c\.definition\)\+'"/);
  assert.doesNotMatch(stats, /title="'\+esc\(c\.definition\)\+'"/);
  assert.doesNotMatch(stats, /alpha-stat-definitions|Group comparisons across the available alpha-diversity metrics|Source files:/);
  assert.match(advanced, /function alphaSampleValuesDetails/);
  assert.match(advanced, /Values by Sample/);
  assert.doesNotMatch(advanced, /Each sample’s displayed/);
  assert.doesNotMatch(advanced, /<h3>'\+esc\(label\+" Values by Sample"\)/);
  assert.doesNotMatch(advanced, /Current metric sample values|Review the released and clearly marked portal-calculated statistics/);
  assert.match(portalHtml, /chartObservationPanel\(kind,selected\.file\)\+\(whatNextView\|\|""\)/);
  assert.doesNotMatch(portalHtml, /Exploratory only; the released alpha-diversity results remain the report reference/);
  assert.match(portalHtml, /function wireAlphaStatHelp\(\)/);
  assert.match(portalHtml, /className='alpha-stat-tooltip'/);
  assert.doesNotMatch(portalHtml, /Exploratory sensitivity analysis:<\/b> Excluding samples creates a new post-hoc calculation\. It must not replace the released analysis or be used to select a preferred p-value\./);
  assert.match(portalHtml, /'\+checks\+'<button type="button" class="btn secondary" data-alpha-self-reset>/);
});

test("the rarefaction figure has its own Sampling Depth chart choice", () => {
  assert.match(portalHtml, /rarefaction:"Sampling Depth"/);
  assert.match(portalHtml, /byMetric\.rarefaction=\{kind:"chart",index:index,metric:"observed"/);
  assert.match(portalHtml, /\["shannon","simpson","observed","faith","rarefaction"\]/);
});

test("the bundled example registers and summarizes its rarefaction evidence", () => {
  const manifestPath = new URL("../../client_supplements/example1/manifest.json", import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const required = [
    "output/o1_qc/rarefaction_adequacy.tsv",
    "output/o1_qc/selected_sampling_depth.tsv",
    "output/o6_figures/alpha_rarefaction_curve.png"
  ];
  const paths = manifest.files.map((file) => file.path);
  required.forEach((requiredPath) => {
    assert.ok(paths.includes(requiredPath), `${requiredPath} is present in the JSON manifest`);
    assert.match(portalHtml, new RegExp(requiredPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  const adequacyPath = new URL("../../client_supplements/example1/output/o1_qc/rarefaction_adequacy.tsv", import.meta.url);
  const lines = fs.readFileSync(adequacyPath, "utf8").trim().split(/\r?\n/);
  const headers = lines[0].split("\t");
  const rows = lines.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header, line.split("\t")[index]])));
  assert.equal(rows.length, 9);
  assert.ok(rows.every((row) => row.adequacy === "adequate" && row.included_at_sampling_depth === "yes"));
  assert.ok(rows.every((row) => row.sampling_depth === "800"));
  const smallestMargin = rows.slice().sort((a, b) => Number(a.reads_above_depth) - Number(b.reads_above_depth))[0];
  assert.equal(smallestMargin.sample_name, "APW61");
  assert.equal(smallestMargin.reads_above_depth, "37");
  assert.match(portalHtml, /support interpretation but are not the numeric source used to construct the full curves/);
});

test("backend manifest enrichment backfills rarefaction tables and merges missing figures", () => {
  const figureStart = serverSource.indexOf("async function addInferredFigureFiles");
  const figureEnd = serverSource.indexOf("async function addInferredAlphaFiles", figureStart);
  const figureFunction = serverSource.slice(figureStart, figureEnd);
  assert.match(serverSource, /import \{ mergeMissingManifestFiles \} from "\.\/manifest-utils\.js"/);
  assert.match(figureFunction, /mergeMissingManifestFiles\(existingFigures, figures, figureDedupeKey\)/);
  assert.match(figureFunction, /files: \[\.\.\.files, \.\.\.additions\]/);
  assert.doesNotMatch(figureFunction, /files\.some\(isImageFile\)[\s\S]*return manifest/);

  const alphaStart = figureEnd;
  const alphaEnd = serverSource.indexOf("async function addInferredFunctionalDiffFiles", alphaStart);
  const alphaFunction = serverSource.slice(alphaStart, alphaEnd);
  assert.match(alphaFunction, /id: "rarefaction-adequacy"/);
  assert.match(alphaFunction, /output\/o1_qc\/rarefaction_adequacy\.tsv/);
  assert.match(alphaFunction, /id: "selected-sampling-depth"/);
  assert.match(alphaFunction, /output\/o1_qc\/selected_sampling_depth\.tsv/);
});
