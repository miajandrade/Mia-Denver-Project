#!/usr/bin/env bash
# Run this from your local machine to refresh luma-events.json.
# The GitHub Actions workflow is blocked by Lu.ma's IP filter on Azure data
# centers. This script runs the same fetch from your residential IP and pushes
# the updated file to the repo.
#
# Usage: bash scripts/update-luma.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP_FILE="$(mktemp /tmp/luma_raw_XXXX.json)"

echo "Fetching Lu.ma Denver events..."
curl -s \
  -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
  -H 'Accept: application/json' \
  -H 'Accept-Language: en-US,en;q=0.9' \
  -H 'Referer: https://lu.ma/discover' \
  'https://api.lu.ma/discover/get-paginated-events?pagination_limit=50&geo_latitude=39.7392&geo_longitude=-104.9903' \
  -o "$TMP_FILE"

python3 << EOF
import json, sys
from datetime import datetime, timezone

with open('$TMP_FILE') as f:
    data = json.load(f)

all_entries    = data.get('entries', [])
denver_entries = [
    e for e in all_entries
    if (e.get('event', {}).get('geo_address_info') or {}).get('city', '').lower() == 'denver'
]

if len(all_entries) == 0:
    print("ERROR: Lu.ma returned 0 entries. Nothing written.")
    sys.exit(1)

output = {
    'fetchedAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    'rawCount':  len(all_entries),
    'entries':   denver_entries,
}

out_path = '$REPO_ROOT/luma-events.json'
with open(out_path, 'w') as f:
    json.dump(output, f, indent=2)

print(f"Saved {len(denver_entries)} Denver events (of {len(all_entries)} total) -> {out_path}")
EOF

rm -f "$TMP_FILE"

cd "$REPO_ROOT"
echo "Pulling latest remote changes before committing..."
git pull --no-rebase
git add luma-events.json
git diff --staged --quiet && echo "No changes to commit." && exit 0
git commit -m "chore: refresh Lu.ma Denver events (manual run)"
git push
echo "Done — luma-events.json updated and pushed."
