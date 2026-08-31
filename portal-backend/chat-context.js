const PROFILE_PATTERNS = Object.freeze([
  ["functional_differential", /\baldex2?\b|functional.*(?:differential|fdr|adjusted|heatmap)|pathway.*(?:difference|comparison)|\bko\b.*(?:difference|comparison)|\bec\b.*(?:difference|comparison)/i],
  ["functional_quality", /\bnsti\b|\bpicrust2?\b|functional prediction|predicted function|prediction support/i],
  ["beta_statistics", /\bpermanova\b|\bpermdisp\b|pseudo[- ]?f|r[²2].*(?:permanova|variation)|beta.*(?:statistic|test|significan)/i],
  ["beta_ordination", /\bpcoa\b|ordination|bray[- ]?curtis|unifrac|beta diversity|between[- ]sample/i],
  ["alpha_statistics", /alpha diversity|shannon|simpson|faith|observed feature|richness|evenness|within[- ]sample|rarefaction/i],
  ["taxonomy", /taxon|taxa|taxonomy|relative abundance|composition|species|genus|family|phylum|\bemu\b|\bsilva\b/i],
  ["methods", /whole method|workflow|pipeline|methodology|methods? (?:for|used|table)|quality control|\bqc\b|\bfastp\b|\bfastqc\b|cutadapt|dada2|qiime|classifier/i],
  ["study_design", /how many (?:groups?|samples?)|what (?:are|were) the groups?|list (?:the )?groups?|sample (?:count|size|total)|samples? per group|study design|replicates?/i],
  ["overview", /overview|overall|summary|main finding|conclusion/i]
]);

export function selectChatContextProfile(message, history = [], currentView = {}) {
  const explicit = profileForText(message);
  if (explicit) return explicit;

  const recent = Array.isArray(history) ? history.slice(-4).reverse() : [];
  for (const item of recent) {
    const inherited = profileForText(item?.text);
    if (inherited) return inherited;
  }

  const section = String(currentView?.section || "");
  if (section === "beta_diversity") return "beta_ordination";
  if (section === "alpha_diversity") return "alpha_statistics";
  if (section === "composition") return "taxonomy";
  if (section === "functional_prediction") return "functional_quality";
  return "overview";
}

export function reasoningEffortForChat(profile, mode, configured = "low") {
  if (mode === "web" || mode === "mixed") return configured || "low";
  return ["study_design", "methods", "overview"].includes(profile) ? "none" : (configured || "low");
}

export function shouldRetryChatContext(mode, generated, alreadyExpanded = false) {
  return mode === "report" && !alreadyExpanded && generated?.contextSufficient === false;
}

export function answerLocalReportQuestion(message, reportContext) {
  const text = String(message || "").trim();
  const design = reportContext?.study_design || {};
  const groups = Array.isArray(design.groups) ? design.groups.filter((group) => group?.label || group?.id) : [];
  const sampleCount = integerOrNull(design.sample_count);
  if (!groups.length && sampleCount == null) return null;

  const asksGroupCount = /^(?:please\s+)?(?:how many groups?(?: (?:are|were) there)?|what (?:are|were) the groups?|list (?:all |the )?groups?)[?.!\s]*$/i.test(text);
  if (asksGroupCount && groups.length) {
    const labels = groups.map((group) => String(group.label || group.id));
    return {
      answer: `There ${labels.length === 1 ? "is" : "are"} ${labels.length} group${labels.length === 1 ? "" : "s"}: ${joinEnglish(labels)}.`,
      reportSourceIds: localSourceIds(reportContext),
      profile: "study_design"
    };
  }

  const asksSampleCount = /^(?:please\s+)?(?:how many samples?(?: (?:are|were) there)?|what (?:is|was) the (?:total )?sample (?:count|size)|sample (?:count|size|total)|how many samples? (?:are|were) in each group)[?.!\s]*$/i.test(text);
  if (asksSampleCount && sampleCount != null) {
    const counts = groups.map((group) => {
      const count = integerOrNull(group.sample_count);
      return count == null ? null : `${group.label || group.id}: ${count}`;
    }).filter(Boolean);
    const detail = counts.length ? ` (${counts.join(", ")})` : "";
    return {
      answer: `There are ${sampleCount} samples in total${detail}.`,
      reportSourceIds: localSourceIds(reportContext),
      profile: "study_design"
    };
  }
  return null;
}

export function projectChatContext(reportContext, profile, options = {}) {
  const message = String(options.message || "");
  const expanded = Boolean(options.expanded);
  const sections = reportContext?.sections || {};
  const projected = {
    context_schema_version: "1.0",
    report_id: String(reportContext?.report_id || ""),
    context_profile: profile,
    study_design: compactStudyDesign(reportContext?.study_design),
    sections: {},
    sources: filterSources(reportContext?.sources, profile)
  };

  if (profile === "study_design") {
    projected.sections.overview = pick(sections.overview, ["title", "summary"]);
  } else if (profile === "methods") {
    projected.sections.overview = pick(sections.overview, ["title", "pipeline_methods", "limitations"]);
  } else if (profile === "beta_statistics") {
    projected.sections.beta_diversity = projectBeta(sections.beta_diversity, message, expanded, false);
  } else if (profile === "beta_ordination") {
    projected.sections.beta_diversity = projectBeta(sections.beta_diversity, message, expanded, true);
  } else if (profile === "alpha_statistics") {
    projected.sections.alpha_diversity = projectAlpha(sections.alpha_diversity, message, expanded);
  } else if (profile === "taxonomy") {
    projected.sections.composition = projectTaxonomy(sections.composition, message, expanded);
  } else if (profile === "functional_quality") {
    projected.sections.functional_prediction = expanded
      ? projectFunctional(sections.functional_prediction, message, true)
      : pick(sections.functional_prediction, ["title", "summary", "prediction_quality", "differential_summary", "limitations"]);
  } else if (profile === "functional_differential") {
    projected.sections.functional_prediction = projectFunctional(sections.functional_prediction, message, expanded);
  } else {
    projected.sections.overview = pick(sections.overview, ["title", "summary", "statistical_support", "section_findings", "limitations"]);
  }

  if (expanded && profile !== "overview" && profile !== "methods" && profile !== "study_design") {
    projected.sections.overview = pick(sections.overview, ["title", "summary", "statistical_support", "section_findings", "pipeline_methods", "limitations"]);
    projected.sources = mergeSources(projected.sources, filterSources(reportContext?.sources, "overview"));
  }

  removeUndefined(projected.sections);
  return projected;
}

