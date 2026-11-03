// CloudFront viewer-request function (cloudfront-js-2.0) for every jh.dliu.com behavior.
// Loaded by lib/hujia-stack.ts and tested in test/routes.test.js.
var SITE_HOST = 'jh.dliu.com';
var PAGES = { '/': '/index.html', '/docs': '/docs.html', '/docs/cost': '/docs.html', '/docs/security': '/docs.html', '/old-website': '/api/old-website' };
var MOVED = { '/about': '/docs', '/about/': '/docs', '/docs/': '/docs', '/docs/architecture': '/docs', '/security': '/docs/security', '/security/': '/docs/security' };
// The only two objects in the private bucket that anyone may see: reviewed scenery copies. The bucket policy
// allows CloudFront to read exactly these keys, so a mistake here still cannot expose other media.
var GUEST = { '/api/guest/guestSea': '/trips/preview/guestSea', '/api/guest/guestHarbour': '/trips/preview/guestHarbour' };

function moved(location) {
  return { statusCode: 301, statusDescription: 'Moved Permanently', headers: { location: { value: location }, 'cache-control': { value: 'max-age=3600' } } };
}

function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var host = request.headers.host ? request.headers.host.value : '';
  // Serve only on jh.dliu.com, never on the distribution's *.cloudfront.net name.
  if (host !== SITE_HOST) return moved('https://' + SITE_HOST + uri);
  if (MOVED[uri]) return moved(MOVED[uri]);
  if (uri.indexOf('/api/guest/') === 0) {
    if (!GUEST[uri]) return { statusCode: 404, statusDescription: 'Not Found', headers: { 'content-type': { value: 'text/plain; charset=utf-8' }, 'cache-control': { value: 'no-store' }, 'x-content-type-options': { value: 'nosniff' } }, body: { encoding: 'text', data: 'Not found' } };
    request.uri = GUEST[uri];
    request.querystring = {};
    return request;
  }
  if (PAGES[uri]) request.uri = PAGES[uri];
  return request;
}
