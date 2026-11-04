'use strict';
// Adds ?v=<content hash> to the site's own script, stylesheet and icon links. Scripts and styles are cached for minutes
// (and served stale for a day), while HTML is revalidated every time; a changed file therefore gets a new URL, so a new
// page never runs with an old cached script. The deploy computes the hashes (lib/hujia-stack.ts).
const ASSET = /\b(src|href)="(\/[A-Za-z0-9._-]+\.(?:js|css|png))"/g;

function stamp(html, versions) {
  return html.replace(ASSET, (match, attr, file) => (Object.hasOwn(versions, file) ? `${attr}="${file}?v=${versions[file]}"` : match));
}

function versionsFromEnv() {
  try {
    const versions = JSON.parse(process.env.ASSET_VERSIONS || '{}');
    return versions && typeof versions === 'object' ? versions : {};
  } catch {
    return {};
  }
}

module.exports = { stamp, versionsFromEnv };
