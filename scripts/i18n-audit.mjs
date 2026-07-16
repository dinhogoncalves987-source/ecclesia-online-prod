import fs from "node:fs";
import path from "node:path";

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!full.includes("node_modules")) walk(full, files);
    } else if (/\.(tsx|ts)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const srcFiles = walk("src");
const dictFile = "src/hooks/useLanguage.tsx";
const dictSrc = fs.readFileSync(dictFile, "utf8");

const keyRegex = /^\s*"((?:[^"\\]|\\.)*)":\s*\{\s*pt:/gm;
const dictKeys = new Set();
let m;
while ((m = keyRegex.exec(dictSrc))) {
  dictKeys.add(m[1].replace(/\\"/g, '"'));
}
console.log("Total dict keys:", dictKeys.size);

const callRegex = /\bt\(\s*(["'`])((?:\\.|(?!\1).)*)\1\s*\)/g;
const usageByKey = new Map();
for (const file of srcFiles) {
  const content = fs.readFileSync(file, "utf8");
  const re = new RegExp(callRegex);
  let cm;
  while ((cm = re.exec(content))) {
    const key = cm[2];
    if (!key) continue;
    if (!usageByKey.has(key)) usageByKey.set(key, new Set());
    usageByKey.get(key).add(file);
  }
}
console.log("Total distinct t() call keys:", usageByKey.size);

const missing = [];
for (const [key, filesSet] of usageByKey) {
  if (!dictKeys.has(key)) missing.push({ key, files: [...filesSet] });
}
missing.sort((a, b) => a.key.localeCompare(b.key));
console.log("Missing keys:", missing.length);

if (!fs.existsSync("schema-audit")) fs.mkdirSync("schema-audit");
fs.writeFileSync("schema-audit/missing-i18n-keys.json", JSON.stringify(missing, null, 2));

// Also dump per-file missing count for prioritization
const byFile = new Map();
for (const { key, files } of missing) {
  for (const f of files) {
    byFile.set(f, (byFile.get(f) || 0) + 1);
  }
}
const sortedFiles = [...byFile.entries()].sort((a, b) => b[1] - a[1]);
fs.writeFileSync(
  "schema-audit/missing-i18n-by-file.txt",
  sortedFiles.map(([f, c]) => `${c}\t${f}`).join("\n"),
);
console.log("Wrote schema-audit/missing-i18n-keys.json and missing-i18n-by-file.txt");
