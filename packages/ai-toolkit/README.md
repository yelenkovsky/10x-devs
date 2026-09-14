# @yelenkovsky/ai-toolkit

Versioned team AI artifacts (skills and rules) published to **GitHub Packages**. This is Model 1 from the shared-registry lesson: the recipient is a GitHub-hosted team, so the registry is the one we already have — not AWS CodeArtifact and not a custom API/CLI.

Package path in this repo: `packages/ai-toolkit/` (the repo root is the 10xUsage Astro app and is **not** this package).

## What it installs

- Skill `code-review` → `.cursor/skills/code-review/` and `.claude/skills/code-review/`
- Team hard rules, between sentinels, in `AGENTS.md` and `CLAUDE.md`:

```html
<!-- BEGIN @yelenkovsky/ai-toolkit -->
…
<!-- END @yelenkovsky/ai-toolkit -->
```

Text outside those markers is left alone. Uninstall removes the managed skill files and the sentinel block; it does not delete `AGENTS.md` / `CLAUDE.md`.

Manifests: `.cursor/.ai-toolkit-manifest.json` and `.claude/.ai-toolkit-manifest.json`.

## Consumer install

In the **consumer** repo (not required in 10xUsage itself), commit a mapping-only `.npmrc` — no token:

```
@yelenkovsky:registry=https://npm.pkg.github.com
```

Locally, log in once (classic PAT with `read:packages` until GitHub's token types for the npm registry settle):

```bash
npm login --scope=@yelenkovsky --registry=https://npm.pkg.github.com --auth-type=legacy
npm install @yelenkovsky/ai-toolkit --save-dev
```

`postinstall` copies artifacts. To apply without depending on postinstall:

```bash
npx ai-toolkit install
npx ai-toolkit uninstall
```

Override tools with `AI_TOOLKIT_TOOLS=cursor` or `AI_TOOLKIT_TOOLS=claude-code`. Point at another tree with `PROJECT_ROOT=/path/to/repo`.

### CI on a consumer

GitHub Actions in the **same** user/repo that publishes the package can read it after the package is linked to that repo. Foreign CI (another owner, Cloudflare builds) needs a long-lived `GH_PKG_TOKEN` secret. Do not commit `_authToken`. A CI preinstall helper that is safe to commit:

```bash
[ -n "$GH_PKG_TOKEN" ] && echo '//npm.pkg.github.com/:_authToken=${GH_PKG_TOKEN}' >> .npmrc || true
```

## Publish

GitHub Actions workflow `.github/workflows/publish-ai-toolkit.yml` validates on PRs that touch this package and publishes from `packages/ai-toolkit/` on push to `main` using `GITHUB_TOKEN`. Duplicate versions are skipped (GitHub Packages returns 409).

This repo's Actions remote is `github` (`github.com/yelenkovsky/10x-devs`), not Cursor Origin. A commit that exists only on `origin` will not publish:

```bash
git push github main
```

Bump `version` in `packages/ai-toolkit/package.json` when artifacts change, then merge.
