export function mergeMissingManifestFiles(existingFiles, candidateFiles, dedupeKey) {
  const existing = Array.isArray(existingFiles) ? existingFiles.slice() : [];
  const candidates = Array.isArray(candidateFiles) ? candidateFiles : [];
  const keyFor = typeof dedupeKey === "function" ? dedupeKey : (file) => String(file?.path || "").toLowerCase();
  const paths = new Set(existing.map((file) => String(file?.path || "").trim().toLowerCase()).filter(Boolean));
  const keys = new Set(existing.map(keyFor).filter(Boolean));

  for (const file of candidates) {
    const normalizedPath = String(file?.path || "").trim().toLowerCase();
    const key = keyFor(file);
    if ((normalizedPath && paths.has(normalizedPath)) || (key && keys.has(key))) continue;
    existing.push(file);
    if (normalizedPath) paths.add(normalizedPath);
    if (key) keys.add(key);
  }
  return existing;
}
