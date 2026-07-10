#!/usr/bin/env bash
set -euo pipefail

# Manually drains the DelayRadar job queue on production.
# Stopgap for the Hobby-plan cron (runs only at 09:00/21:00 UTC — see vercel.json).
# Once traffic justifies upgrading to a plan with per-minute cron, this can be retired.

cd "$(dirname "$0")/.."
export $(grep -E "^(CRON_SECRET|SHOPIFY_APP_URL)=" .env | xargs)

curl -s -H "Authorization: Bearer ${CRON_SECRET}" "${SHOPIFY_APP_URL}/api/cron/worker"
echo
