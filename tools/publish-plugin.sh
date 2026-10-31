#!/usr/bin/env bash
# Publish the plugin package and regenerate the market index.
#
# The DSH plugin market installs a git source as a package, and pnpm treats the repository
# ROOT as that package. This repo's root is the service, so the installable package lives in
# its own repository (Orchidroot/dsh-friends-plugin); this script keeps it in sync.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
repo_dir="$root/.market/plugin-repo"
repo_url="https://github.com/Orchidroot/dsh-friends-plugin.git"
push=1
[ "${1:-}" = "--no-push" ] && push=0

mkdir -p "$root/.market"
if [ ! -d "$repo_dir/.git" ]; then
  git clone --quiet "$repo_url" "$repo_dir"
fi
git -C "$repo_dir" fetch --quiet origin main
git -C "$repo_dir" checkout --quiet -B main origin/main

# Mirror plugin/ into the package repo.
find "$repo_dir" -mindepth 1 -maxdepth 1 ! -name .git ! -name .gitattributes -exec rm -rf {} +
cp -R "$root"/plugin/index.js "$root"/plugin/host.mjs "$root"/plugin/chat.mjs \
      "$root"/plugin/stream.mjs "$root"/plugin/client.js "$root"/plugin/cordis.patch.yml \
      "$root"/plugin/README.md "$root"/plugin/LICENSE "$root"/plugin/icon.svg \
      "$root"/plugin/package.json "$root"/plugin/locale "$repo_dir"/

version="$(PN="$root/plugin/package.json" node -e 'const fs=require("fs"),p=process.env.PN.replace(/^\/([a-z])\//i, (m,d)=>d.toUpperCase()+":/");process.stdout.write(JSON.parse(fs.readFileSync(p,"utf8")).version)')"
name="$(PN="$root/plugin/package.json" node -e 'const fs=require("fs"),p=process.env.PN.replace(/^\/([a-z])\//i, (m,d)=>d.toUpperCase()+":/");process.stdout.write(JSON.parse(fs.readFileSync(p,"utf8")).name)')"

git -C "$repo_dir" add -A
if ! git -C "$repo_dir" diff --cached --quiet; then
  git -C "$repo_dir" -c core.autocrlf=false commit -q -m "release: $name $version"
  [ "$push" = 1 ] && git -C "$repo_dir" push --quiet origin main
fi
commit="$(git -C "$repo_dir" rev-parse HEAD)"

VERSION="$version" NAME="$name" COMMIT="$commit" node --input-type=module -e '
import { writeFileSync } from "node:fs";
const { VERSION, NAME, COMMIT } = process.env;
const index = {
  format: 1,
  title: { en: "DSH Friends", zh: "DSH 好友" },
  description: {
    en: "Floating friends list, chat and rich presence for DSH, backed by a self-hosted service.",
    zh: "DSH 里的好友浮窗、聊天和在线状态，配套一个可自部署的好友服务。",
  },
  metadata: { categories: { social: { title: { en: "Social", zh: "社交" } } } },
  plugins: [{
    name: NAME,
    title: { en: "DSH Friends", zh: "DSH 好友" },
    description: {
      en: "Floating friends window, multi-tab chat, custom avatars and status words. Needs a friends service: point serviceUrl at your own, or at the public trial instance.",
      zh: "好友浮窗、多标签聊天、自定义头像和状态词条。需要一台好友服务：serviceUrl 指向自己的服务，或公共体验实例。",
    },
    icon: `https://github.com/Orchidroot/dsh-friends-plugin/raw/${COMMIT}/icon.svg`,
    author: "Orchidroot",
    homepage: "https://github.com/Orchidroot/dsh-friends",
    repository: { url: "https://github.com/Orchidroot/dsh-friends-plugin" },
    category: "social",
    keywords: ["friends", "chat", "presence", "status"],
    versions: [{
      version: VERSION,
      publishTimestamp: Math.floor(Date.now() / 1000),
      source: { type: "git", url: "https://github.com/Orchidroot/dsh-friends-plugin", commit: COMMIT },
      engines: { dsh: ">=0.2.1-rc.5 <0.3.0" },
    }],
  }],
};
writeFileSync(process.argv[1], JSON.stringify(index, null, 2) + "\n");
' "$(cygpath -w "$root/docs/market-index.json")"

echo "package commit: $commit"
echo "index updated for $name@$version"
echo "next: git add docs/market-index.json && git commit && git push"
