#!/usr/bin/env bash
# Stores the Microsoft Entra sign-in settings in SSM Parameter Store.
# Values are read interactively and passed to AWS via a private temp file, so they never
# appear in shell history, process arguments, or this repository.
set -euo pipefail
set +x

REGION="${AWS_REGION:-eu-west-1}"
PREFIX="${PARAMETER_PREFIX:-/hujia}"
TEMP_INPUT=""

cleanup() {
  [[ -z "$TEMP_INPUT" ]] || rm -f "$TEMP_INPUT"
}
trap 'exit_status=$?; trap - EXIT; cleanup; exit "$exit_status"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

for dependency in aws node; do
  command -v "$dependency" >/dev/null || { echo "Missing ${dependency}; install it before running this script." >&2; exit 1; }
done

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
node "$SCRIPT_DIR/check-aws-identity.js" || {
  echo "Select a non-root AWS identity before saving secrets." >&2
  exit 1
}

current() {
  aws ssm get-parameter --region "$REGION" --name "$PREFIX/$1" --query Parameter.Value --output text 2>/dev/null || true
}

put() { # name type value
  # The value goes through a private temp file (not argv) so it never shows up in `ps`.
  TEMP_INPUT="$(umask 077; mktemp)"
  NAME="$PREFIX/$1" TYPE="$2" VALUE="$3" node -e '
    process.stdout.write(JSON.stringify({ Name: process.env.NAME, Type: process.env.TYPE, Value: process.env.VALUE, Overwrite: true }));
  ' > "$TEMP_INPUT"
  if ! aws ssm put-parameter --region "$REGION" --cli-input-json "file://$TEMP_INPUT" >/dev/null; then
    echo "Failed to save $PREFIX/$1" >&2
    exit 1
  fi
  rm -f "$TEMP_INPUT"
  TEMP_INPUT=""
  echo "  saved $PREFIX/$1 ($2)"
}

prompt() { # var label default
  local value
  read -r -p "$2${3:+ [$3]}: " value
  printf -v "$1" '%s' "${value:-$3}"
}

echo "Microsoft sign-in settings for jh.dliu.com: ${PREFIX} in ${REGION}."
echo "Press Enter to keep the current value. Settings are stored in AWS, not in this repository."
TENANT_DEFAULT="$(current entra-tenant-id)"
if [[ -z "$TENANT_DEFAULT" ]]; then
  TENANT_DEFAULT="$(aws ssm get-parameter --region "$REGION" --name /travel-plan/entra-tenant-id --query Parameter.Value --output text 2>/dev/null || true)"
fi
prompt TENANT_ID "Directory (tenant) ID" "$TENANT_DEFAULT"
prompt CLIENT_ID "Application (client) ID" "$(current entra-client-id)"
read -r -s -p "Client secret VALUE (hidden; Enter to keep current): " CLIENT_SECRET; echo

[[ -n "$TENANT_ID" && -n "$CLIENT_ID" ]] || { echo "Tenant ID and client ID are required." >&2; exit 1; }
if [[ -z "$CLIENT_SECRET" ]] && ! aws ssm get-parameter --region "$REGION" --name "$PREFIX/entra-client-secret" --query Parameter.Name --output text >/dev/null 2>&1; then
  echo "No client secret stored yet; run again and enter its Value." >&2
  exit 1
fi

put entra-tenant-id String "$TENANT_ID"
put entra-client-id String "$CLIENT_ID"
if [[ -n "$CLIENT_SECRET" ]]; then
  put entra-client-secret SecureString "$CLIENT_SECRET"
fi
unset CLIENT_SECRET
echo "Settings saved. The deployed app will read these parameters. This command does not deploy the site."
