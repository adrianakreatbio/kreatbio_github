const PROFILE_PATTERNS = Object.freeze([
  ["functional_differential", /\baldex2?\b|functional.*(?:differential|fdr|adjusted|heatmap)|pathway.*(?:difference|comparison)|\bko\b.*(?:difference|comparison)|\bec\b.*(?:difference|comparison)/i],
  ["functional_quality", /\bnsti\b|\bpicrust2?\b|functional prediction|predicted function|prediction support/i],
  ["beta_statistics", /\bpermanova\b|\bpermdisp\b|pseudo[- ]?f|r[²2].*(?:permanova|variation)|beta.*(?:statistic|test|significan)/i],
  ["beta_ordination", /\bpcoa\b|ordination|bray[- ]?curtis|unifrac|beta diversity|between[- ]sample/i],
  ["alpha_statistics", /alpha diversity|shannon|simpson|faith|observed feature|richness|evenness|within[- ]sample|rarefaction/i],
  ["taxonomy", /taxon|taxa|taxonomy|relative abundance|composition|species|genus|family|phylum|\bemu\b|\bsilva\b/i],
  ["methods_dada2", /\bdada2\b|trunc(?:ate|ation|ating)?|max(?:imum)? expected errors?|\bmaxee\b|denois|chimera|reverse[- ]?complement|reverse reads?|paired[- ]read merg|mergepairs/i],
  ["methods_qc", /quality control|\bqc\b|\bfastp\b|\bfastqc\b|\bmultiqc\b|cutadapt|primer trim|read quality|quality[- ]filter/i],
  ["methods", /whole method|workflow|pipeline|methodology|methods? (?:for|used|table)|\bqiime\b|software versions?/i],
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
  return ["study_design", "methods", "methods_qc", "methods_dada2", "overview"].includes(profile) ? "none" : (configured || "low");
}

export function selectChatTopic(message, history = [], profile = "overview") {
  const recent = array(history).slice(-2).map((item) => String(item?.text || "")).join(" ");
  const text = `${message || ""} ${recent}`;
  if (profile === "methods_dada2") {
    if (/reverse[- ]?complement|reverse reads?|merge|overlap|paired/i.test(text)) return "dada2_paired_reads";
    if (/trunc|trim|max(?:imum)? expected|\bmaxee\b|quality|error/i.test(text)) return "dada2_filtering";
    return "dada2_processing";
  }
  if (profile === "methods_qc") return "quality_control";
  if (profile === "methods") return "report_workflow";
  return profile;
}

export function selectChatAnswerScope(message, profile = "overview") {
  const text = String(message || "").trim();
  if (/\b(theoretically|in theory|conceptually|generally speaking|in general)\b/i.test(text)) return "concept";
  if (profile === "methods_dada2" &&
      /(?:are|is|were|was|do|does|did|how|can|will|would).*(?:reverse[- ]?complement|reverse reads?|mergepairs|paired[- ]read merg)/i.test(text) &&
      !/\b(this|that|the report|our|here|used|setting|parameter)\b/i.test(text)) return "concept";
  return "report";
}

export function selectChatHistory(message, history = []) {
  const rows = array(history);
  if (!rows.length) return [];
  const text = String(message || "").trim();
  const explicit = Boolean(profileForText(text));
  const isFollowup = !explicit || /^(?:and|but|so|then|also|no[, ]|yes[, ]|where\b|why\b|what about\b|how about\b|theoretically\b|in theory\b)|\b(it|that|those|they|them|this result|the same)\b/i.test(text);
  if (!isFollowup) return [];
  const count = /compare|earlier|previous|both|all of (?:that|those)/i.test(text) ? 4 : 2;
  return rows.slice(-count).map((item) => ({
    role: item?.role === "user" ? "user" : "assistant",
    text: String(item?.text || "").trim().slice(0, 400)
  })).filter((item) => item.text);
}

export function shouldRetryChatContext(mode, generated, alreadyExpanded = false) {
  return mode === "report" && !alreadyExpanded && generated?.contextSufficient === false;
}

export function answerLocalReportQuestion(message, reportContext) {
  const text = String(message || "").trim();
  const design = reportContext?.study_design || {};
  const groups = Array.isArray(design.groups) ? design.groups.filter((group) => group?.label || group?.id) : [];
  const sampleCount = integerOrNull(design.sample_count);
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

  const localQc = localQualityControlAnswer(text, reportContext);
  if (localQc) return localQc;
  const localDada2 = localDada2ParameterAnswer(text, reportContext);
  if (localDada2) return localDada2;
  return null;
}

export function projectChatContext(reportContext, profile, options = {}) {
  const message = String(options.message || "");
  const expanded = Boolean(options.expanded);
  const topic = String(options.topic || profile);
  const answerScope = String(options.answerScope || "report");
  const sections = reportContext?.sections || {};
  const projected = {
    context_schema_version: "1.0",
    report_id: String(reportContext?.report_id || ""),
    context_profile: profile,
    conversation_topic: topic,
    answer_scope: answerScope,
    sections: {},
    sources: filterSources(reportContext?.sources, profile)
  };

  if (!["methods", "methods_qc", "methods_dada2"].includes(profile)) {
    projected.study_design = compactStudyDesign(reportContext?.study_design);
  }

  if (profile === "study_design") {
    projected.sections.overview = pick(sections.overview, ["title", "summary"]);
  } else if (profile === "methods") {
    projected.sections.overview = pick(sections.overview, ["title", "pipeline_methods", "limitations"]);
  } else if (profile === "methods_qc" || profile === "methods_dada2") {
    projected.sections.overview = projectMethods(sections.overview, profile, expanded, answerScope);
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

  if (expanded && !["overview", "methods", "methods_qc", "methods_dada2", "study_design"].includes(profile)) {
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

function projectMethods(overview, profile, expanded, answerScope) {
  if (!overview || typeof overview !== "object") return undefined;
  const methods = overview.pipeline_methods;
  if (!methods || typeof methods !== "object") return pick(overview, ["title", "limitations"]);
  if (expanded) return pick(overview, ["title", "pipeline_methods", "limitations"]);

  if (profile === "methods_dada2") {
    const settings = extractMatchingSentences(methods.quality_control?.filtering_settings, /dada2|trunc|max(?:imum)? expected|\bmaxee\b/i);
    return {
      title: overview.title,
      pipeline_methods: {
        assay: methods.assay,
        sequencing_input: pick(methods.sequencing_input, ["read_type"]),
        quality_control: {
          filtering_settings: settings || methods.quality_control?.filtering_settings
        },
        feature_inference: pick(methods.feature_inference, ["input", "output", "tools_and_method", "description"])
      },
      concept_note: answerScope === "concept"
        ? "Explain general DADA2 mechanics directly; report parameters are supporting context only."
        : undefined
    };
  }

  return {
    title: overview.title,
    pipeline_methods: {
      assay: methods.assay,
      sequencing_input: pick(methods.sequencing_input, ["read_type", "raw_reads"]),
      primer_trimming: methods.primer_trimming,
      quality_control: methods.quality_control,
      feature_inference: pick(methods.feature_inference, ["input", "output", "tools_and_method", "description"])
    }
  };
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
    methods_qc: "overview",
    methods_dada2: "overview",
    overview: "overview",
    beta_statistics: "beta_diversity",
    beta_ordination: "beta_diversity",
    alpha_statistics: "alpha_diversity",
    taxonomy: "composition",
    functional_quality: "functional_prediction",
    functional_differential: "functional_prediction"
  }[profile];
  let rows = array(sources).filter((source) => String(source?.section || "") === section);
  if (profile === "methods_dada2") rows = rows.filter((source) => /method|parameter|filter|software|version/i.test(`${source?.id || ""} ${source?.label || ""}`));
  if (profile === "methods_qc") rows = rows.filter((source) => /read depth|filter|rarefaction|method|parameter|software|version/i.test(`${source?.id || ""} ${source?.label || ""}`));
  return rows.slice(0, profile.startsWith("methods_") ? 6 : 12);
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

function localQualityControlAnswer(text, context) {
  if (!/(?:\blist(?: down)?\b|\ball\b|\bbullet\s*points?\b|what).*(?:quality control|\bqc\b)|(?:quality control|\bqc\b).*(?:\blist\b|\ball\b|done|performed)/i.test(text)) return null;
  if (/\bwhy|how|theoret|algorithm|work\b/i.test(text)) return null;
  const methods = context?.sections?.overview?.pipeline_methods;
  if (!methods) return null;
  const bullets = [];
  const add = (value) => splitSentences(value).forEach((sentence) => {
    const clean = sentence.replace(/\s+/g, " ").trim();
    if (clean && !bullets.some((item) => normalizeSentence(item) === normalizeSentence(clean))) bullets.push(clean);
  });

  const trimTool = String(methods.primer_trimming?.tool || "").trim();
  if (trimTool) add(`Primer sequences were removed using ${trimTool}.`);
  add(methods.quality_control?.qc_tools);
  const filterTool = String(methods.quality_control?.filtering_tool || "").trim();
  if (filterTool) {
    const paired = /paired/i.test(String(methods.sequencing_input?.read_type || ""));
    add(`${paired ? "Paired-end reads" : "Reads"} were quality-filtered using ${filterTool}.`);
  }
  add(methods.quality_control?.filtering_settings);
  add(methods.feature_inference?.description);
  add(methods.feature_inference?.tools_and_method);

  const sourceText = array(context?.sources).map((source) => `${source?.id || ""} ${source?.label || ""}`).join(" ");
  if (/read depth/i.test(sourceText)) add("Read-depth summaries were included in the report.");
  if (/rarefaction/i.test(sourceText)) add("Rarefaction adequacy was assessed and included in the report.");
  if (!bullets.length) return null;
  return {
    answer: bullets.map((item) => `- ${ensurePeriod(item)}`).join("\n"),
    reportSourceIds: localMethodSourceIds(context, /read depth|filter|rarefaction|method|parameter|software|version/i),
    profile: "methods_qc"
  };
}

function localDada2ParameterAnswer(text, context) {
  if (!/(?:what|list|show|give).*(?:dada2).*(?:setting|parameter|threshold)|(?:dada2).*(?:setting|parameter|threshold).*(?:used|report|list)/i.test(text)) return null;
  if (/\bwhy|how|theoret|algorithm|work\b/i.test(text)) return null;
  const methods = context?.sections?.overview?.pipeline_methods;
  if (!methods) return null;
  const rows = [];
  const add = (value) => splitSentences(value).filter((sentence) => /dada2|trunc|max(?:imum)? expected|\bmaxee\b|chimera|asv/i.test(sentence)).forEach((sentence) => rows.push(ensurePeriod(sentence)));
  add(methods.quality_control?.filtering_settings);
  add(methods.feature_inference?.description);
  add(methods.feature_inference?.tools_and_method);
  const unique = rows.filter((row, index) => rows.findIndex((item) => normalizeSentence(item) === normalizeSentence(row)) === index);
  if (!unique.length) return null;
  return {
    answer: unique.map((item) => `- ${item}`).join("\n"),
    reportSourceIds: localMethodSourceIds(context, /method|parameter|filter|software|version/i),
    profile: "methods_dada2"
  };
}

function localMethodSourceIds(context, pattern) {
  const sources = array(context?.sources).filter((source) => pattern.test(`${source?.id || ""} ${source?.label || ""}`)).sort((a, b) => methodSourcePriority(a) - methodSourcePriority(b));
  return (sources.length ? sources : array(context?.sources)).slice(0, 5).map((source) => String(source.id || "")).filter(Boolean);
}

function methodSourcePriority(source) {
  const text = `${source?.id || ""} ${source?.label || ""}`;
  if (/read depth|filter|rarefaction/i.test(text)) return 0;
  if (/method|parameter/i.test(text)) return 1;
  return 2;
}

function extractMatchingSentences(value, pattern) {
  return splitSentences(value).filter((sentence) => pattern.test(sentence)).join(" ");
}

function splitSentences(value) {
  return String(value || "").split(/(?<=[.!?])\s+|\s*;\s*/).map((item) => item.trim()).filter(Boolean);
}

function normalizeSentence(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function ensurePeriod(value) {
  const text = String(value || "").trim();
  return /[.!?]$/.test(text) ? text : `${text}.`;
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
