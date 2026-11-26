#!/bin/sh
# Makes (or refreshes) a work dir for the demo video: the scripts, a `kammacron` that runs this
# repo's code on its own data dir and port, the vhs tapes, and the buggy shop repo the agents fix.
#
#   .claude/skills/demo-video/kit/setup.sh [work dir]     default: $TMPDIR/kammacron-video
set -e
KIT=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$KIT/../../../.." && pwd)
WORK=${1:-${TMPDIR:-/tmp}/kammacron-video}
PORT=${DEMO_PORT:-7431}
mkdir -p "$WORK/bin" "$WORK/data" "$WORK/out" "$WORK/clips" "$WORK/tapes"
WORK=$(cd "$WORK" && pwd)
rm -rf "$WORK/scripts" && cp -R "$KIT/scripts" "$WORK/scripts"
cp "$KIT/make.sh" "$WORK/make.sh" && chmod +x "$WORK/make.sh"
echo "$REPO" > "$WORK/repo.txt"

cat > "$WORK/bin/kammacron" <<WRAP
#!/bin/sh
# this repo's kammacron, on the demo's own data dir and port (never the one you use)
export KAMMACRON_DATA_DIR=$WORK/data
export KAMMACRON_PORT=$PORT
exec bun "$REPO/apps/server/src/cli.ts" "\$@"
WRAP
chmod +x "$WORK/bin/kammacron"

sed "s|@WORK@|$WORK|g" "$KIT/tapes/setup.tape.in" > "$WORK/tapes/setup.tape"
cp "$KIT/tapes/git.tape" "$WORK/tapes/git.tape"

# the shop: a tiny static site with five real bugs, committed once as "first version"
rm -rf "$WORK/shop" && mkdir "$WORK/shop"
cp "$KIT/shop/index.html" "$KIT/shop/menu.html" "$KIT/shop/app.js" "$WORK/shop/"
cp "$KIT/shop/CLAUDE.md.in" "$WORK/shop/CLAUDE.md"
(cd "$WORK/shop" && git init -q -b main && git add . &&
  git -c user.name=demo -c user.email=demo@example.com commit -qm "first version")

echo "work dir: $WORK"
echo "next: build the web app (bun run --filter web build), then $WORK/make.sh, then python3 $WORK/scripts/compose.py"
