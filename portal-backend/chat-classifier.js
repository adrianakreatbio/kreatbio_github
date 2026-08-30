const REPORT_RELATED = /\b(this|that|these|those|my|our)\b|report|result|chart|plot|table|sample|group|active|latent|control|p[- ]?value|fdr|effect size|significant|observation|what next/i;
const BIOINFORMATICS_RELATED = /microbi|bacter|fung|taxon|taxa|species|genus|family|phylum|organism|bioinform|genom|gene|dna|rna|protein|enzyme|metabol|pathway|kegg|\bko\b|\bec\b|picrust|nsti|diversity|shannon|simpson|faith|bray|unifrac|pcoa|permanova|permdisp|sequenc|amplicon|metagenom|transcriptom|laboratory|assay|replicate|abundance|quality|\bqc\b|fastp|fastqc|multiqc|adapter|trim|filter|phred|read|denois|dada2|deblur|qiime|mothur|chimera|dereplic|\basv\b|\botu\b|blast|align|classif|kraken|centrifuge|\bemu\b|silva|greengenes|aldex|deseq|ancom|lefse/i;
const EXTERNAL_RESEARCH = /\b(online|web|internet|latest|current|published|publication|paper|literature|citation|source|research says|known about|documentation|version)\b|average genome (size|length)|genome (size|length)|could .* explain|mechanism|biological role|associated with/i;
const CLEARLY_UNRELATED = /\b(weather|forecast|sport|football|soccer|basketball|cricket score|stock price|cryptocurrency|recipe|cooking|movie|music|celebrity|horoscope|video game|hotel|flight|shopping)\b/i;

export function classifyChatQuestion(message, history = []) {
  const text = String(message || "").trim();
  const recentContext = (Array.isArray(history) ? history : [])
    .slice(-4)
    .map((item) => String(item?.text || ""))
    .join(" ");
  const greeting = /^(hi|hello|hey|good morning|good afternoon|good evening|help)\b/i.test(text);
  const reportRelated = REPORT_RELATED.test(text);
  const biologyRelated = BIOINFORMATICS_RELATED.test(text);
  const contextRelated = REPORT_RELATED.test(recentContext) || BIOINFORMATICS_RELATED.test(recentContext);
  const externalResearch = EXTERNAL_RESEARCH.test(text);

  if (!greeting && !reportRelated && !biologyRelated && CLEARLY_UNRELATED.test(text)) return "out_of_scope";
  if (externalResearch && reportRelated) return "mixed";
  if (externalResearch && (biologyRelated || contextRelated)) return "web";
  if (externalResearch) return "web";
  return "report";
}
