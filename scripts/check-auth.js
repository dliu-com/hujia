#!/usr/bin/env node
'use strict';

// Read-only diagnostics. Never print tenant IDs, client IDs, secrets, or tokens.
const { SSMClient } = require('@aws-sdk/client-ssm');
const { loadConfig } = require('../lambda/api/config');
const CALLBACK = 'https://jh.dliu.com/auth/callback';
const REGION = process.env.AWS_REGION || 'eu-west-1';

async function request(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(15000), redirect: 'manual' });
}

async function check() {
  require('./check-aws-identity').assertNonRootIdentity();
  const config = await loadConfig(new SSMClient({ region: REGION }));
  console.log('AWS settings: all three Microsoft parameters are available.');
  const base = `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}`;
  const discovery = await request(`${base}/v2.0/.well-known/openid-configuration`);
  if (!discovery.ok) throw new Error(`Microsoft tenant discovery failed (HTTP ${discovery.status}).`);
  const metadata = await discovery.json();
  if (metadata.issuer !== `${base}/v2.0`) throw new Error('Microsoft returned an unexpected tenant issuer.');
  console.log('Microsoft tenant discovery: passed.');

  const tokenResponse = await request(`${base}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: config.clientId,
      client_secret: config.clientSecret, scope: 'https://graph.microsoft.com/.default',
    }),
  });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || !token.access_token) {
    const code = Array.isArray(token.error_codes) ? token.error_codes.filter(Number.isInteger).join(', ') : 'unavailable';
    throw new Error(`Microsoft rejected the credential check (HTTP ${tokenResponse.status}; error code ${code}).`);
  }
  console.log('Microsoft app credentials: accepted; access token received and not printed.');
  const appResponse = await request(`https://graph.microsoft.com/v1.0/applications(appId='${encodeURIComponent(config.clientId)}')?$select=web`, {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (appResponse.ok) {
    const app = await appResponse.json();
    const registered = app.web?.redirectUris?.includes(CALLBACK);
    console.log(`Registered Web callback: ${registered ? 'matches' : 'does not match'} ${CALLBACK}`);
    if (!registered) process.exitCode = 1;
  } else {
    console.log(`Registered callback inspection: unavailable (HTTP ${appResponse.status}); no permissions changed.`);
  }
  delete token.access_token;

  try {
    const site = await request(CALLBACK);
    console.log(`Callback URL reachability: HTTP ${site.status}.`);
  } catch {
    console.log('Callback URL reachability: unavailable.');
  }
  console.log('This checks credentials and callback configuration, not an interactive sign-in session.');
}

check().catch(error => {
  // AWS errors can contain request details. Report the error class only.
  const safe = error.message?.startsWith('Microsoft ') ? error.message : `Connection check failed (${error.name || 'Error'}).`;
  console.error(safe);
  process.exitCode = 1;
});
