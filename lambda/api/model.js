'use strict';
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (message) => { throw new HttpError(400, message); };
const ID = /^[a-zA-Z0-9-]{1,80}$/;
function text(value, max, label) { if (typeof value !== 'string' || value.length > max) fail(`${label} is too long or invalid`); return value.trim(); }
function date(value, optional = false) {
  if (optional && value === '') return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) fail('Choose a valid date');
  return value;
}
function version(value) { if (!Number.isSafeInteger(value) || value < 1) fail('A valid version is required'); return value; }
function parseMemory(body, admin, current) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Invalid memory');
  const allowed = admin ? ['title','date','place','caption','perspective','published','publicPreview','favorite'] : ['title','date','place','caption','perspective','favorite'];
  if (Object.keys(body).some(k => ![...allowed,'version'].includes(k))) throw new HttpError(403, 'This field can only be changed in the studio');
  const out = {};
  for (const key of allowed) {
    if (!(key in body)) continue;
    if (key === 'date') { out[key] = date(body[key]); if (current && current.date !== out[key]) out.datePrecision = 'day'; }
    else if (['published','publicPreview','favorite'].includes(key)) { if (typeof body[key] !== 'boolean') fail('Invalid choice'); out[key] = body[key]; }
    else out[key] = text(body[key], key === 'title' ? 150 : key === 'place' ? 200 : 5000, key);
  }
  if (!current && (!out.title || !out.date)) fail('A title and date are required');
  if ('title' in out && !out.title) fail('A title is required');
  return out;
}
function parseSettings(body) {
  const out = {};
  for (const key of Object.keys(body || {})) {
    if (key === 'version') continue;
    if (key === 'startDate') out[key] = date(body[key]);
    else if (key === 'anniversaryDate') out[key] = date(body[key], true);
    else if (key === 'letter') out[key] = text(body[key], 20000, 'Letter');
    else if (key === 'letterPublished') { if (typeof body[key] !== 'boolean') fail('Invalid choice'); out[key] = body[key]; }
    else if (key === 'coverMemoryId') { if (body[key] !== '' && !ID.test(body[key])) fail('Invalid cover'); out[key] = body[key]; }
    else fail('Unknown setting');
  }
  return out;
}
function parseUpload(body) {
  const type = text(body.type, 100, 'Photo type');
  if (!/^(image\/(jpeg|png|webp|avif|gif|heic|heif)|video\/(mp4|quicktime|webm|x-m4v|3gpp))$/.test(type)) fail('Use a supported original photo or video.');
  const limit = type.startsWith('video/') ? 2 * 1024 * 1024 * 1024 : 100 * 1024 * 1024;
  if (!Number.isSafeInteger(body.size) || body.size < 1 || body.size > limit) fail('Photos must be smaller than 100 MB and videos smaller than 2 GB');
  return { name: text(body.name, 200, 'Filename').replace(/[\x00-\x1f\x7f]/g, ''), type, size: body.size };
}
module.exports = { HttpError, ID, date, text, version, parseMemory, parseSettings, parseUpload };
