import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const portalPath = new URL("../../client-portal.html", import.meta.url);
const portalHtml = fs.readFileSync(portalPath, "utf8");
const startMarker = "/* ALPHA_LEARNING_CORE_START */";
const endMarker = "/* ALPHA_LEARNING_CORE_END */";
const start = portalHtml.indexOf(startMarker);
const end = portalHtml.indexOf(endMarker);

assert.ok(start >= 0, "alpha-learning core start marker is present");
assert.ok(end > start, "alpha-learning core end marker follows its start");

const context = {};
vm.createContext(context);
vm.runInContext(portalHtml.slice(start + startMarker.length, end), context);

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
