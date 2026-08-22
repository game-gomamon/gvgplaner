#!/usr/bin/env node
/**
 * extract-animus.mjs
 *
 * Pulls the Animus portraits out of data/team_stat.xlsx and writes them to
 * assets/animus/, plus an index.json that maps each Animus name to its file.
 *
 * WHY THIS SCRIPT EXISTS
 * ----------------------
 * The "Profile" column of the Animus sheet does not contain a path or a URL.
 * It contains Excel's newer *image in cell* value ("Place in Cell" pictures).
 * Those are stored as a rich value: the cell itself is only an error placeholder
 *
 *     <c r="B2" t="e" vm="1"><v>#VALUE!</v></c>
 *
 * and the real picture sits in xl/media/, reached through a four-hop chain:
 *
 *     cell vm="N"                          (1-based)
 *       -> xl/metadata.xml   futureMetadata block N-1  -> <xlrd:rvb i="K"/>
 *       -> xl/richData/rdrichvalue.xml     <rv> number K -> LocalImageIdentifier L
 *       -> xl/richData/richValueRel.xml    <rel> number L -> r:id
 *       -> xl/richData/_rels/richValueRel.xml.rels        -> ../media/imageX.png
 *
 * SheetJS does not follow that chain — it reads the cell and hands back "".
 * (Verified against this workbook: every Profile cell comes back empty.)
 * So the browser cannot get at these images, and they have to be unpacked
 * ahead of time into real files the site can request over HTTP.
 *
 * Run locally with:  node scripts/extract-animus.mjs
 *
 * No dependencies: an .xlsx is a ZIP, and node:zlib can inflate it.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const WORKBOOK = join('data', 'team_stat.xlsx');
const OUT_DIR = join('assets', 'animus');
const INDEX = join(OUT_DIR, 'index.json');

/* The column holding the square portrait. "Card" is the tall full-art image;
   it is four times the weight and the tab never shows it, so it is skipped. */
const PROFILE_HEADER = 'profile';

/* ---------------------------------------------------------
   Minimal ZIP reader
   --------------------------------------------------------- */

function openZip(buf) {
  // End of Central Directory: scan backwards, the comment is almost always empty.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error(`${WORKBOOK} is not a readable .xlsx (no ZIP end record).`);

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (p === 0xffffffff) throw new Error('ZIP64 archives are not supported by this script.');

  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries.set(name, { method, compressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  return function read(name) {
    const e = entries.get(name);
    if (!e) return null;
    // The local header repeats the name/extra lengths, which is where the data starts.
    const lnLen = buf.readUInt16LE(e.localOffset + 26);
    const leLen = buf.readUInt16LE(e.localOffset + 28);
    const start = e.localOffset + 30 + lnLen + leLen;
    const raw = buf.subarray(start, start + e.compressedSize);
    return e.method === 0 ? Buffer.from(raw) : inflateRawSync(raw);
  };
}

/* ---------------------------------------------------------
   Tiny XML helpers — enough for the handful of parts we touch
   --------------------------------------------------------- */

const unescapeXml = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
   .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
   .replace(/&amp;/g, '&');

const text = (b) => (b == null ? '' : b.toString('utf8'));

function sharedStrings(read) {
  const xml = text(read('xl/sharedStrings.xml'));
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    unescapeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''))
  );
}

/* Name -> worksheet part path, honouring workbook.xml.rels rather than
   assuming sheet1.xml is the first tab (Excel does not guarantee that). */
function worksheets(read) {
  const rels = new Map(
    [...text(read('xl/_rels/workbook.xml.rels')).matchAll(/<Relationship([^>]*)\/>/g)]
      .map((m) => m[1])
      .map((a) => [/Id="([^"]+)"/.exec(a)?.[1], /Target="([^"]+)"/.exec(a)?.[1]])
      .filter(([id, target]) => id && target)
  );
  const out = new Map();
  for (const m of text(read('xl/workbook.xml')).matchAll(/<sheet([^>]*)\/>/g)) {
    const name = /name="([^"]+)"/.exec(m[1])?.[1];
    const rid = /r:id="([^"]+)"/.exec(m[1])?.[1];
    let target = rels.get(rid);
    if (!name || !target) continue;
    target = target.replace(/^\/?(xl\/)?/, '');
    out.set(unescapeXml(name), `xl/${target}`);
  }
  return out;
}

