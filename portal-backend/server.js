import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Storage } from "@google-cloud/storage";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 8080);
const GCS_BUCKET = process.env.GCS_BUCKET || "";
const GCS_CLIENT_PREFIX = cleanPrefix(process.env.GCS_CLIENT_PREFIX || "");
const GCS_ACCESS_TOKEN = process.env.GCS_ACCESS_TOKEN || "";
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS || 60 * 60 * 8);
const DATA_TEXT_LIMIT = Number(process.env.DATA_TEXT_LIMIT || 5 * 1024 * 1024);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const PORTAL_ORIGIN = process.env.PORTAL_ORIGIN || "*";
const PORTAL_ORIGINS = PORTAL_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
const PORTAL_API_BASE = cleanUrl(process.env.PORTAL_API_BASE || "");
const STATIC_DIR = process.env.PORTAL_STATIC_DIR || path.join(__dirname, "public");
const ALLOW_CLIENT_DOWNLOADS = /^(1|true|yes)$/i.test(process.env.ALLOW_CLIENT_DOWNLOADS || "");
const FIGURE_PREFIXES = [
  "output/o6_figures/",
  "output/o4_diversity/"
];

if (!GCS_BUCKET) {
  console.warn("GCS_BUCKET is not set. API routes that read reports will fail until configured.");
}
if (GCS_ACCESS_TOKEN) {
  console.warn("Using GCS_ACCESS_TOKEN for local testing. Do not use short-lived user tokens in production.");
}
if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  console.warn("SESSION_SECRET should be set to a random value with at least 32 characters.");
}

const storage = new Storage();
const app = express();

app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(express.json({ limit: "1mb" }));
app.use(corsMiddleware);

app.get(["/", "/client-portal.html"], servePortal);

if (fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR, { extensions: ["html"] }));
}

const repoSupplementsDir = path.resolve(__dirname, "..", "supplements");
if (fs.existsSync(repoSupplementsDir)) {
  app.use("/supplements", express.static(repoSupplementsDir));
}
const repoClientSupplementsDir = path.resolve(__dirname, "..", "client_supplements");
if (fs.existsSync(repoClientSupplementsDir)) {
  app.use("/client_supplements", express.static(repoClientSupplementsDir));
}

app.get("/healthz", (req, res) => {
  res.json({ ok: true, service: "kreatbio-client-portal" });
});

app.post("/api/session", async (req, res, next) => {
  try {
    const code = normalizeCode(req.body?.code);
    const manifest = await readManifest(code);
    validateManifestCode(code, manifest);
    const token = signToken({ code });
    res.json({ token, report: sanitizeManifest(code, manifest) });
  } catch (err) {
    next(err);
  }
});

app.get("/api/report", requireSession, async (req, res, next) => {
  try {
    const manifest = await readManifest(req.session.code);
    validateManifestCode(req.session.code, manifest);
    res.json(sanitizeManifest(req.session.code, manifest));
  } catch (err) {
    next(err);
  }
});

app.get("/api/files/:fileId", requireSession, async (req, res, next) => {
  try {
    const manifest = await readManifest(req.session.code);
    const file = findFile(manifest, req.params.fileId);
    if (isForbiddenClientDownload(file)) {
      throw httpError(403, "This file type is not downloadable from the client portal.");
    }
    if (!ALLOW_CLIENT_DOWNLOADS) {
      throw httpError(403, "Client file downloads are disabled for this portal.");
    }
    const objectName = objectPath(req.session.code, file.path);
    if (!(await gcsObjectExists(objectName))) {
      throw httpError(404, "Requested file is not available in this report folder.");
    }
    res.setHeader("Content-Type", contentType(file));
    res.setHeader("Content-Disposition", `attachment; filename="${safeDownloadName(file)}"`);
    if (GCS_ACCESS_TOKEN) {
      const buffer = await gcsDownloadBuffer(objectName);
      res.end(buffer);
      return;
    }
    storage.bucket(GCS_BUCKET).file(objectName).createReadStream().on("error", next).pipe(res);
  } catch (err) {
    next(err);
  }
});

app.get("/api/files/:fileId/view", requireSession, async (req, res, next) => {
  try {
    const manifest = await readManifest(req.session.code);
    const file = findFile(manifest, req.params.fileId);
    if (!canInlineView(file)) {
      throw httpError(403, "This file is not available for inline viewing.");
    }
    const objectName = objectPath(req.session.code, file.path);
    if (!(await gcsObjectExists(objectName))) {
      throw httpError(404, "Requested file is not available in this report folder.");
    }
    res.setHeader("Content-Type", contentType(file));
    res.setHeader("Content-Disposition", `inline; filename="${safeDownloadName(file)}"`);
    if (GCS_ACCESS_TOKEN) {
      const buffer = await gcsDownloadBuffer(objectName);
      res.end(buffer);
      return;
    }
    storage.bucket(GCS_BUCKET).file(objectName).createReadStream().on("error", next).pipe(res);
  } catch (err) {
    next(err);
  }
});

app.get("/api/files/:fileId/text", requireSession, async (req, res, next) => {
  try {
    const manifest = await readManifest(req.session.code);
    const file = findFile(manifest, req.params.fileId);
    const loaded = await readTextFile(req.session.code, file);
    res.json({ file: publicFile(file), text: loaded.text, truncated: loaded.truncated });
  } catch (err) {
    next(err);
  }
});

