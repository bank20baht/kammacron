#!/bin/sh
# Records the AI-factory demo from a clean start: a bug-hunting cron job, then a fixing one, each
# shown side by side; then the commits in a terminal. Real Claude runs (haiku): about $0.05.
# The demo server runs on its own data dir and port, and is stopped at the end.
set -e
WORK=$(cd "$(dirname "$0")" && pwd)
PORT=${DEMO_PORT:-7431}
cd "$WORK"

stop_server() {
  pid=$(lsof -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
  [ -n "$pid" ] && kill $pid && sleep 2 || true
}

# a clean demo: no server, no data, the shop back at its first commit
stop_server
rm -rf data state.json clips && mkdir -p data clips out
(cd shop && git reset -q --hard "$(git rev-list --max-parents=0 HEAD)" && git clean -qfd)

(bin/kammacron start > out/server.log 2>&1 &)
for i in $(seq 1 40); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 0.5; done
python3 -c "
import sys; sys.path.insert(0, 'scripts')
from common import api, SP
print('project', api('POST', '/api/projects', {'slug': 'shop', 'name': 'Baan Kanom', 'repo_path': SP + '/shop'})['id'])"

python3 scripts/record.py hunt_setup hunt fix_setup fix
vhs tapes/git.tape

# the real numbers, for the captions and the conveyor card
python3 -c "
import json, sys; sys.path.insert(0, 'scripts')
from common import api
from datetime import datetime
t = lambda s: datetime.fromisoformat(s.replace('Z', '+00:00'))
runs = [api('GET', f'/api/runs/{r[\"id\"]}') for r in api('GET', '/api/runs?project_id=1&limit=50')]
cards = api('GET', '/api/cards?project_id=1')
pilot = [c for c in cards if 'auto-pilot' in c['tags']]
first = min(t(r['started_at']) for r in runs)
last = max(t(r['ended_at']) for r in runs if r['ended_at'])
json.dump({
  'runs': len(runs), 'ok': sum(r['status'] == 'succeeded' for r in runs),
  'cards': len(cards), 'found': len(pilot),
  'ready': sum(not c['human'] for c in pilot),
  'human': sum(c['human'] or 'auto-pilot' not in c['tags'] for c in cards),
  'fixed': sum(c['status'] == 'done' for c in pilot),
  'review': sum(c['status'] == 'review' for c in pilot),
  'turns': sum(r['num_turns'] or 0 for r in runs), 'cost': sum(r['cost_usd'] or 0 for r in runs),
  'minutes': round((last - first).total_seconds() / 60, 1),
  'starts': sorted(t(r['started_at']).astimezone().strftime('%H:%M:%S') for r in runs),
  'titles': [c['title'] for c in cards]}, open('clips/stats.json', 'w'), indent=1, ensure_ascii=False)
print(open('clips/stats.json').read())"
git -C shop log --oneline > clips/commit.txt
stop_server
echo "recorded. next: python3 scripts/compose.py  -> out/kammacron-cron-agents.mp4"
