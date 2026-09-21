import assert from "node:assert/strict";
import test from "node:test";
import { mergeMissingManifestFiles } from "../manifest-utils.js";

const figureKey = (file) => file.metric ? `alpha:${file.metric}` : String(file.path || "").toLowerCase();

test("manifest merge preserves declared files and adds missing figures", () => {
  const declared = [{ id: "shannon-declared", path: "output/o6_figures/alpha_shannon.png", metric: "shannon" }];
  const discovered = [
    { id: "shannon-inferred", path: "output/o4_diversity/alpha_shannon.png", metric: "shannon" },
    { id: "rarefaction-inferred", path: "output/o6_figures/alpha_rarefaction_curve.png", metric: "rarefaction" }
  ];
  const merged = mergeMissingManifestFiles(declared, discovered, figureKey);
  assert.deepEqual(merged.map((file) => file.id), ["shannon-declared", "rarefaction-inferred"]);
  assert.equal(declared.length, 1, "the caller's declared array is not mutated");
});

test("manifest merge deduplicates exact paths case-insensitively", () => {
  const declared = [{ id: "existing", path: "output/o6_figures/Alpha_Rarefaction_Curve.png" }];
  const discovered = [{ id: "duplicate", path: "output/o6_figures/alpha_rarefaction_curve.png" }];
  const merged = mergeMissingManifestFiles(declared, discovered, () => "");
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "existing");
});
