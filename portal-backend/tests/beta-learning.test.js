import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const portalPath = new URL("../../client-portal.html", import.meta.url);
const portalHtml = fs.readFileSync(portalPath, "utf8");

test("beta diversity exposes separate Example and This report views", () => {
  assert.match(portalHtml, /betaView:"report"/);
  assert.match(portalHtml, /data-beta-view="example"/);
  assert.match(portalHtml, /data-beta-view="report"/);
  assert.match(portalHtml, /New to beta diversity\? Start with Example\./);
  assert.match(portalHtml, /id="beta-example-panel"/);
  assert.match(portalHtml, /id="beta-report-panel"/);
});

test("page headers omit redundant category tags", () => {
  assert.doesNotMatch(portalHtml, /<div class="kicker"><span class="eyebrow">/);
});

test("beta lessons explain the three standard distance metrics", () => {
  assert.match(portalHtml, /Bray–Curtis asks whether the same microbial types occur in similar proportions/);
  assert.match(portalHtml, /compares each microbial type's relative abundance/);
  assert.match(portalHtml, /measures how much branch length occurs in only one of the two samples/);
  assert.match(portalHtml, /compares abundance along its branches/);
  assert.match(portalHtml, /data-beta-learn-metric=/);
});

test("beta lesson explains how to interpret a PCoA map", () => {
  assert.match(portalHtml, /PCoA 1 and PCoA 2 show the two largest patterns in the distance data/);
  assert.match(portalHtml, /An axis percentage tells how much of the pattern that axis displays/);
  assert.match(portalHtml, /Wider gaps between points—not higher axis values—mean more different communities/);
  assert.match(portalHtml, /PCoA 1 \('\+axisPercent\[0\]\+'%\)/);
  assert.match(portalHtml, /PCoA 2 \('\+axisPercent\[1\]\+'%\)/);
  assert.match(portalHtml, /<ellipse class="zone zone-/);
  assert.match(portalHtml, /transform="rotate\('\+group\.angle/);
});

test("beta example provides an interactive PCoA-style separation lesson", () => {
  assert.match(portalHtml, /Example group map/);
  assert.match(portalHtml, /data-beta-learn-scenario=/);
  assert.match(portalHtml, /data-beta-learn-control=/);
  assert.match(portalHtml, /Distance between groups/);
  assert.match(portalHtml, /Variation within each group/);
  assert.match(portalHtml, /scenario==="overlap"\)\{betaLearningState\.separation=12;betaLearningState\.spread=36;/);
  assert.match(portalHtml, /scenario==="spread"\)\{betaLearningState\.separation=58;betaLearningState\.spread=92;/);
  assert.match(portalHtml, /label:"High internal variation"/);
  assert.match(portalHtml, /group centres are apart, but samples within each group are widely scattered/);
  assert.match(portalHtml, /function refreshBetaLearningOutput\(\)/);
  assert.match(portalHtml, /Current pattern/);
  assert.doesNotMatch(portalHtml, /class="centroid"/);
  assert.doesNotMatch(portalHtml, /class="beta-learning-readout"/);
});

test("beta lesson separates visualization from statistical support", () => {
  assert.match(portalHtml, /A PCoA-style map shows a pattern, not proof of a group difference/);
  assert.match(portalHtml, /PERMANOVA tests whether group labels explain the distances among samples/);
  assert.match(portalHtml, /PERMDISP checks whether groups simply differ in how widely their samples are scattered/);
  assert.match(portalHtml, /data-beta-learn-report=/);
  assert.match(portalHtml, /function openBetaReportMetric\(metric\)/);
});

test("beta learning controls and tabs are wired for mouse and keyboard use", () => {
  assert.match(portalHtml, /\$\$\('\[data-beta-view\]'/);
  assert.match(portalHtml, /\$\$\('\[data-beta-learn-metric\]'/);
  assert.match(portalHtml, /event\.key==='ArrowRight'/);
  assert.match(portalHtml, /\$\$\('\[data-beta-learn-control\]'/);
});

test("beta report follows the same progressive-disclosure system as alpha", () => {
  const betaSection = portalHtml.slice(
    portalHtml.indexOf("function secBeta()"),
    portalHtml.indexOf("function renderBetaStatsAndRead")
  );

  assert.match(
    betaSection,
    /releasedFigurePanel\("beta","Relationship map","",betaGroupDistanceDetails\(d,betaState\.metric\)\)/
  );
  assert.match(betaSection, /betaAdvancedDetailsPanel\(d\)/);
  assert.doesNotMatch(betaSection, /betaSupplementFigurePanel\(/);
  assert.doesNotMatch(betaSection, /clinicalDetails\("Group distance details"/);
  assert.match(portalHtml, /data-beta-advanced-details/);
  assert.match(portalHtml, /class="clinical-details beta-chart-distances"/);
  assert.match(portalHtml, /betaSelfExperimentPanel\(d,\{bodyOnly:true\}\)/);
  assert.match(
    portalHtml,
    /\[data-beta-self-details\],\[data-beta-advanced-details\]/
  );
});

test("beta advanced details use the same clean container system as alpha", () => {
  const tableStart = portalHtml.indexOf("function betaInspectionTable(");
  const tableEnd = portalHtml.indexOf("function functionGroupValue", tableStart);
  const table = portalHtml.slice(tableStart, tableEnd);
  const selfStart = portalHtml.indexOf("function betaSelfExperimentPanel(");
  const selfEnd = portalHtml.indexOf("function betaSelfPlotSvg", selfStart);
  const self = portalHtml.slice(selfStart, selfEnd);

  assert.doesNotMatch(table, /class="pattern-panel"/);
  assert.doesNotMatch(table, /Whole-community centroid distances by/);
  assert.doesNotMatch(self, /Exploratory sensitivity analysis|Samples to include/);
  assert.match(self, /Distance metric <select data-beta-self-metric>/);
  assert.match(
    self,
    /'\+checks\+'<button type="button" class="btn secondary" data-beta-self-reset>/
  );
  assert.match(
    portalHtml,
    /data-beta-advanced-details\]\[open\]>\.clinical-details-body\{[^}]*background:#fff/
  );
});
