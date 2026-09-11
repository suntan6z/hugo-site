#!/usr/bin/env bash
# One-time creation of the Serverless Container for admin.loconsole.eu.
#
# Run once, from admin/, after CI has pushed at least one image. It reads
# admin/.env so the secrets stay on your machine and in Scaleway — never in the
# repo, and never in GitHub Actions. After this, CI only ever swaps the image.
#
# Re-running is safe: it updates the existing container's configuration instead
# of creating a second one. Use it whenever a secret is rotated.
set -euo pipefail
# Refuse to run under `bash -x`: every value below would be echoed, including
# the GitHub App private key and the session secret.
set +x
cd "$(dirname "$0")/.."

REGION=fr-par
NAMESPACE=loconsole-admin
NAME=admin
REGISTRY=rg.fr-par.scw.cloud/loconsole-admin/admin

[ -f .env ] || { echo "admin/.env not found"; exit 1; }
set -a; . ./.env; set +a

# The key in .env is the CONTAINER's storage credential, scoped to Object
# Storage objects and nothing else. Sourcing .env exports it, and the scw CLI
# prefers SCW_ACCESS_KEY/SCW_SECRET_KEY from the environment over the config
# profile — so every management call below would silently return an empty list
# rather than an error. Keep a copy under a different name and take it back out
# of the environment so scw falls through to your own profile.
STORAGE_ACCESS_KEY="${SCW_ACCESS_KEY:-}"
STORAGE_SECRET_KEY="${SCW_SECRET_KEY:-}"
STORAGE_REGION="${SCW_REGION:-fr-par}"
# SCW_REGION is likewise meant for the container, and the CLI warns that it is
# deprecated in favour of SCW_DEFAULT_REGION.
unset SCW_ACCESS_KEY SCW_SECRET_KEY SCW_REGION

need() { [ -n "${!1:-}" ] || { echo "missing $1 in admin/.env"; exit 1; }; }
for v in GH_APP_ID GH_INSTALLATION_ID GH_PRIVATE_KEY_B64 SESSION_SECRET \
         BOOTSTRAP_TOKEN SCW_BUCKET STORAGE_ACCESS_KEY STORAGE_SECRET_KEY; do need "$v"; done

NS_ID=$(scw container namespace list region=$REGION -o json \
  | jq -r --arg n "$NAMESPACE" '.[] | select(.name==$n) | .id')
[ -n "$NS_ID" ] || { echo "namespace $NAMESPACE not found"; exit 1; }

IMAGE="${1:-$REGISTRY:latest}"

# Public config. ORIGIN and RP_ID are the deployed values, overriding whatever
# .env uses for localhost. ADMIN_MODE=github forces real commits. ALLOW_DEV_LOGIN
# is deliberately absent.
ENVS=(
  "environment-variables.ADMIN_MODE=github"
  "environment-variables.NODE_ENV=production"
  "environment-variables.ORIGIN=https://admin.loconsole.eu"
  "environment-variables.RP_ID=admin.loconsole.eu"
  "environment-variables.BODY_SIZE_LIMIT=12M"
  # adapter-node: the real client address, for the audit log and the sign-in
  # rate limit. Verified against production rather than assumed:
  #   - X-Forwarded-For carries the client then THREE Scaleway hops, and the
  #     last hop rotates per request — XFF_DEPTH=1 recorded 100.96.x.x and made
  #     every request look like a new visitor, so the rate limit never fired.
  #   - A client-supplied X-Forwarded-For is prepended, so the left-most entry
  #     is attacker-controlled.
  #   - X-Envoy-External-Address is set by Scaleway's edge from the actual
  #     connection, and a forged value is discarded and overwritten.
  "environment-variables.ADDRESS_HEADER=X-Envoy-External-Address"
  "environment-variables.GH_APP_ID=$GH_APP_ID"
  "environment-variables.GH_INSTALLATION_ID=$GH_INSTALLATION_ID"
  "environment-variables.GH_OWNER=${GH_OWNER:-suntan6z}"
  "environment-variables.GH_REPO=${GH_REPO:-hugo-site}"
  "environment-variables.GH_BRANCH=${GH_BRANCH:-main}"
  "environment-variables.SCW_BUCKET=$SCW_BUCKET"
  "environment-variables.SCW_REGION=$STORAGE_REGION"
)
SECRETS=(
  "secret-environment-variables.GH_PRIVATE_KEY_B64=$GH_PRIVATE_KEY_B64"
  "secret-environment-variables.SESSION_SECRET=$SESSION_SECRET"
  "secret-environment-variables.BOOTSTRAP_TOKEN=$BOOTSTRAP_TOKEN"
  "secret-environment-variables.SCW_ACCESS_KEY=$STORAGE_ACCESS_KEY"
  "secret-environment-variables.SCW_SECRET_KEY=$STORAGE_SECRET_KEY"
  "secret-environment-variables.INDEXNOW_KEY=${INDEXNOW_KEY:-}"
  # Optional integrations. Passed as empty strings when unset, so removing a key
  # from .env actually removes it from the container rather than leaving the old
  # value behind.
  "secret-environment-variables.BING_API_KEY=${BING_API_KEY:-}"
  "secret-environment-variables.RESEND_API_KEY=${RESEND_API_KEY:-}"
  "secret-environment-variables.DEEPL_API_KEY=${DEEPL_API_KEY:-}"
)

# Report what will and will not be configured, so a silently missing key is
# visible at the point of deploying rather than as an empty panel later.
for v in BING_API_KEY RESEND_API_KEY INDEXNOW_KEY DEEPL_API_KEY; do
  [ -n "${!v:-}" ] && echo "  $v: set" || echo "  $v: not set (feature stays disabled)"
done

EXISTING=$(scw container container list namespace-id="$NS_ID" region=$REGION -o json \
  | jq -r --arg n "$NAME" '.[] | select(.name==$n) | .id')

if [ -n "$EXISTING" ]; then
  echo "updating existing container $EXISTING"
  scw container container update "$EXISTING" region=$REGION \
    image="$IMAGE" "${ENVS[@]}" "${SECRETS[@]}"
else
  echo "creating container $NAME from $IMAGE"
  scw container container create name=$NAME namespace-id="$NS_ID" region=$REGION \
    image="$IMAGE" port=8080 protocol=http1 \
    min-scale=0 max-scale=3 memory-limit-bytes=1GB mvcpu-limit=250 \
    https-connections-only=true privacy=public \
    description="Admin portal for lorenzo.loconsole.eu" \
    "${ENVS[@]}" "${SECRETS[@]}"
fi

echo
echo "endpoint:"
scw container container list namespace-id="$NS_ID" region=$REGION -o json \
  | jq -r --arg n "$NAME" '.[] | select(.name==$n) | "\(.status)  \(.domain_name)"'
