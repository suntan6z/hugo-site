#!/usr/bin/env bash
# Deploys both functions (contact, newsletter) to Scaleway.
# Requires: `scw` CLI configured (scw init, or SCW_ACCESS_KEY/SCW_SECRET_KEY/
# SCW_DEFAULT_ORGANIZATION_ID/SCW_DEFAULT_PROJECT_ID env vars), plus
# RESEND_API_KEY and RESEND_AUDIENCE_ID env vars set.
#
# Safe to re-run: reuses the namespace/functions if they already exist.
set -euo pipefail
cd "$(dirname "$0")"

: "${RESEND_API_KEY:?Set RESEND_API_KEY}"
: "${RESEND_AUDIENCE_ID:?Set RESEND_AUDIENCE_ID}"

NAMESPACE_NAME="loconsole-api"
ALLOWED_ORIGIN="https://lorenzo.loconsole.eu"

echo "==> Looking up namespace '$NAMESPACE_NAME'..."
NS_ID=$(scw function namespace list name="$NAMESPACE_NAME" -o json | jq -r '.[0].id // empty')

if [ -z "$NS_ID" ]; then
  echo "==> Creating namespace..."
  NS_ID=$(scw function namespace create name="$NAMESPACE_NAME" \
    environment-variables.ALLOWED_ORIGIN="$ALLOWED_ORIGIN" \
    secret-environment-variables.0.key=RESEND_API_KEY \
    secret-environment-variables.0.value="$RESEND_API_KEY" \
    secret-environment-variables.1.key=RESEND_AUDIENCE_ID \
    secret-environment-variables.1.value="$RESEND_AUDIENCE_ID" \
    -o json | jq -r '.id')
else
  echo "==> Updating namespace secrets/env (namespace $NS_ID)..."
  scw function namespace update "$NS_ID" \
    environment-variables.ALLOWED_ORIGIN="$ALLOWED_ORIGIN" \
    secret-environment-variables.0.key=RESEND_API_KEY \
    secret-environment-variables.0.value="$RESEND_API_KEY" \
    secret-environment-variables.1.key=RESEND_AUDIENCE_ID \
    secret-environment-variables.1.value="$RESEND_AUDIENCE_ID" \
    -o json > /dev/null
fi

if [ -z "$NS_ID" ] || [ "$NS_ID" = "null" ]; then
  echo "ERROR: could not determine namespace ID. Run 'scw function namespace list -o json' and inspect the output." >&2
  exit 1
fi
echo "    Namespace ID: $NS_ID"

echo "==> Packaging function code..."
rm -f function.zip
zip -rq function.zip contact.js newsletter.js lib package.json

# Polls a function until it reaches "ready" or "error" (builds take ~1-3 min:
# image build -> registry push -> rollout). Prints status along the way.
wait_for_ready() {
  local fn_id="$1"
  local attempt
  for attempt in $(seq 1 30); do
    local info status error_msg build_msg
    info=$(scw function function get "$fn_id" -o json)
    status=$(echo "$info" | jq -r '.status')
    build_msg=$(echo "$info" | jq -r '.build_message // empty')
    error_msg=$(echo "$info" | jq -r '.error_message // empty')

    if [ "$status" = "ready" ]; then
      return 0
    fi
    if [ "$status" = "error" ]; then
      echo "ERROR: function deployment failed: ${error_msg:-unknown error}" >&2
      return 1
    fi
    echo "    ...${build_msg:-$status} (${attempt}0s)"
    sleep 10
  done
  echo "ERROR: timed out waiting for function to become ready (still '$status' after 5 minutes)." >&2
  return 1
}

deploy_function() {
  local fn_name="$1" handler="$2"
  echo "==> Deploying '$fn_name'..."

  local fn_id
  fn_id=$(scw function function list namespace-id="$NS_ID" name="$fn_name" -o json | jq -r '.[0].id // empty')

  if [ -z "$fn_id" ]; then
    # `scw function deploy` is a composite "workflow" command: it streams
    # multi-step progress lines to stdout even with -o json, with only the
    # final line being the actual JSON result.
    fn_id=$(scw function deploy namespace-id="$NS_ID" name="$fn_name" runtime=node22 zip-file=function.zip -o json | tail -1 | jq -r '.id')
    if [ -z "$fn_id" ] || [ "$fn_id" = "null" ]; then
      echo "ERROR: could not determine function ID for '$fn_name'. Run 'scw function function list namespace-id=$NS_ID -o json' and inspect the output." >&2
      exit 1
    fi
    scw function function update "$fn_id" handler="$handler" min-scale=0 max-scale=5 memory-limit=128 -o json > /dev/null
  else
    local size upload_url
    size=$(wc -c < function.zip | tr -d ' ')
    upload_url=$(scw function function get-upload-url "$fn_id" content-length="$size" -o json | jq -r '.url // empty')
    if [ -z "$upload_url" ]; then
      echo "ERROR: could not get an upload URL for '$fn_name'. Run 'scw function function get-upload-url $fn_id content-length=$size -o json' and inspect the output." >&2
      exit 1
    fi
    curl -sf -X PUT -H "Content-Type: application/octet-stream" --data-binary @function.zip "$upload_url" > /dev/null
    # `update` (with a handler value) auto-redeploys and picks up the code
    # just uploaded above — no separate `function deploy` call needed.
    scw function function update "$fn_id" handler="$handler" -o json > /dev/null
  fi

  wait_for_ready "$fn_id"

  local domain
  domain=$(scw function function get "$fn_id" -o json | jq -r '.domain_name // empty')
  echo "    Ready: https://$domain"
}

deploy_function contact contact.handle
deploy_function newsletter newsletter.handle

rm -f function.zip
echo "==> Done. Paste the two endpoint URLs above into static/js/main.js, layouts/blog/single.html, and static/_headers."
