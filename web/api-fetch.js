'use strict';
// CloudFront signs /api requests to the Lambda function URL (origin access control). AWS rejects
// PUT/POST bodies there unless the browser sends the body's SHA-256 in x-amz-content-sha256.
(() => {
  const send = globalThis.fetch.bind(globalThis);
  const reads = new Set(['GET', 'HEAD', 'OPTIONS']);
  const hex = buffer => [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    const request = new Request(input instanceof Request ? input : url, init);
    if (url.origin !== location.origin || reads.has(request.method) || request.headers.has('x-amz-content-sha256')) return send(request);
    const headers = new Headers(request.headers);
    headers.set('x-amz-content-sha256', hex(await crypto.subtle.digest('SHA-256', await request.clone().arrayBuffer())));
    return send(new Request(request, { headers }));
  };
})();