app.post("/api/modules/:moduleId/run", requireSession, async (req, res, next) => {
  try {
    const manifest = await readManifest(req.session.code);
    const modules = supportedModules(manifest);
    const module = modules.find((item) => item.id === req.params.moduleId);
    if (!module) {
      throw httpError(404, "This analysis module is not enabled for the current report.");
    }

    const files = selectModuleFiles(manifest, module);
    const loadedFiles = [];
    for (const file of files) {
      if (shouldLoadTextForModule(module, file)) {
        const loaded = await readTextFile(req.session.code, file);
        loadedFiles.push({ ...publicFile(file), text: loaded.text, truncated: loaded.truncated });
      } else {
        loadedFiles.push(publicFile(file));
      }
    }

    res.json({
      module: publicModule(module),
      files: loadedFiles,
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

app.post("/api/export", requireSession, async (req, res) => {
  res.json({
    ok: true,
    note: "Client-side PNG and PDF export is enabled in client-portal.html. Server-side export can be added here if batch rendering is needed."
  });
});

app.get("/api/external/ncbi/search", requireSession, async (req, res, next) => {
  try {
    const db = safeExternalParam(req.query.db || "nucleotide", /^[A-Za-z0-9_]+$/);
    const term = String(req.query.term || "").trim();
    if (!term) {
      throw httpError(400, "Missing NCBI search term.");
    }
    const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
    url.searchParams.set("db", db);
    url.searchParams.set("term", term);
    url.searchParams.set("retmode", "json");
    url.searchParams.set("retmax", String(Math.min(Number(req.query.retmax || 20), 100)));
    const data = await fetchJson(url);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

app.get("/api/external/kegg/find", requireSession, async (req, res, next) => {
  try {
    const database = safeExternalParam(req.query.database || "genes", /^[A-Za-z0-9_]+$/);
    const query = String(req.query.query || "").trim();
    if (!query) {
      throw httpError(400, "Missing KEGG query.");
    }
    const text = await fetchText(`https://rest.kegg.jp/find/${encodeURIComponent(database)}/${encodeURIComponent(query)}`);
    res.type("text/plain").send(text);
  } catch (err) {
    next(err);
  }
});

app.post("/api/external/string/network", requireSession, async (req, res, next) => {
  try {
    const identifiers = Array.isArray(req.body?.identifiers) ? req.body.identifiers : [];
    const species = String(req.body?.species || "9606").replace(/[^0-9]/g, "") || "9606";
    const cleanIds = identifiers.map((value) => String(value).trim()).filter(Boolean).slice(0, 100);
    if (!cleanIds.length) {
      throw httpError(400, "At least one STRING identifier is required.");
    }
    const url = new URL("https://string-db.org/api/json/network");
    url.searchParams.set("identifiers", cleanIds.join("\r"));
    url.searchParams.set("species", species);
    const data = await fetchJson(url);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

app.post("/api/chat", requireSession, async (req, res, next) => {
  try {
    if (!GEMINI_API_KEY) {
      throw httpError(503, "Gemini chat is not configured on the portal backend.");
    }
    const message = String(req.body?.message || "").trim();
    if (!message) {
      throw httpError(400, "Missing chat message.");
    }

    const manifest = sanitizeManifest(req.session.code, await readManifest(req.session.code));
    const prompt = buildChatPrompt({
      manifest,
      message,
      activeModule: req.body?.activeModule,
      activeResultSummary: req.body?.activeResultSummary
    });
    const reply = await callGemini(prompt);
    res.json({ reply });
  } catch (err) {
    next(err);
  }
});

app.use((req, res, next) => {
  next(httpError(404, "Route not found."));
});

app.use((err, req, res, next) => {
  const status = err.statusCode || err.status || 500;
  const message = status >= 500 ? "Portal backend error." : err.message;
  if (status >= 500) {
    console.error(err);
  }
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`KreatBio client portal backend listening on ${PORT}`);
  if (GCS_BUCKET) {
    console.log(`GCS report root: gs://${GCS_BUCKET}/${GCS_CLIENT_PREFIX ? `${GCS_CLIENT_PREFIX}/` : ""}<CODE>/`);
  }
});

function corsMiddleware(req, res, next) {
  const origin = corsOrigin(req.headers.origin);
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

function corsOrigin(requestOrigin) {
  if (PORTAL_ORIGINS.includes("*")) {
    return "*";
  }
  if (!requestOrigin) {
    return PORTAL_ORIGINS[0] || "";
  }
  const normalizedRequestOrigin = requestOrigin.replace(/\/+$/, "");
  return PORTAL_ORIGINS.find((origin) => origin.replace(/\/+$/, "") === normalizedRequestOrigin) || "";
}

async function servePortal(req, res, next) {
  try {
    const target = portalHtmlPath();
    if (!target) {
      next();
      return;
    }
    const apiBase = PORTAL_API_BASE || requestOrigin(req);
    const html = (await fs.promises.readFile(target, "utf8")).replace(
      'window.KREATBIO_PORTAL_API = "";',
      `window.KREATBIO_PORTAL_API = ${JSON.stringify(apiBase)};`
    );
    res.type("html").send(html);
  } catch (err) {
    next(err);
  }
}

function portalHtmlPath() {
  const staticPortal = path.join(STATIC_DIR, "client-portal.html");
  const repoPortal = path.resolve(__dirname, "..", "client-portal.html");
  if (fs.existsSync(staticPortal)) {
    return staticPortal;
  }
  if (fs.existsSync(repoPortal)) {
    return repoPortal;
  }
  return "";
}

function requestOrigin(req) {
  return cleanUrl(`${req.protocol}://${req.get("host")}`);
}

function cleanUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeCode(input) {
  const code = String(input || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{9}$/.test(code)) {
    throw httpError(400, "Enter a valid 9-character report code.");
  }
  return code;
}

async function readManifest(code) {
  const objectName = objectPath(code, "manifest.json");
  if (!(await gcsObjectExists(objectName))) {
    return inferAmpliconManifest(code);
  }
  const buffer = await gcsDownloadBuffer(objectName);
  try {
    return addInferredFigureFiles(code, JSON.parse(buffer.toString("utf8")));
  } catch {
    throw httpError(500, "Report manifest is not valid JSON.");
  }
}

async function inferAmpliconManifest(code) {
  const reportPath = await firstExistingPath(code, ["output/report.pdf"]);
  const files = [];

  const knownTables = [
    { id: "metadata", name: "Sample metadata", path: "input_data/metadata.tsv", role: "metadata", roles: ["metadata", "sample", "table"], type: "tsv" },
    { id: "read-depth-summary", name: "Read depth summary", path: "output/o1_qc/read_depth_summary.tsv", role: "qc", roles: ["qc", "read_depth", "summary", "table"], type: "tsv" },
    { id: "filtering-summary", name: "Filtering summary", path: "output/o1_qc/filtering_summary.tsv", role: "qc", roles: ["qc", "filtering", "summary", "table"], type: "tsv" },
    { id: "rarefaction-adequacy", name: "Rarefaction adequacy", path: "output/o1_qc/rarefaction_adequacy.tsv", role: "qc", roles: ["qc", "rarefaction", "summary", "table"], type: "tsv" },
    { id: "selected-sampling-depth", name: "Selected sampling depth", path: "output/o1_qc/selected_sampling_depth.tsv", role: "qc", roles: ["qc", "sampling_depth", "table"], type: "tsv" },
    {
      id: "species-relative-abundance",
      name: "Species relative abundance",
      path: "output/o2_taxonomy_qiime2_silva/species_relative_abundance.tsv",
      role: "taxonomy",
      roles: ["taxonomy", "species", "relative_abundance"],
      type: "tsv"
    },
    {
      id: "genus-relative-abundance",
      name: "Genus relative abundance",
      path: "output/o2_taxonomy_qiime2_silva/genus_relative_abundance.tsv",
      role: "taxonomy",
      roles: ["taxonomy", "genus", "relative_abundance"],
      type: "tsv"
    },
    {
      id: "family-relative-abundance",
      name: "Family relative abundance",
      path: "output/o2_taxonomy_qiime2_silva/family_relative_abundance.tsv",
      role: "taxonomy",
      roles: ["taxonomy", "family", "relative_abundance"],
      type: "tsv"
    },
    { id: "phylum-relative-abundance", name: "Phylum relative abundance", path: "output/o2_taxonomy_qiime2_silva/phylum_relative_abundance.tsv", role: "taxonomy", roles: ["taxonomy", "phylum", "relative_abundance"], type: "tsv" },
    { id: "species-counts", name: "Species counts", path: "output/o2_taxonomy_qiime2_silva/species_counts.tsv", role: "taxonomy_counts", roles: ["taxonomy", "species", "counts", "table"], type: "tsv" },
    { id: "genus-counts", name: "Genus counts", path: "output/o2_taxonomy_qiime2_silva/genus_counts.tsv", role: "taxonomy_counts", roles: ["taxonomy", "genus", "counts", "table"], type: "tsv" },
    { id: "family-counts", name: "Family counts", path: "output/o2_taxonomy_qiime2_silva/family_counts.tsv", role: "taxonomy_counts", roles: ["taxonomy", "family", "counts", "table"], type: "tsv" },
    { id: "phylum-counts", name: "Phylum counts", path: "output/o2_taxonomy_qiime2_silva/phylum_counts.tsv", role: "taxonomy_counts", roles: ["taxonomy", "phylum", "counts", "table"], type: "tsv" },
    { id: "taxonomy-table", name: "Taxonomy assignments", path: "output/o2_taxonomy_qiime2_silva/taxonomy.tsv", role: "taxonomy_assignments", roles: ["taxonomy", "assignments", "table"], type: "tsv" },
    {
      id: "taxon-filter-summary",
      name: "Taxon filter summary",
      path: "output/o2_taxonomy_qiime2_silva/taxon_filter_summary.tsv",
      role: "taxonomy_summary",
      roles: ["taxonomy_summary", "filter_summary", "taxonomy", "table"],
      type: "tsv"
    },
    { id: "bacterial-filter-summary", name: "Bacterial filter summary", path: "output/o2_taxonomy_qiime2_silva/bacterial_filter_summary.tsv", role: "taxonomy_summary", roles: ["taxonomy_summary", "filter_summary", "taxonomy", "table"], type: "tsv" },
    { id: "emu-family-relative-abundance", name: "EMU family relative abundance", path: "output/o3_taxonomy_emu_species/emu_family_relative_abundance.tsv", role: "taxonomy", roles: ["taxonomy", "emu", "family", "relative_abundance"], type: "tsv" },
    { id: "emu-genus-relative-abundance", name: "EMU genus relative abundance", path: "output/o3_taxonomy_emu_species/emu_genus_relative_abundance.tsv", role: "taxonomy", roles: ["taxonomy", "emu", "genus", "relative_abundance"], type: "tsv" },
    { id: "emu-species-relative-abundance", name: "EMU species relative abundance", path: "output/o3_taxonomy_emu_species/emu_species_relative_abundance.tsv", role: "taxonomy", roles: ["taxonomy", "emu", "species", "relative_abundance"], type: "tsv" },
    { id: "emu-species-abundance", name: "EMU species abundance", path: "output/o3_taxonomy_emu_species/emu_species_abundance.tsv", role: "taxonomy_counts", roles: ["taxonomy", "emu", "species", "abundance", "counts", "table"], type: "tsv" },
    { id: "emu-species-reportable", name: "EMU reportable species", path: "output/o3_taxonomy_emu_species/emu_species_reportable.tsv", role: "taxonomy_summary", roles: ["taxonomy_summary", "emu", "species", "reportable", "table"], type: "tsv" },
    { id: "emu-aldex2-family", name: "EMU ALDEx2 family statistics", path: "output/o3_taxonomy_emu_species/emu_aldex2_family.tsv", role: "differential_abundance", roles: ["differential_abundance", "taxonomy", "emu", "aldex2", "family", "stats", "table"], type: "tsv" },
    { id: "emu-aldex2-genus", name: "EMU ALDEx2 genus statistics", path: "output/o3_taxonomy_emu_species/emu_aldex2_genus.tsv", role: "differential_abundance", roles: ["differential_abundance", "taxonomy", "emu", "aldex2", "genus", "stats", "table"], type: "tsv" },
    { id: "emu-aldex2-species", name: "EMU ALDEx2 species statistics", path: "output/o3_taxonomy_emu_species/emu_aldex2_species.tsv", role: "differential_abundance", roles: ["differential_abundance", "taxonomy", "emu", "aldex2", "species", "stats", "table"], type: "tsv" },
    { id: "emu-aldex2-status", name: "EMU ALDEx2 status", path: "output/o3_taxonomy_emu_species/emu_aldex2_status.tsv", role: "differential_summary", roles: ["differential", "taxonomy", "emu", "aldex2", "status", "summary", "table"], type: "tsv" },
    {
      id: "alpha-diversity",
      name: "Alpha diversity",
      path: "output/o4_diversity/alpha_diversity.tsv",
      role: "alpha_diversity",
      type: "tsv"
    },
    {
      id: "alpha-group-test",
      name: "Alpha diversity group test",
      path: "output/o4_diversity/alpha_group_test.tsv",
      role: "stats",
      roles: ["stats", "alpha_stats", "diversity_stats"],
      type: "tsv"
    },
    {
      id: "pcoa-coordinates",
      name: "PCoA coordinates",
      path: "output/o4_diversity/pcoa_coordinates.tsv",
      role: "ordination",
      roles: ["ordination", "beta_diversity", "pcoa"],
      type: "tsv"
    },
    { id: "unweighted-unifrac-pcoa-coordinates", name: "Unweighted UniFrac PCoA coordinates", path: "output/o4_diversity/unweighted_unifrac_pcoa_coordinates.tsv", role: "ordination", roles: ["ordination", "beta_diversity", "pcoa", "unweighted_unifrac"], type: "tsv" },
    { id: "weighted-unifrac-pcoa-coordinates", name: "Weighted UniFrac PCoA coordinates", path: "output/o4_diversity/weighted_unifrac_pcoa_coordinates.tsv", role: "ordination", roles: ["ordination", "beta_diversity", "pcoa", "weighted_unifrac"], type: "tsv" },
    {
      id: "beta-braycurtis-distance",
      name: "Bray-Curtis distance matrix",
      path: "output/o4_diversity/beta_braycurtis_distance.tsv",
      role: "distance_matrix",
      roles: ["distance_matrix", "beta_diversity", "braycurtis"],
      type: "tsv"
    },
    { id: "unweighted-unifrac-distance", name: "Unweighted UniFrac distance matrix", path: "output/o4_diversity/unweighted_unifrac_distance.tsv", role: "distance_matrix", roles: ["distance_matrix", "beta_diversity", "unweighted_unifrac"], type: "tsv" },
    { id: "weighted-unifrac-distance", name: "Weighted UniFrac distance matrix", path: "output/o4_diversity/weighted_unifrac_distance.tsv", role: "distance_matrix", roles: ["distance_matrix", "beta_diversity", "weighted_unifrac"], type: "tsv" },
    { id: "beta-braycurtis-diagnostics", name: "Bray-Curtis diagnostics", path: "output/o4_diversity/beta_braycurtis_diagnostics.tsv", role: "stats", roles: ["stats", "beta_stats", "diagnostics", "braycurtis"], type: "tsv" },
    {
      id: "permanova",
      name: "PERMANOVA results",
      path: "output/o4_diversity/permanova.tsv",
      role: "stats",
      roles: ["stats", "permanova", "beta_stats"],
      type: "tsv"
    },
    {
      id: "permdisp",
      name: "PERMDISP results",
      path: "output/o4_diversity/permdisp.tsv",
      role: "stats",
      roles: ["stats", "permdisp", "beta_stats"],
      type: "tsv"
    },
    { id: "faith-pd", name: "Faith phylogenetic diversity", path: "output/o4_diversity/faith_pd.tsv", role: "alpha_diversity", roles: ["alpha_diversity", "faith_pd"], type: "tsv" },
    { id: "observed-features", name: "Observed features", path: "output/o4_diversity/observed_features.tsv", role: "alpha_diversity", roles: ["alpha_diversity", "observed_features"], type: "tsv" },
    { id: "pielou-evenness", name: "Pielou evenness", path: "output/o4_diversity/pielou_evenness.tsv", role: "alpha_diversity", roles: ["alpha_diversity", "pielou_evenness"], type: "tsv" },
    { id: "phylogenetic-diversity-summary", name: "Phylogenetic diversity summary", path: "output/o4_diversity/phylogenetic_diversity_summary.tsv", role: "alpha_diversity", roles: ["alpha_diversity", "phylogenetic"], type: "tsv" },
    {
      id: "functional-summary",
      name: "Functional prediction summary",
      path: "output/o5_functional_prediction_picrust2/functional_summary.tsv",
      role: "functional_summary",
      roles: ["functional_summary", "functional", "picrust2", "table"],
      type: "tsv"
    },
    {
      id: "marker-nsti",
      name: "Marker NSTI",
      path: "output/o5_functional_prediction_picrust2/marker_nsti.tsv",
      role: "nsti",
      roles: ["nsti", "functional_quality", "picrust2"],
      type: "tsv"
    },
    {
      id: "nsti-per-sample",
      name: "NSTI per sample",
      path: "output/o5_functional_prediction_picrust2/nsti_per_sample.tsv",
      role: "nsti",
      roles: ["nsti", "functional_quality", "picrust2"],
      type: "tsv"
    },
    {
      id: "ko-abundance",
      name: "KO abundance",
      path: "output/o5_functional_prediction_picrust2/ko_abundance.tsv",
      role: "functional",
      roles: ["functional", "kegg", "ko"],
      type: "tsv"
    },
    {
      id: "pathway-abundance",
      name: "Pathway abundance",
      path: "output/o5_functional_prediction_picrust2/pathway_abundance.tsv",
      role: "functional",
      roles: ["functional", "pathway", "kegg"],
      type: "tsv"
    },
    {
      id: "ec-abundance",
      name: "EC abundance",
      path: "output/o5_functional_prediction_picrust2/ec_abundance.tsv",
      role: "functional",
      roles: ["functional", "enzyme", "ec"],
      type: "tsv"
    },
    { id: "enzyme-ec-abundance", name: "Enzyme EC abundance", path: "output/o5_functional_prediction_picrust2/enzyme_ec_abundance.tsv", role: "functional", roles: ["functional", "enzyme", "ec"], type: "tsv" },
    { id: "functional-aldex2-ec", name: "Functional ALDEx2 EC statistics", path: "output/o5_functional_prediction_picrust2/functional_aldex2_ec.tsv", role: "differential", roles: ["differential", "functional", "aldex2", "ec", "enzyme", "stats", "table"], type: "tsv" },
    { id: "functional-aldex2-ko", name: "Functional ALDEx2 KO statistics", path: "output/o5_functional_prediction_picrust2/functional_aldex2_ko.tsv", role: "differential", roles: ["differential", "functional", "aldex2", "ko", "kegg", "stats", "table"], type: "tsv" },
    { id: "functional-aldex2-pathway", name: "Functional ALDEx2 pathway statistics", path: "output/o5_functional_prediction_picrust2/functional_aldex2_pathway.tsv", role: "differential", roles: ["differential", "functional", "aldex2", "pathway", "stats", "table"], type: "tsv" },
    { id: "functional-aldex2-status", name: "Functional ALDEx2 status", path: "output/o5_functional_prediction_picrust2/functional_aldex2_status.tsv", role: "differential_summary", roles: ["differential", "functional", "aldex2", "status", "summary", "table"], type: "tsv" },
    { id: "methods-auto", name: "Methods auto-draft", path: "output/o7_run_metadata/methods_auto.md", role: "methods", roles: ["methods", "metadata", "markdown"], type: "md" },
    { id: "software-versions", name: "Software versions", path: "output/o7_run_metadata/software_versions.tsv", role: "software_versions", roles: ["software", "versions", "metadata"], type: "tsv" },
    { id: "params-snapshot", name: "Parameters snapshot", path: "output/o7_run_metadata/params_snapshot.yaml", role: "params", roles: ["params", "metadata", "yaml"], type: "yaml" },
    { id: "citations", name: "Citations", path: "output/o7_run_metadata/citations.tsv", role: "citations", roles: ["citations", "metadata"], type: "tsv" }
  ];

  for (const table of knownTables) {
    if (await objectExists(code, table.path)) {
      files.push(table);
    }
  }

  const figures = await listFigureFiles(code);
  files.push(...figures);

  if (!reportPath && files.length === 0) {
    throw httpError(404, "No released report folder was found for this code.");
  }

  return {
    code,
    client_name: `Client ${code}`,
    title: "Amplicon microbiome report",
    description: "Released charts are shown first. Processed taxonomy, diversity, and functional tables are available for exploration.",
    analysis_type: "amplicon",
    created_at: "",
    inferred: true,
    report_pdf: reportPath ? {
      fileId: "report",
      name: "KreatBio amplicon report.pdf",
      path: reportPath
    } : null,
    files
  };
}

async function firstExistingPath(code, relativePaths) {
  for (const relativePath of relativePaths) {
    if (await objectExists(code, relativePath)) {
      return relativePath;
    }
  }
  return "";
}

async function objectExists(code, relativePath) {
  return gcsObjectExists(objectPath(code, relativePath));
}

async function listFigureFiles(code) {
  const seen = new Set();
  const objectNames = [];
  for (const relativePrefix of FIGURE_PREFIXES) {
    const names = await gcsListObjectNames(objectPath(code, relativePrefix));
    for (const name of names) {
      if (!seen.has(name)) {
        seen.add(name);
        objectNames.push(name);
      }
    }
  }
  return objectNames
    .filter((name) => /\.(png|jpg|jpeg|webp)$/i.test(name))
    .sort()
    .slice(0, 80)
    .map((name) => {
      const relativePath = cleanRelativePath(name);
      const base = path.basename(relativePath);
      const sourceTableId = figureSourceTableId(base, relativePath);
      return {
        id: safeId(`figure-${relativePath.replace(/\.[^.]+$/, "")}`),
        name: humanizeFileName(base),
        path: relativePath,
        role: "figure",
        roles: ["figure", "chart", "png"],
        type: path.extname(base).slice(1).toLowerCase() || "png",
        format: path.extname(base).slice(1).toLowerCase() || "png",
        description: "Released pipeline chart",
        ...(sourceTableId ? { source_table_id: sourceTableId } : {})
      };
    });
}

function figureSourceTableId(base, relativePath) {
  const text = `${base || ""} ${relativePath || ""}`.toLowerCase();
  if (/phylogenetic[_ -]?tree|tree/.test(text)) {
    return "";
  }
  if (/\bemu\b|emu[_ -]/.test(text)) {
    if (/aldex2|volcano/.test(text)) {
      if (/species/.test(text)) {
        return "emu-aldex2-species";
      }
      if (/genus|genera/.test(text)) {
        return "emu-aldex2-genus";
      }
      if (/family|families/.test(text)) {
        return "emu-aldex2-family";
      }
      return "";
    }
    if (/pcoa|strength/.test(text)) {
      return "";
    }
    if (/species/.test(text)) {
      return "emu-species-relative-abundance";
    }
    if (/genus|genera/.test(text)) {
      return "emu-genus-relative-abundance";
    }
    if (/family|families/.test(text)) {
      return "emu-family-relative-abundance";
    }
    return "";
  }
  if (/taxa.*species|species.*taxa/.test(text)) {
    return "species-relative-abundance";
  }
  if (/genus|genera/.test(text)) {
    return "genus-relative-abundance";
  }
  if (/family|families/.test(text)) {
    return "family-relative-abundance";
  }
  if (/phylum|phyla/.test(text)) {
    return "phylum-relative-abundance";
  }
  return "";
}

async function addInferredFigureFiles(code, manifest) {
  const files = normalizeFiles(manifest);
  if (files.some(isImageFile)) {
    return manifest;
  }
  const figures = await listFigureFiles(code);
  if (!figures.length) {
    return manifest;
  }
  return {
    ...manifest,
    files: [...files, ...figures]
  };
}

function validateManifestCode(code, manifest) {
  if (manifest.code && String(manifest.code).toUpperCase() !== code) {
    throw httpError(403, "Report manifest code does not match the requested folder.");
  }
}

function sanitizeManifest(code, manifest) {
  const files = normalizeFiles(manifest).map(publicFile);
  const modules = supportedModules(manifest).map(publicModule);
  return {
    code,
    client_name: manifest.client_name || manifest.client || "KreatBio client",
    title: manifest.title || "",
    description: manifest.description || "",
    analysis_type: manifest.analysis_type || "general",
    created_at: manifest.created_at || manifest.released_at || "",
    released_at: manifest.released_at || manifest.created_at || "",
    inferred: Boolean(manifest.inferred),
    samples: manifest.samples || null,
    report_pdf: manifest.report_pdf ? publicReportPdf(manifest.report_pdf) : defaultReportPdf(files),
    files,
    modules
  };
}

function signToken(payload) {
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat: now,
    exp: now + SESSION_TTL_SECONDS
  };
  const encoded = base64url(JSON.stringify(body));
  const sig = hmac(encoded);
  return `${encoded}.${sig}`;
}

function verifyToken(token) {
  const [encoded, sig] = String(token || "").split(".");
  if (!encoded || !sig || hmac(encoded) !== sig) {
    throw httpError(401, "Invalid or expired session.");
  }
  let body;
  try {
    body = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw httpError(401, "Invalid session.");
  }
  if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) {
    throw httpError(401, "Session expired.");
  }
  return { code: normalizeCode(body.code) };
}

function requireSession(req, res, next) {
  try {
    const header = req.get("authorization") || "";
    const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7) : req.query.token;
    req.session = verifyToken(token);
    next();
  } catch (err) {
    next(err);
  }
}

function hmac(value) {
  return crypto.createHmac("sha256", SESSION_SECRET || "development-only-secret-change-me")
    .update(value)
    .digest("base64url");
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function normalizeFiles(manifest) {
  const files = Array.isArray(manifest.files) ? manifest.files : Object.entries(manifest.files || {}).map(([id, value]) => ({ id, ...value }));
  return files
    .filter((file) => file && (file.path || file.gcs_path))
    .map((file) => ({
      id: safeId(file.id || file.fileId || file.role || path.basename(file.path || file.gcs_path)),
      name: file.name || file.label || path.basename(file.path || file.gcs_path),
      path: cleanRelativePath(file.path || file.gcs_path),
      role: file.role || "",
      roles: Array.isArray(file.roles) ? file.roles : [],
      type: file.type || file.format || "",
      format: file.format || file.type || "",
      description: file.description || ""
    }));
}

function supportedModules(manifest) {
  const files = normalizeFiles(manifest);
  const declared = Array.isArray(manifest.modules) && manifest.modules.length
    ? manifest.modules
    : defaultModules(manifest.analysis_type);
  return declared
    .filter((module) => module && module.enabled !== false)
    .map((module) => ({
      id: safeId(module.id || module.label),
      label: module.label || module.name || module.id,
      kind: module.kind || guessKind(module.id || module.label || ""),
      description: module.description || "",
      requires: Array.isArray(module.requires) ? module.requires.map(String) : []
    }))
    .filter((module) => {
      if (!module.requires.length) {
        return true;
      }
      return module.requires.some((role) => files.some((file) => fileMatchesRole(file, role)));
    });
}

function defaultModules(type) {
  const key = String(type || "general").toLowerCase();
  if (key.includes("amplicon") || key.includes("microbiome")) {
    return [
      { id: "released-figures", label: "Released charts", kind: "figures", requires: ["figure"], description: "Existing pipeline charts; not regenerated" },
      { id: "qc-summary", label: "QC summary", kind: "qc_summary", requires: ["pipeline_log", "metadata", "taxonomy", "feature_table"], description: "Run status, sample counts, and available QC signals" },
      { id: "taxonomy-explorer", label: "Taxonomy explorer", kind: "taxonomy_explorer", requires: ["taxonomy"], description: "Interactive top taxa from abundance tables" },
      { id: "sample-overview", label: "Sample overview", kind: "sample_summary", requires: ["metadata"], description: "Generated from sample metadata" },
      { id: "metadata-validator", label: "Metadata validator", kind: "metadata_validator", requires: ["metadata"], description: "Checks grouping, control, source, and timepoint columns" },
      { id: "taxonomy-summary", label: "Taxonomy summary", kind: "taxonomy_summary", requires: ["taxonomy_summary"], description: "Generated from filter and taxonomy summary tables" },
      { id: "taxon-detail", label: "Taxon detail", kind: "taxon_detail", requires: ["taxonomy"], description: "Selected taxa with abundance and reference links" },
      { id: "indicator-taxa", label: "Indicator taxa", kind: "indicator_taxa", requires: ["taxonomy"], description: "Curated taxa of interest screening" },
      { id: "core-microbiome", label: "Core microbiome", kind: "core_microbiome", requires: ["taxonomy"], description: "Taxa shared across most samples" },
      { id: "rare-taxa", label: "Rare taxa", kind: "rare_taxa", requires: ["taxonomy"], description: "Low-abundance taxa hidden from top charts" },
      { id: "diversity-statistics", label: "Diversity statistics", kind: "stats", requires: ["alpha_stats", "beta_stats"], description: "Generated from alpha/beta statistical outputs" },
      { id: "diversity-interpretation", label: "Diversity interpretation", kind: "diversity_interpretation", requires: ["alpha_diversity", "ordination", "alpha_stats", "beta_stats"], description: "Diversity metrics with method notes" },
      { id: "beta-distance-matrix", label: "Distance matrix", kind: "distance", requires: ["distance_matrix"], description: "Generated from Bray-Curtis distances" },
      { id: "differential-abundance", label: "Differential abundance", kind: "differential_abundance", requires: ["taxonomy", "metadata"], description: "Group-aware fold-change exploration" },
      { id: "cooccurrence-network", label: "Co-occurrence network", kind: "cooccurrence", requires: ["taxonomy"], description: "Exploratory taxon correlation network" },
      { id: "source-tracking", label: "Source tracking", kind: "source_tracking", requires: ["taxonomy", "metadata"], description: "Checks readiness for SourceTracker-style analysis" },
      { id: "contamination-screen", label: "Contamination screen", kind: "contamination", requires: ["taxonomy", "metadata"], description: "Checks controls and likely contaminant signals" },
      { id: "longitudinal-trends", label: "Longitudinal trends", kind: "longitudinal", requires: ["taxonomy", "metadata"], description: "Timepoint-aware trend exploration" },
      { id: "functional-prediction", label: "Functional prediction", kind: "functional_summary", requires: ["functional_summary", "nsti"], description: "Generated from PICRUSt2-like prediction outputs" },
      { id: "pathway-coverage", label: "Pathway coverage", kind: "coverage", requires: ["coverage"], description: "Generated from pathway coverage tables" },
      { id: "contribution-analysis", label: "Contribution analysis", kind: "contribution", requires: ["contribution"], description: "Generated from KO/pathway/EC contribution tables" },
      { id: "differential-functions", label: "Differential functions", kind: "differential", requires: ["differential"], description: "Generated from ALDEx2 functional statistics" },
      { id: "chart-builder", label: "Chart builder", kind: "chart_builder", requires: ["table"], description: "Build exportable charts from available TSV files" },
      { id: "result-table", label: "Result table", kind: "table", requires: ["taxonomy"], description: "Processed TSV preview" }
    ];
  }
  if (key.includes("wgs")) {
    return [
      { id: "wgs-tree", label: "Phylogenetic tree", kind: "tree", requires: ["tree"], description: "Tree view" },
      { id: "wgs-gene-annotation", label: "Gene annotation", kind: "annotation", requires: ["gene_annotation"], description: "Gene category summary" },
      { id: "wgs-protein-annotation", label: "Protein annotation", kind: "annotation", requires: ["protein_annotation"], description: "Protein function summary" },
      { id: "wgs-kegg", label: "KEGG pathways", kind: "annotation", requires: ["kegg"], description: "Pathway summary" },
      { id: "wgs-qc", label: "Genome QC", kind: "table", requires: ["qc"], description: "QC table preview" }
    ];
  }
  return [
    { id: "annotation-genes", label: "Gene annotation", kind: "annotation", requires: ["gene_annotation"], description: "Gene category summary" },
    { id: "annotation-proteins", label: "Protein annotation", kind: "annotation", requires: ["protein_annotation"], description: "Protein category summary" },
    { id: "annotation-kegg", label: "KEGG summary", kind: "annotation", requires: ["kegg"], description: "Pathway summary" },
    { id: "table-preview", label: "Table preview", kind: "table", requires: ["table"], description: "Released table preview" }
  ];
}

function guessKind(value) {
  const text = String(value).toLowerCase();
  if (text.includes("figure") || text.includes("chart") || text.includes("png")) return "figures";
  if (text.includes("qc")) return "qc_summary";
  if (text.includes("taxonomy") && text.includes("explorer")) return "taxonomy_explorer";
  if (text.includes("sample")) return "sample_summary";
  if (text.includes("metadata")) return "metadata_validator";
  if (text.includes("taxon") && text.includes("detail")) return "taxon_detail";
  if (text.includes("indicator")) return "indicator_taxa";
  if (text.includes("core")) return "core_microbiome";
  if (text.includes("rare")) return "rare_taxa";
  if (text.includes("interpretation")) return "diversity_interpretation";
  if (text.includes("differential") && text.includes("abundance")) return "differential_abundance";
  if (text.includes("cooccurrence") || text.includes("co-occurrence")) return "cooccurrence";
  if (text.includes("source")) return "source_tracking";
  if (text.includes("contamination")) return "contamination";
  if (text.includes("longitudinal")) return "longitudinal";
  if (text.includes("builder")) return "chart_builder";
  if (text.includes("taxonomy") && text.includes("summary")) return "taxonomy_summary";
  if (text.includes("stat") || text.includes("permanova") || text.includes("permdisp")) return "stats";
  if (text.includes("distance")) return "distance";
  if (text.includes("coverage")) return "coverage";
  if (text.includes("contribution")) return "contribution";
  if (text.includes("differential") || text.includes("aldex2")) return "differential";
  if (text.includes("functional") && text.includes("prediction")) return "functional_summary";
  if (text.includes("abundance")) return "abundance";
  if (text.includes("heat")) return "heatmap";
  if (text.includes("alpha")) return "alpha";
  if (text.includes("beta") || text.includes("pcoa")) return "beta";
  if (text.includes("tree") || text.includes("phylo")) return "tree";
  if (text.includes("gene") || text.includes("protein") || text.includes("annotation") || text.includes("kegg")) return "annotation";
  return "table";
}

function selectModuleFiles(manifest, module) {
  const files = normalizeFiles(manifest);
  if (module.kind === "figures") {
    return files.filter(isImageFile).slice(0, 80);
  }
  if (module.kind === "qc_summary") {
    const selected = [];
    for (const role of ["pipeline_log", "metadata", "species", "feature_table"]) {
      const file = files.find((item) => fileMatchesRole(item, role));
      if (file && !selected.some((item) => item.id === file.id)) {
        selected.push(file);
      }
    }
    return selected;
  }
  if (module.kind === "chart_builder") {
    return files
      .filter((file) => canPreviewAsText(file))
      .filter((file) => !fileMatchesRole(file, "feature_table") && !fileMatchesRole(file, "representative_sequences") && !fileMatchesRole(file, "pipeline_log"))
      .slice(0, 10);
  }
  if (!module.requires.length) {
    return files.filter(canPreviewAsText).slice(0, 3);
  }
  const selected = [];
  for (const role of module.requires) {
    for (const file of files) {
      if (fileMatchesRole(file, role) && !selected.some((item) => item.id === file.id)) {
        selected.push(file);
      }
    }
  }
  return selected.slice(0, 10);
}

function shouldLoadTextForModule(module, file) {
  if (!canPreviewAsText(file)) {
    return false;
  }
  if (module.kind === "qc_summary" && fileMatchesRole(file, "feature_table")) {
    return false;
  }
  if (module.kind === "chart_builder" && (fileMatchesRole(file, "feature_table") || fileMatchesRole(file, "representative_sequences") || fileMatchesRole(file, "pipeline_log"))) {
    return false;
  }
  return true;
}

function fileMatchesRole(file, role) {
  const needle = String(role || "").toLowerCase();
  const haystack = [
    file.id,
    file.name,
    file.role,
    file.type,
    file.format,
    ...(file.roles || [])
  ].map((value) => String(value || "").toLowerCase());
  if (needle === "table") {
    return canPreviewAsText(file);
  }
  if (needle === "figure") {
    return isImageFile(file);
  }
  return haystack.some((value) => value.includes(needle));
}

async function readTextFile(code, file) {
  if (!canPreviewAsText(file)) {
    throw httpError(400, "This file type is not available for table preview.");
  }
  const objectName = objectPath(code, file.path);
  const metadata = await gcsGetMetadata(objectName);
  const size = Number(metadata.size || 0);
  if (size > DATA_TEXT_LIMIT) {
    const buffer = await gcsDownloadBuffer(objectName, { start: 0, end: DATA_TEXT_LIMIT - 1 });
    return { text: buffer.toString("utf8"), truncated: true };
  }
  const buffer = await gcsDownloadBuffer(objectName);
  return { text: buffer.toString("utf8"), truncated: false };
}

function canPreviewAsText(file) {
  const value = `${file.type || ""} ${file.format || ""} ${file.name || ""} ${file.path || ""}`.toLowerCase();
  return /\.(csv|tsv|txt|md|yaml|yml|fasta|fa|newick|nwk|tree)$/.test(value) || /\b(csv|tsv|txt|md|markdown|yaml|yml|fasta|fa|newick|tree)\b/.test(value);
}

function canInlineView(file) {
  const value = `${file.type || ""} ${file.format || ""} ${file.name || ""} ${file.path || ""}`.toLowerCase();
  return /\.(png|jpg|jpeg|webp|gif)$/.test(value) || /\b(png|jpg|jpeg|webp|gif|image|figure)\b/.test(value);
}

function isImageFile(file) {
  const value = `${file.type || ""} ${file.format || ""} ${file.name || ""} ${file.path || ""}`.toLowerCase();
  return /\.(png|jpg|jpeg|webp)$/.test(value) || /\b(png|jpg|jpeg|webp|image)\b/.test(value);
}

function isForbiddenClientDownload(file) {
  const value = `${file.role || ""} ${file.type || ""} ${file.format || ""} ${file.name || ""} ${file.path || ""}`.toLowerCase();
  return /(^|\/)raw\//.test(value)
    || /\.(pdf|png|jpg|jpeg|webp|gif|fastq|fq|fasta|fa)(\.gz)?$/.test(value)
    || /\b(raw|report|pdf|image|figure|fastq|fq|fasta|representative_sequences)\b/.test(value);
}

function publicModule(module) {
  return {
    id: module.id,
    label: module.label,
    kind: module.kind,
    description: module.description,
    requires: module.requires
  };
}

function publicFile(file) {
  const inferredSourceTableId = isImageFile(file) ? figureSourceTableId(file.name, file.path) : "";
  const out = {
    id: file.id,
    name: file.name,
    path: file.path,
    role: file.role,
    roles: file.roles,
    type: file.type,
    format: file.format,
    description: file.description
  };
  [
    "source_table_id",
    "sourceTableId",
    "source_table",
    "sourceTable",
    "source_file_id",
    "sourceFileId",
    "source_file",
    "sourceFile",
    "data_file_id",
    "dataFileId",
    "table_id",
    "tableId",
    "derived_from",
    "derivedFrom",
    "related_file",
    "relatedFile",
    "related_files",
    "relatedFiles",
    "inputs",
    "input_files",
    "inputFiles"
  ].forEach((key) => {
    if (file[key] !== undefined) {
      out[key] = file[key];
    }
  });
  if (!out.source_table_id && inferredSourceTableId) {
    out.source_table_id = inferredSourceTableId;
  }
  return out;
}

function publicReportPdf(pdf) {
  return {
    fileId: safeId(pdf.fileId || pdf.id || "report"),
    name: pdf.name || "KreatBio report PDF"
  };
}

function defaultReportPdf(files) {
  const pdf = files.find((file) => file.role === "report" || file.type === "pdf" || file.format === "pdf");
  return pdf ? { fileId: pdf.id, name: pdf.name } : null;
}

function findFile(manifest, fileId) {
  const id = safeId(fileId);
  const files = normalizeFiles(manifest);
  if (manifest.report_pdf && id === safeId(manifest.report_pdf.fileId || manifest.report_pdf.id || "report")) {
    const pdfPath = manifest.report_pdf.path || manifest.report_pdf.gcs_path;
    if (!pdfPath) {
      throw httpError(404, "Report PDF path is missing from manifest.");
    }
    return {
      id,
      name: manifest.report_pdf.name || "KreatBio report PDF",
      path: cleanRelativePath(pdfPath),
      role: "report",
      type: "pdf",
      format: "pdf",
      roles: []
    };
  }
  const file = files.find((item) => item.id === id);
  if (!file) {
    throw httpError(404, "Requested file is not listed for this report.");
  }
  return file;
}

function objectPath(code, relativePath) {
  return [GCS_CLIENT_PREFIX, code, cleanRelativePath(relativePath)].filter(Boolean).join("/");
}

async function gcsObjectExists(objectName) {
  if (GCS_ACCESS_TOKEN) {
    const res = await fetch(gcsMetadataUrl(objectName), { headers: gcsAuthHeaders() });
    if (res.status === 404) {
      return false;
    }
    if (res.status === 401 || res.status === 403) {
      throw await gcsAccessTokenError(res, "check GCS object access");
    }
    if (!res.ok) {
      throw await gcsAccessTokenError(res, "check GCS object access");
    }
    return true;
  }
  try {
    const [exists] = await storage.bucket(GCS_BUCKET).file(objectName).exists();
    return exists;
  } catch (err) {
    throw gcsClientError(err);
  }
}

async function gcsGetMetadata(objectName) {
  if (GCS_ACCESS_TOKEN) {
    const res = await fetch(gcsMetadataUrl(objectName), { headers: gcsAuthHeaders() });
    if (res.status === 404) {
      throw httpError(404, "Requested file is not available in this report folder.");
    }
    if (res.status === 401 || res.status === 403) {
      throw await gcsAccessTokenError(res, "read GCS object metadata");
    }
    if (!res.ok) {
      throw await gcsAccessTokenError(res, "read GCS object metadata");
    }
    return res.json();
  }
  try {
    const [metadata] = await storage.bucket(GCS_BUCKET).file(objectName).getMetadata();
    return metadata;
  } catch (err) {
    throw gcsClientError(err);
  }
}

async function gcsDownloadBuffer(objectName, range) {
  if (GCS_ACCESS_TOKEN) {
    const headers = gcsAuthHeaders();
    if (range && Number.isFinite(range.start) && Number.isFinite(range.end)) {
      headers.Range = `bytes=${range.start}-${range.end}`;
    }
    const res = await fetch(gcsMediaUrl(objectName), { headers });
    if (res.status === 404) {
      throw httpError(404, "Requested file is not available in this report folder.");
    }
    if (res.status === 401 || res.status === 403) {
      throw await gcsAccessTokenError(res, "download GCS object");
    }
    if (!res.ok && res.status !== 206) {
      throw await gcsAccessTokenError(res, "download GCS object");
    }
    return Buffer.from(await res.arrayBuffer());
  }
  const args = range && Number.isFinite(range.start) && Number.isFinite(range.end)
    ? { start: range.start, end: range.end }
    : undefined;
  try {
    const [buffer] = await storage.bucket(GCS_BUCKET).file(objectName).download(args);
    return buffer;
  } catch (err) {
    throw gcsClientError(err);
  }
}

async function gcsListObjectNames(prefix) {
  if (GCS_ACCESS_TOKEN) {
    const names = [];
    let pageToken = "";
    do {
      const url = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(GCS_BUCKET)}/o`);
      url.searchParams.set("prefix", prefix);
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }
      const res = await fetch(url, { headers: gcsAuthHeaders() });
      if (res.status === 401 || res.status === 403) {
        throw await gcsAccessTokenError(res, "list GCS objects");
      }
      if (!res.ok) {
        throw await gcsAccessTokenError(res, "list GCS objects");
      }
      const data = await res.json();
      names.push(...(data.items || []).map((item) => item.name).filter(Boolean));
      pageToken = data.nextPageToken || "";
    } while (pageToken);
    return names;
  }
  try {
    const [objects] = await storage.bucket(GCS_BUCKET).getFiles({ prefix });
    return objects.map((file) => file.name);
  } catch (err) {
    throw gcsClientError(err);
  }
}

function gcsClientError(err) {
  const message = String(err?.message || "");
  if (
    message.includes("Could not load the default credentials") ||
    message.includes("Reauthentication failed") ||
    message.includes("invalid_grant")
  ) {
    return httpError(401, "Google Cloud credentials are not available for local portal access. Run gcloud auth login, then restart the backend with GCS_ACCESS_TOKEN from gcloud auth print-access-token.");
  }
  if (err?.code === 401 || err?.code === 403) {
    return httpError(401, "Google Cloud credentials are not authorized for this report bucket. Refresh your login or restart the backend with a valid GCS_ACCESS_TOKEN.");
  }
  return err;
}

async function gcsAccessTokenError(res, action) {
  let detail = "";
  try {
    const text = await res.text();
    if (text) {
      try {
        detail = JSON.parse(text)?.error?.message || "";
      } catch {
        detail = text;
      }
    }
  } catch {}
  if (res.status === 401) {
    return httpError(401, "GCS access token expired or is not authorized. Restart the local backend with a fresh GCS_ACCESS_TOKEN.");
  }
  if (res.status === 403) {
    return httpError(403, detail || `Google Cloud credentials are not authorized to ${action}.`);
  }
  return httpError(502, detail || `Unable to ${action} (${res.status}).`);
}

function gcsAuthHeaders() {
  return { Authorization: `Bearer ${GCS_ACCESS_TOKEN}` };
}

function gcsMetadataUrl(objectName) {
  return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(GCS_BUCKET)}/o/${encodeURIComponent(objectName)}`;
}

function gcsMediaUrl(objectName) {
  return `${gcsMetadataUrl(objectName)}?alt=media`;
}

function cleanRelativePath(value) {
  let cleaned = String(value || "").trim().replace(/^gs:\/\/[^/]+\//, "");
  cleaned = cleaned.replace(/^\/+/, "");
  cleaned = cleaned.replace(/\\/g, "/");
  const parts = cleaned.split("/").filter(Boolean);
  if (!parts.length || parts.includes("..")) {
    throw httpError(400, "Invalid report file path.");
  }
  if (GCS_CLIENT_PREFIX && parts[0] === GCS_CLIENT_PREFIX) {
    parts.shift();
  }
  if (/^[A-Z0-9]{9}$/i.test(parts[0])) {
    parts.shift();
  }
  return parts.join("/");
}

function cleanPrefix(value) {
  return String(value || "")
    .trim()
    .replace(/^gs:\/\/[^/]+\//, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "..")
    .join("/");
}

function safeId(value) {
  const id = String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
  if (!id) {
    throw httpError(400, "Invalid id.");
  }
  return id;
}

function safeDownloadName(file) {
  return path.basename(file.name || file.path || file.id).replace(/[^\w.\- ()]+/g, "_") || "kreatbio-file";
}

function contentType(file) {
  const value = `${file.type || ""} ${file.format || ""} ${file.path || ""}`.toLowerCase();
  if (value.includes("pdf")) return "application/pdf";
  if (value.includes("csv")) return "text/csv; charset=utf-8";
  if (value.includes("tsv")) return "text/tab-separated-values; charset=utf-8";
  if (value.includes("fasta") || value.includes(".fa")) return "text/plain; charset=utf-8";
  if (value.includes("json")) return "application/json; charset=utf-8";
  if (value.includes("png")) return "image/png";
  if (value.includes("jpg") || value.includes("jpeg")) return "image/jpeg";
  if (value.includes("webp")) return "image/webp";
  return "application/octet-stream";
}

function humanizeFileName(value) {
  return String(value || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function safeExternalParam(value, regex) {
  const out = String(value || "").trim();
  if (!regex.test(out)) {
    throw httpError(400, "Invalid external API parameter.");
  }
  return out;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "KreatBioClientPortal/1.0" } });
  if (!res.ok) {
    throw httpError(502, "External API request failed.");
  }
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "KreatBioClientPortal/1.0" } });
  if (!res.ok) {
    throw httpError(502, "External API request failed.");
  }
  return res.text();
}

function buildChatPrompt({ manifest, message, activeModule, activeResultSummary }) {
  const scoped = {
    report: {
      code: manifest.code,
      client_name: manifest.client_name,
      analysis_type: manifest.analysis_type,
      title: manifest.title,
      files: manifest.files.map((file) => ({ id: file.id, name: file.name, role: file.role, type: file.type })),
      modules: manifest.modules.map((module) => ({ id: module.id, label: module.label, kind: module.kind }))
    },
    activeModule,
    activeResultSummary
  };
  return [
    "You are the KreatBio bioinformatics report assistant.",
    "Answer only from the provided report context and general bioinformatics knowledge.",
    "Do not claim access to files, clients, or reports outside this context.",
    "If the report context does not contain enough detail, say what data is needed.",
    "",
    "Report context JSON:",
    JSON.stringify(scoped, null, 2),
    "",
    "Client question:",
    message
  ].join("\n");
}

async function callGemini(prompt) {
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`);
  url.searchParams.set("key", GEMINI_API_KEY);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 900 }
    })
  });
  if (!res.ok) {
    throw httpError(502, "Gemini request failed.");
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "No response was returned.";
}

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}
