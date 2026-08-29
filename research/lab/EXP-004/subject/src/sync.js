'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 台帳(manifest.json)に並んだファイルを、変換しながら配布先へ写す。
 *
 * 台帳の形:
 *   { "files": [ { "from": "docs/a.md", "to": "public/a.md" }, ... ] }
 *
 * 変換: 改行を LF に揃え、先頭に「自動生成」の注記を1行足す。
 */

const HEADER = '<!-- このファイルは同期で作られています。直接編集しないでください -->';

function readManifest(root) {
  const raw = fs.readFileSync(path.join(root, 'manifest.json'), 'utf8');
  const m = JSON.parse(raw);
  return m.files || [];
}

function transform(text) {
  const body = text.replace(/\r\n/g, '\n');
  return HEADER + '\n' + body;
}

function syncOne(srcRoot, destRoot, entry) {
  const from = path.join(srcRoot, entry.from);
  const to = path.join(destRoot, entry.to);

  const text = fs.readFileSync(from, 'utf8');
  const out = transform(text);

  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, out, 'utf8');

  return { from: entry.from, to: entry.to, bytes: Buffer.byteLength(out) };
}

function syncAll(srcRoot, destRoot) {
  const entries = readManifest(srcRoot);
  const done = [];
  const failed = [];

  for (const entry of entries) {
    try {
      done.push(syncOne(srcRoot, destRoot, entry));
    } catch (e) {
      failed.push({ entry: entry, error: e.message });
    }
  }

  return { done: done, failed: failed, total: entries.length };
}

module.exports = { syncAll, syncOne, transform, readManifest, HEADER };
