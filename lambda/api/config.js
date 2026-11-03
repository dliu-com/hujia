'use strict';

const PREFIX = process.env.PARAMETER_PREFIX || '/hujia';
const NAMES = ['entra-client-id', 'entra-client-secret'];
// Shared by every dliu.com app (dliu-com/audit stack). The deploy also passes its value in ENTRA_TENANT_ID as a fallback.
const TENANT_PARAMETER = process.env.TENANT_PARAMETER || '/dliu/entra-tenant-id';
const TTL_MS = 5 * 60 * 1000;

let cached;
let cachedAt = 0;

let ssmClient;
function client() {
  if (!ssmClient) {
    const { SSMClient } = require('@aws-sdk/client-ssm');
    ssmClient = new SSMClient({});
  }
  return ssmClient;
}

class NotConfigured extends Error {}

async function loadConfig(ssm = client(), now = Date.now()) {
  if (cached && now - cachedAt < TTL_MS) return cached;
  const { GetParameterCommand, GetParametersCommand } = require('@aws-sdk/client-ssm');
  const [result, tenant] = await Promise.all([
    ssm.send(new GetParametersCommand({ Names: NAMES.map((name) => `${PREFIX}/${name}`), WithDecryption: true })),
    ssm.send(new GetParameterCommand({ Name: TENANT_PARAMETER })).then((r) => r.Parameter?.Value, (error) => {
      if (process.env.ENTRA_TENANT_ID) return process.env.ENTRA_TENANT_ID;
      if (error.name === 'ParameterNotFound') return undefined;
      throw error;
    }),
  ]);
  const values = Object.fromEntries((result.Parameters || []).map((p) => [p.Name.slice(PREFIX.length + 1), p.Value]));
  const missing = NAMES.filter((name) => !values[name]);
  if (missing.length) {
    throw new NotConfigured(`Missing SSM parameters under ${PREFIX}: ${missing.join(', ')}. Run "bash scripts/set-secrets.sh".`);
  }
  if (!tenant || !tenant.trim()) throw new NotConfigured(`Missing ${TENANT_PARAMETER}. Deploy the dliu-com/audit stack.`);
  cached = {
    tenantId: tenant.trim(),
    clientId: values['entra-client-id'].trim(),
    clientSecret: values['entra-client-secret'],
    allowedDomain: (process.env.ALLOWED_DOMAIN || process.env.ROOT_DOMAIN || 'dliu.com').trim().toLowerCase(),
  };
  cachedAt = now;
  return cached;
}

function resetConfigCache() {
  cached = undefined;
  cachedAt = 0;
}

module.exports = { loadConfig, resetConfigCache, NotConfigured };
