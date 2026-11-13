#!/bin/sh
# Install the Holochain agent skill into the current project, from git.
#
#   curl -fsSL https://raw.githubusercontent.com/Soushi888/holochain-agent-skills/main/install.sh | sh
#
# Run it from the root of the project that should get the skill. Arguments after
# `sh -s --` go to the bundled installer: `--global`, `--dry-run`, `--target claude,cursor`,
# `--copy` (copy instead of link). It clones the pinned release into one place
# (HOLOCHAIN_SKILLS_HOME, default ~/.holochain-agent-skills), or moves an existing clone to
# that release, then links the skill into every agent harness the project uses, so running
# it again after a new release updates every linked project.
#
# Needs git, and Node 22.18 or later (it runs the TypeScript installer directly) or Bun.
# POSIX sh, so it runs under dash, bash and the BSD and macOS shells alike.
set -eu

VERSION="${HOLOCHAIN_SKILLS_VERSION:-v1.0.0-rc.2}" # x-release-please-version
REPO="https://github.com/Soushi888/holochain-agent-skills.git"
DEST="${HOLOCHAIN_SKILLS_HOME:-$HOME/.holochain-agent-skills}"

say() { printf '%s\n' "holochain-skills: $*"; }
die() { printf '%s\n' "holochain-skills: $*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || die "git is required."

if [ -d "$DEST/.git" ]; then
  say "updating $DEST to $VERSION"
  git -C "$DEST" fetch --quiet --depth 1 origin tag "$VERSION"
  git -C "$DEST" -c advice.detachedHead=false checkout --quiet "$VERSION"
elif [ -e "$DEST" ]; then
  die "$DEST exists and is not a clone of this repository; move it or set HOLOCHAIN_SKILLS_HOME."
else
  say "cloning $VERSION into $DEST"
  git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$VERSION" "$REPO" "$DEST"
fi

# --copy is this script's word for the installer's default; everything else passes through.
LINK="--link"
ARGS=""
for a in "$@"; do
  case "$a" in
    --copy) LINK="" ;;
    *) ARGS="$ARGS $a" ;;
  esac
done

node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  v=$(node -p 'process.versions.node' 2>/dev/null) || return 1
  major=${v%%.*}; rest=${v#*.}; minor=${rest%%.*}
  [ "$major" -gt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -ge 18 ]; }
}

if command -v bun >/dev/null 2>&1; then
  RUN="bun"
elif node_ok; then
  RUN="node"
else
  die "the installer needs Node 22.18 or later, or Bun. The skill is cloned in $DEST; copy $DEST/skills/holochain into your agent's skills folder by hand, or install Node and run this again."
fi

# shellcheck disable=SC2086 # ARGS is a list of words on purpose
exec "$RUN" "$DEST/scripts/install.ts" install $LINK $ARGS