/* Builds vm (1-based, as written on the cell) -> "imageX.png". */
function imageByVm(read) {
  const meta = text(read('xl/metadata.xml'));
  const futureBlock = /<futureMetadata name="XLRICHVALUE"[\s\S]*?<\/futureMetadata>/.exec(meta);
  const rvb = futureBlock ? [...futureBlock[0].matchAll(/<xlrd:rvb i="(\d+)"\/>/g)].map((m) => +m[1]) : [];

  // First <v> of each <rv> is the LocalImageIdentifier (see structure part).
  const rv = [...text(read('xl/richData/rdrichvalue.xml')).matchAll(/<rv[^>]*>\s*<v>(\d+)<\/v>/g)].map((m) => +m[1]);

  const relIds = [...text(read('xl/richData/richValueRel.xml')).matchAll(/<rel[^>]*r:id="([^"]+)"/g)].map((m) => m[1]);
  const targets = new Map(
    [...text(read('xl/richData/_rels/richValueRel.xml.rels')).matchAll(/<Relationship([^>]*)\/>/g)]
      .map((m) => [/Id="([^"]+)"/.exec(m[1])?.[1], /Target="([^"]+)"/.exec(m[1])?.[1]])
      .filter(([id, t]) => id && t)
  );

  return function lookup(vm) {
    const k = rvb[vm - 1];
    if (k === undefined) return null;
    const local = rv[k];
    if (local === undefined) return null;
    const target = targets.get(relIds[local]);
    return target ? target.replace(/^\.\.\//, 'xl/') : null;
  };
}

/* ---------------------------------------------------------
   Read the Animus sheet
   --------------------------------------------------------- */

const slug = (name) =>
  String(name).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'animus';

function colLetters(ref) { return /^([A-Z]+)/.exec(ref)?.[1] ?? ''; }

function parseAnimusSheet(xml, strings) {
  const rows = [];
  for (const rm of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = new Map();
    for (const cm of rm[2].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cm[1];
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      if (!ref) continue;
      const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? 'n';
      const vm = /vm="(\d+)"/.exec(attrs)?.[1];
      const raw = /<v>([\s\S]*?)<\/v>/.exec(cm[2])?.[1] ?? '';
      const value = type === 's' ? (strings[+raw] ?? '') : unescapeXml(raw);
      cells.set(colLetters(ref), { value, vm: vm ? +vm : null });
    }
    rows.push({ number: +rm[1], cells });
  }
  return rows;
}

/* ---------------------------------------------------------
   Run
   --------------------------------------------------------- */

if (!existsSync(WORKBOOK)) {
  console.error(`::error::${WORKBOOK} not found. Put the workbook there and run again.`);
  process.exit(1);
}

const read = openZip(readFileSync(WORKBOOK));
const strings = sharedStrings(read);
const sheets = worksheets(read);

const animusPath = [...sheets.keys()].find((n) => n.trim().toLowerCase() === 'animus');
if (!animusPath) {
  console.error(`::error::No "Animus" sheet in ${WORKBOOK}. Sheets found: ${[...sheets.keys()].join(', ')}`);
  process.exit(1);
}

const rows = parseAnimusSheet(text(read(sheets.get(animusPath))), strings);
if (!rows.length) {
  console.error('::error::The Animus sheet is empty.');
  process.exit(1);
}

// Header row tells us which column is the name and which is the portrait.
const header = rows[0];
let nameCol = null;
let profileCol = null;
for (const [col, cell] of header.cells) {
  const key = cell.value.trim().toLowerCase();
  if (key === 'animus' && !nameCol) nameCol = col;
  if (key === PROFILE_HEADER && !profileCol) profileCol = col;
}
if (!nameCol || !profileCol) {
  console.error(`::error::The Animus sheet needs an "Animus" and a "Profile" column. Found: ${[...header.cells.values()].map((c) => c.value).join(', ')}`);
  process.exit(1);
}

const lookup = imageByVm(read);
mkdirSync(OUT_DIR, { recursive: true });

const index = {};
const written = [];
const noImage = [];
const seen = new Set();

for (const row of rows.slice(1)) {
  const name = (row.cells.get(nameCol)?.value ?? '').trim();
  if (!name) continue;
  if (seen.has(name)) {
    console.warn(`::warning::"${name}" appears more than once on the Animus sheet. The first portrait is used.`);
    continue;
  }
  seen.add(name);

  const vm = row.cells.get(profileCol)?.vm ?? null;
  const part = vm ? lookup(vm) : null;
  const bytes = part ? read(part) : null;

  if (!bytes) { noImage.push(name); continue; }

  // Keep the source extension; Excel stores png/jpeg/gif untouched.
  const ext = (/\.([a-z0-9]+)$/i.exec(part)?.[1] ?? 'png').toLowerCase();
  const file = `${slug(name)}.${ext}`;
  writeFileSync(join(OUT_DIR, file), bytes);
  index[name] = file;
  written.push(file);
}

/* Sorted keys keep index.json byte-stable, so re-running does not churn git. */
const ordered = {};
for (const key of Object.keys(index).sort((a, b) => a.localeCompare(b))) ordered[key] = index[key];

writeFileSync(
  INDEX,
  JSON.stringify({ generated: new Date().toISOString(), count: written.length, profiles: ordered }, null, 2) + '\n',
  'utf8'
);

// Drop portraits for Animus that are no longer on the sheet.
const keep = new Set([...written, 'index.json']);
for (const file of readdirSync(OUT_DIR)) {
  if (!keep.has(file) && /\.(png|jpe?g|gif|webp)$/i.test(file)) {
    unlinkSync(join(OUT_DIR, file));
    console.log(`Removed stale portrait: ${file}`);
  }
}

console.log(`Wrote ${written.length} portrait(s) to ${OUT_DIR}/ and ${INDEX}.`);
if (noImage.length) {
  console.log(`No portrait in the Profile column for: ${noImage.join(', ')} — the tab will show their initials instead.`);
}
