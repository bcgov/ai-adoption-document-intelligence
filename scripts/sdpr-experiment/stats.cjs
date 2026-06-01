const fs = require("node:fs");
const path = require("node:path");

const DIR = "./scripts/sdpr-experiment/output";

function readCsv(file) {
  const raw = fs.readFileSync(path.join(DIR, file), "utf8").trim().split(/\r?\n/);
  const header = raw[0].split(",");
  return raw.slice(1).map((line) => {
    // simple split — our CSVs don't have embedded commas in the fields we read
    const cells = line.split(",");
    const row = {};
    header.forEach((h, i) => (row[h] = cells[i]));
    return row;
  });
}

const sessions = readCsv("sessions.csv");
const corrections = readCsv("corrections.csv");

// ----- session stats -----
const byStatus = {};
for (const s of sessions) byStatus[s.status] = (byStatus[s.status] || 0) + 1;

const durations = sessions
  .map((s) => Number.parseFloat(s.durationSeconds))
  .filter((n) => Number.isFinite(n) && n > 0);
const sumDur = durations.reduce((a, b) => a + b, 0);
const meanDur = sumDur / durations.length;
const sortedDur = [...durations].sort((a, b) => a - b);
const medianDur = sortedDur[Math.floor(sortedDur.length / 2)];
const minDur = sortedDur[0];
const maxDur = sortedDur[sortedDur.length - 1];

// ----- correction stats -----
const totalCorrections = corrections.length;
const byAction = {};
for (const c of corrections) byAction[c.action] = (byAction[c.action] || 0) + 1;

const fieldDist = {};
const sessionsWithCorrections = new Set();
const correctionsPerDoc = {};
for (const c of corrections) {
  fieldDist[c.fieldKey] = (fieldDist[c.fieldKey] || 0) + 1;
  sessionsWithCorrections.add(c.sessionId);
  correctionsPerDoc[c.documentId] = (correctionsPerDoc[c.documentId] || 0) + 1;
}
const docsWithAnyAction = sessions.filter(
  (s) => Number.parseInt(s.totalCorrections, 10) > 0,
).length;

// ----- timing per correction -----
const correctionsPerDocCounts = sessions
  .map((s) => Number.parseInt(s.totalCorrections, 10))
  .filter((n) => Number.isFinite(n));
const meanCorrPerDoc =
  correctionsPerDocCounts.reduce((a, b) => a + b, 0) /
  correctionsPerDocCounts.length;

// average seconds per correction (across sessions with at least one correction)
const sessionsWithActions = sessions.filter(
  (s) => Number.parseInt(s.totalCorrections, 10) > 0 &&
        Number.parseFloat(s.durationSeconds) > 0,
);
const secsPerCorrection = sessionsWithActions
  .map(
    (s) =>
      Number.parseFloat(s.durationSeconds) /
      Number.parseInt(s.totalCorrections, 10),
  )
  .filter((n) => Number.isFinite(n));
const meanSecPerCorr =
  secsPerCorrection.reduce((a, b) => a + b, 0) / secsPerCorrection.length;

function fmt(n) {
  return n.toFixed(1);
}

console.log("=== Sessions ===");
console.log(`Total sessions:    ${sessions.length}`);
console.log(`By status:         ${JSON.stringify(byStatus)}`);
console.log(`Sessions w/ actions: ${docsWithAnyAction} (${fmt((docsWithAnyAction / sessions.length) * 100)}%)`);
console.log("");
console.log("=== Per-document duration (seconds) ===");
console.log(`Sessions with valid duration: ${durations.length}`);
console.log(`Mean:   ${fmt(meanDur)}s  (${fmt(meanDur / 60)} min)`);
console.log(`Median: ${fmt(medianDur)}s`);
console.log(`Min:    ${fmt(minDur)}s`);
console.log(`Max:    ${fmt(maxDur)}s`);
console.log(`Total:  ${fmt(sumDur)}s  (${fmt(sumDur / 60)} min)`);
console.log("");
console.log("=== Corrections ===");
console.log(`Total correction events: ${totalCorrections}`);
console.log(`By action: ${JSON.stringify(byAction)}`);
console.log(`Mean per doc: ${fmt(meanCorrPerDoc)}`);
console.log("");
console.log("=== Per-correction time ===");
console.log(
  `Mean seconds per correction (across sessions with corrections): ${fmt(meanSecPerCorr)}s`,
);

// Field distribution (sorted)
const sortedFields = Object.entries(fieldDist).sort((a, b) => b[1] - a[1]);
console.log("");
console.log("=== Top fields by correction events ===");
for (const [field, count] of sortedFields.slice(0, 15)) {
  console.log(`  ${field}: ${count}`);
}
