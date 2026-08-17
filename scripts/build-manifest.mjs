#!/usr/bin/env node
/**
 * build-manifest.mjs
 *
 * Scans data/weeks/ for files named W<number>.xlsx and writes the list to
 * data/weeks/manifest.json, sorted numerically (so W9 comes before W10).
 *
 * The file is only rewritten when the week list actually changes — the
 * "generated" timestamp is carried over otherwise, so the workflow never
 * commits a file whose only difference is the clock.
 *
 * Run locally with: node scripts/build-manifest.mjs
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const WEEKS_DIR = join('data', 'weeks');
const MANIFEST = join(WEEKS_DIR, 'manifest.json');
const PATTERN = /^W(\d+)\.xlsx$/i;

if (!existsSync(WEEKS_DIR)) {
  mkdirSync(WEEKS_DIR, { recursive: true });
  console.log(`Created ${WEEKS_DIR} (it did not exist).`);
}

const entries = readdirSync(WEEKS_DIR, { withFileTypes: true })
  .filter((e) => e.isFile())
  .map((e) => e.name)
  .filter((name) => !name.startsWith('~$')); // ignore Excel lock files

const matched = [];
const skipped = [];

for (const name of entries) {
  const m = PATTERN.exec(name);
  if (m) matched.push({ id: name.replace(/\.xlsx$/i, ''), num: parseInt(m[1], 10) });
  else if (name !== 'manifest.json' && !name.startsWith('.')) skipped.push(name);
}

matched.sort((a, b) => (a.num - b.num) || a.id.localeCompare(b.id));

// W1.xlsx and W01.xlsx both mean week 1 — flag it rather than silently dropping one.
const byNumber = new Map();
for (const w of matched) {
  if (byNumber.has(w.num)) {
    console.warn(`::warning::Week ${w.num} has more than one file: ${byNumber.get(w.num)}.xlsx and ${w.id}.xlsx. Both are listed; the dashboard will show both.`);
  } else {
    byNumber.set(w.num, w.id);
  }
}

const weeks = matched.map((w) => w.id);

let previous = null;
if (existsSync(MANIFEST)) {
  try {
    previous = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  } catch {
    console.warn('::warning::Existing manifest.json could not be parsed. Rewriting it.');
  }
}

const unchanged =
  previous &&
  Array.isArray(previous.weeks) &&
  previous.weeks.length === weeks.length &&
  previous.weeks.every((id, i) => id === weeks[i]);

if (unchanged) {
  console.log(`manifest.json is already up to date (${weeks.length} weeks).`);
  process.exit(0);
}

const manifest = {
  generated: new Date().toISOString(),
  count: weeks.length,
  weeks
};

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(`Wrote ${MANIFEST} with ${weeks.length} week(s): ${weeks.join(', ') || '(none)'}`);
if (skipped.length) {
  console.log(`Ignored (name does not match W<number>.xlsx): ${skipped.join(', ')}`);
}