function profileForText(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  for (const [profile, pattern] of PROFILE_PATTERNS) if (pattern.test(value)) return profile;
  return "";
}

function compactStudyDesign(design) {
  if (!design || typeof design !== "object") return {};
  return pick(design, ["sample_count", "grouping_id", "grouping_label", "groups"]);
}

function projectBeta(section, message, expanded, ordination) {
  if (!section || typeof section !== "object") return undefined;
  const wantsPairwise = expanded || /pairwise|which groups?|versus|\bvs\.?\b/i.test(message);
  const wantsPoints = expanded || /sample points?|coordinates?|individual samples?/i.test(message);
  return {
    title: section.title,
    summary: section.summary,
    metrics: array(section.metrics).map((metric) => {
      const out = pick(metric, ["id", "label"]);
      if (ordination) {
        out.axes = metric.axes;
        if (wantsPoints) out.points = array(metric.points).slice(0, 40);
        out.permanova = metric.permanova;
      } else {
        out.permanova = metric.permanova;
        out.permdisp = metric.permdisp;
        if (wantsPairwise) out.pairwise_tests = array(metric.pairwise_tests).slice(0, 18);
        if (expanded) {
          out.axes = metric.axes;
          out.points = array(metric.points).slice(0, 40);
        }
      }
      return out;
    }),
    limitations: section.limitations
  };
}

function projectAlpha(section, message, expanded) {
  if (!section || typeof section !== "object") return undefined;
  const wantsSamples = expanded || /individual|sample values?|each sample/i.test(message);
  return {
    title: section.title,
    summary: section.summary,
    metrics: array(section.metrics).map((metric) => {
      const out = pick(metric, ["id", "label", "definition", "support", "group_summaries", "statistical_test"]);
      if (wantsSamples) out.sample_values = array(metric.sample_values).slice(0, 40);
      return out;
    }),
    limitations: section.limitations
  };
}

function projectTaxonomy(section, message, expanded) {
  if (!section || typeof section !== "object") return undefined;
  const wantsSamples = expanded || /individual|sample values?|each sample/i.test(message);
  return {
    ...pick(section, ["title", "summary", "taxonomic_level", "taxonomy_database", "taxonomy_database_roles", "abundance_source_table", "differential_results_scope", "differential_results", "limitations"]),
    displayed_features: array(section.displayed_features).slice(0, expanded ? 16 : 10).map((feature) => {
      const out = pick(feature, ["id", "label", "mean_relative_abundance", "group_summaries"]);
      if (wantsSamples) out.sample_values = array(feature.sample_values).slice(0, 40);
      return out;
    })
  };
}

function projectFunctional(section, message, expanded) {
  if (!section || typeof section !== "object") return undefined;
  const wantsPatterns = expanded || /heatmap|pattern|highest|lowest|broad/i.test(message);
  const out = pick(section, ["title", "summary", "prediction_quality", "differential_summary", "differential_results", "limitations"]);
  if (wantsPatterns) out.feature_sets = array(section.feature_sets).slice(0, 3);
  return out;
}

function filterSources(sources, profile) {
  const section = {
    study_design: "overview",
    methods: "overview",
    overview: "overview",
    beta_statistics: "beta_diversity",
    beta_ordination: "beta_diversity",
    alpha_statistics: "alpha_diversity",
    taxonomy: "composition",
    functional_quality: "functional_prediction",
    functional_differential: "functional_prediction"
  }[profile];
  const rows = array(sources).filter((source) => String(source?.section || "") === section);
  return rows.slice(0, 12);
}

function mergeSources(first, second) {
  const out = [];
  for (const source of [...array(first), ...array(second)]) {
    if (!out.some((item) => String(item?.id || "") === String(source?.id || ""))) out.push(source);
  }
  return out.slice(0, 16);
}

function localSourceIds(context) {
  const sources = array(context?.sources);
  const preferred = sources.filter((source) => /sample|metadata|method/i.test(`${source?.id || ""} ${source?.label || ""}`));
  return (preferred.length ? preferred : sources).slice(0, 3).map((source) => String(source.id || "")).filter(Boolean);
}

function pick(value, keys) {
  if (!value || typeof value !== "object") return undefined;
  const out = {};
  for (const key of keys) if (value[key] !== undefined) out[key] = value[key];
  return out;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function removeUndefined(value) {
  for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
}

function integerOrNull(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function joinEnglish(values) {
  if (values.length < 2) return values[0] || "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}
