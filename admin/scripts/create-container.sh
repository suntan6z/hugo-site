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
cd "$(dirname "$0")/.."

REGION=fr-par
NAMESPACE=loconsole-admin
NAME=admin
REGISTRY=rg.fr-par.scw.cloud/loconsole-admin/admin

[ -f .env ] || { echo "admin/.env not found"; exit 1; }
set -a; . ./.env; set +a

need() { [ -n "${!1:-}" ] || { echo "missing $1 in admin/.env"; exit 1; }; }
for v in GH_APP_ID GH_INSTALLATION_ID GH_PRIVATE_KEY_B64 SESSION_SECRET \
         BOOTSTRAP_TOKEN SCW_BUCKET SCW_ACCESS_KEY SCW_SECRET_KEY; do need "$v"; done

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
  "environment-variables.GH_APP_ID=$GH_APP_ID"
  "environment-variables.GH_INSTALLATION_ID=$GH_INSTALLATION_ID"
  "environment-variables.GH_OWNER=${GH_OWNER:-suntan6z}"
  "environment-variables.GH_REPO=${GH_REPO:-hugo-site}"
  "environment-variables.GH_BRANCH=${GH_BRANCH:-main}"
  "environment-variables.SCW_BUCKET=$SCW_BUCKET"
  "environment-variables.SCW_REGION=${SCW_REGION:-fr-par}"
)
SECRETS=(
  "secret-environment-variables.0.key=GH_PRIVATE_KEY_B64"
  "secret-environment-variables.0.value=$GH_PRIVATE_KEY_B64"
  "secret-environment-variables.1.key=SESSION_SECRET"
  "secret-environment-variables.1.value=$SESSION_SECRET"
  "secret-environment-variables.2.key=BOOTSTRAP_TOKEN"
  "secret-environment-variables.2.value=$BOOTSTRAP_TOKEN"
  "secret-environment-variables.3.key=SCW_ACCESS_KEY"
  "secret-environment-variables.3.value=$SCW_ACCESS_KEY"
  "secret-environment-variables.4.key=SCW_SECRET_KEY"
  "secret-environment-variables.4.value=$SCW_SECRET_KEY"
  "secret-environment-variables.5.key=INDEXNOW_KEY"
  "secret-environment-variables.5.value=${INDEXNOW_KEY:-}"
)

EXISTING=$(scw container container list namespace-id="$NS_ID" region=$REGION -o json \
  | jq -r --arg n "$NAME" '.[] | select(.name==$n) | .id')

if [ -n "$EXISTING" ]; then
  echo "updating existing container $EXISTING"
  scw container container update "$EXISTING" region=$REGION \
    registry-image="$IMAGE" "${ENVS[@]}" "${SECRETS[@]}" redeploy=true
else
  echo "creating container $NAME from $IMAGE"
  scw container container create name=$NAME namespace-id="$NS_ID" region=$REGION \
    registry-image="$IMAGE" port=8080 protocol=http1 \
    min-scale=0 max-scale=3 memory-limit=512 cpu-limit=250 \
    http-option=redirected privacy=public \
    description="Admin portal for lorenzo.loconsole.eu" \
    "${ENVS[@]}" "${SECRETS[@]}"
fi

echo
echo "endpoint:"
scw container container list namespace-id="$NS_ID" region=$REGION -o json \
  | jq -r --arg n "$NAME" '.[] | select(.name==$n) | .domain_name'
