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

# The clone is managed by this script: a rerun moves it to the pinned tag, so local edits
# in it are not supported. --dry-run still clones or updates it; only the project is left alone.
if [ -d "$DEST/.git" ]; then
  origin=$(git -C "$DEST" remote get-url origin 2>/dev/null || true)
  case "$origin" in
    "$REPO" | "${REPO%.git}") ;;
    *) die "$DEST is a git repository but not a clone of $REPO; move it or set HOLOCHAIN_SKILLS_HOME." ;;
  esac
  say "updating $DEST to $VERSION"
  git -C "$DEST" fetch --quiet --depth 1 origin tag "$VERSION" || die "could not fetch tag $VERSION from $REPO."
  git -C "$DEST" -c advice.detachedHead=false checkout --quiet "$VERSION" || die "could not check out $VERSION in $DEST; a local edit there may be in the way."
elif [ -e "$DEST" ]; then
  die "$DEST exists and is not a clone of this repository; move it or set HOLOCHAIN_SKILLS_HOME."
else
  say "cloning $VERSION into $DEST"
  git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$VERSION" "$REPO" "$DEST" || die "could not clone tag $VERSION from $REPO."
fi

[ -f "$DEST/scripts/install.ts" ] || die "$VERSION has no scripts/install.ts; pin a tag from v1.0.0-rc.1 on."

# --copy is this script's word for the installer's default; everything else passes through,
# rebuilt as positional parameters so an argument holding a space stays one argument.
LINK="--link"
n=$#
while [ "$n" -gt 0 ]; do
  a=$1; shift; n=$((n - 1))
  if [ "$a" = "--copy" ]; then LINK=""; else set -- "$@" "$a"; fi
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

# shellcheck disable=SC2086 # LINK is empty or one word, on purpose
exec "$RUN" "$DEST/scripts/install.ts" install $LINK "$@"
