'use strict';

// Check the publishable tree and optionally every object reachable from HEAD.
const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync, lstatSync } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const brandFiles = new Set(['src/images/dl-icon.png', 'archive/first-gift/images/dl-icon.png', 'web/icon.png']);
const brandHash = 'ee25c6659f51d52a56ea4ba55ca5c4188ef262eed4d957b48a307c4031278297';
const media = /\.(?:png|jpe?g|webp|gif|avif|heic|heif|mp4|mov|m4v|mp3|m4a|wav|pdf)$/i;
const failures = [];
for (const file of files) {
  const absolute = path.join(root, file);
  if (!existsSync(absolute)) continue;
  if (lstatSync(absolute).isSymbolicLink()) { failures.push(`${file}: symlink needs review`); continue; }
  if (brandFiles.has(file)) {
    if (createHash('sha256').update(readFileSync(absolute)).digest('hex') !== brandHash) failures.push(`${file}: branding checksum differs`);
  } else if (media.test(file)) {
    failures.push(`${file}: personal media must be kept outside Git`);
  } else if (/\.(?:html|js|json|ts|css|md)$/i.test(file) && /data:(?:image|video|audio)\/[^;,]+;base64,/i.test(readFileSync(absolute, 'utf8'))) {
    failures.push(`${file}: embedded media needs review`);
  }
}
if (process.argv.includes('--history')) {
  const objects = execFileSync('git', ['rev-list', '--objects', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
  for (const entry of objects) {
    const separator = entry.indexOf(' ');
    if (separator < 0) continue;
    const objectId = entry.slice(0, separator), file = entry.slice(separator + 1);
    if (!media.test(file)) continue;
    if (!brandFiles.has(file)) failures.push(`${file}: personal media remains in published history`);
    else if (createHash('sha256').update(execFileSync('git', ['cat-file', 'blob', objectId], { cwd: root })).digest('hex') !== brandHash) failures.push(`${file}: historical branding checksum differs`);
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Current publishable tree: no personal media; DL branding checksums verified.');
  console.log(process.argv.includes('--history') ? 'Published HEAD history: only verified DL branding media.' : 'Run with --history to check every object reachable from HEAD.');
}
