---
bootstrapped_at: 2026-09-12T14:15:32Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: 10xusage
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

---
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10xusage
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---

## Why this stack

A solo after-hours MVP in 3 weeks with email-password auth, account-bound flashcards, and AI cloze generation needs a batteries-included, agent-friendly web starter. 10x Astro Starter is the recommended default for a JavaScript/TypeScript web app: Astro + React + TypeScript + Supabase (auth + Postgres) on Cloudflare Pages. Auth and persistence come with the starter; AI generation is added on API routes because no registry starter ships an LLM first-class, with the edge runtime as a known constraint for long-running jobs. Scaffolding is first-class (registered CLI, not fully battle-tested). CI is GitHub Actions with auto-deploy on merge to main.

## Pre-scaffold verification

| Signal             | Value                                                | Severity | Notes                                              |
| ------------------ | ---------------------------------------------------- | -------- | -------------------------------------------------- |
| npm package        | not run                                              | n/a      | `cmd_template` starts with `git clone`; npm skipped |
| GitHub repo        | przeprogramowani/10x-astro-starter last pushed 2026-08-22T21:44:30Z | fresh    | from card.docs_url                                 |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 31438
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: moved silently
**.bootstrap-scaffold cleanup**: deleted

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 2 CRITICAL, 14 HIGH, 8 MODERATE, 3 LOW
**Direct vs transitive**: 1/0/2/0 direct of total 2/14/8/3

#### CRITICAL findings

**astro@6.3.1** (direct)
- Advisory id: GHSA-jrpj-wcv7-9fh9, GHSA-f48w-9m4c-m7f5, GHSA-7pw4-f3q4-r2p2, GHSA-4g3v-8h47-v7g6, GHSA-2pvr-wf23-7pc7, GHSA-8hv8-536x-4wqp, GHSA-26w7-cxv4-gfx2, GHSA-376h-93r7-7g6f
- Description: Astro: XSS via Unescaped Attribute Names in Spread Props; Astro: XSS via unescaped spread attribute names in renderHTMLElement (incomplete fix for CVE-2026-54298); Astro: Cross-site scripting via unescaped transition:* directive values on hydrated islands; Astro: Reflected XSS via unescaped View Transition animation properties; Astro: Host header SSRF in prerendered error page fetch; Astro: Reflected XSS via unescaped slot name; Astro: Remote code execution through AVIF image optimization; Astro: Authorization bypass from missing path-segment boundary check when stripping the configured base
- Fix version: available
- Range: `<=7.2.7`
- Effects: none
- URLs: https://github.com/advisories/GHSA-jrpj-wcv7-9fh9, https://github.com/advisories/GHSA-f48w-9m4c-m7f5, https://github.com/advisories/GHSA-7pw4-f3q4-r2p2, https://github.com/advisories/GHSA-4g3v-8h47-v7g6, https://github.com/advisories/GHSA-2pvr-wf23-7pc7, https://github.com/advisories/GHSA-8hv8-536x-4wqp, https://github.com/advisories/GHSA-26w7-cxv4-gfx2, https://github.com/advisories/GHSA-376h-93r7-7g6f

**tar@7.5.13** (transitive)
- Advisory id: GHSA-vmf3-w455-68vh, GHSA-w8wr-v893-vjvp, GHSA-23hp-3jrh-7fpw, GHSA-8x88-c5mf-7j5w, GHSA-gvwx-54wh-qm9j, GHSA-r292-9mhp-454m
- Description: node-tar applies PAX size override to intermediary GNU long-name/long-link headers, causing tar parser interpretation differential (file smuggling); node-tar: Process crash via PAX numeric path type confusion; node-tar: Decompression/parse DoS via unlimited input; node-tar: Negative tar entry size causes infinite loop in archive replace; node-tar: Uncaught Exception DoS via NUL byte in PAX path/linkpath records; node-tar: Uncontrolled recursion in mapHas/filesFilter allows uncatchable stack-overflow DoS via crafted long-path tar with member selection
- Fix version: available
- Range: `<=7.5.20`
- Effects: supabase
- URLs: https://github.com/advisories/GHSA-vmf3-w455-68vh, https://github.com/advisories/GHSA-w8wr-v893-vjvp, https://github.com/advisories/GHSA-23hp-3jrh-7fpw, https://github.com/advisories/GHSA-8x88-c5mf-7j5w, https://github.com/advisories/GHSA-gvwx-54wh-qm9j, https://github.com/advisories/GHSA-r292-9mhp-454m

#### HIGH findings

**brace-expansion@5.0.6** (transitive)
- Advisory id: GHSA-3jxr-9vmj-r5cp, GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895
- Description: brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups; brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash; brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation
- Fix version: available
- Range: `<=1.1.17 || 3.0.0 - 5.0.8`
- Effects: none
- URLs: https://github.com/advisories/GHSA-3jxr-9vmj-r5cp, https://github.com/advisories/GHSA-mh99-v99m-4gvg, https://github.com/advisories/GHSA-rgw5-rvv9-x895

**browserslist@4.28.2** (transitive)
- Advisory id: GHSA-c83g-rgw3-j3cx, GHSA-73wf-gq98-2v4g
- Description: Browserslist: Unbounded memory growth (no cache eviction) via distinct query results, leading to eventual OOM; Browserslist: Uncaught crash / prototype write via untrusted browserslist-stats.json custom stats (normalizeStats)
- Fix version: available
- Range: `<=4.28.6`
- Effects: none
- URLs: https://github.com/advisories/GHSA-c83g-rgw3-j3cx, https://github.com/advisories/GHSA-73wf-gq98-2v4g

**devalue@5.8.0** (transitive)
- Advisory id: GHSA-77vg-94rm-hx3p
- Description: Svelte devalue: DoS via sparse array deserialization
- Fix version: available
- Range: `5.6.3 - 5.8.0`
- Effects: none
- URLs: https://github.com/advisories/GHSA-77vg-94rm-hx3p

**fast-uri@3.1.2** (transitive)
- Advisory id: GHSA-v2hh-gcrm-f6hx, GHSA-7p8r-x3mc-p8w7, GHSA-f65p-4m7j-42xc, GHSA-fph4-wmhf-6fwf, GHSA-jqff-g426-hqxp, GHSA-4c8g-83qw-93j6
- Description: fast-uri vulnerable to host confusion via literal backslash authority delimiter; fast-uri vulnerable to host confusion via backslash authority introducer; fast-uri vulnerable to server-side request forgery via malformed IPv6 normalization; fast-uri vulnerable to server-side request forgery via repeated hostname percent-decoding; fast-uri vulnerable to host confusion via percent-encoded scheme normalization; fast-uri vulnerable to host confusion via failed IDN canonicalization
- Fix version: available
- Range: `3.0.0 - 3.1.5`
- Effects: none
- URLs: https://github.com/advisories/GHSA-v2hh-gcrm-f6hx, https://github.com/advisories/GHSA-7p8r-x3mc-p8w7, https://github.com/advisories/GHSA-f65p-4m7j-42xc, https://github.com/advisories/GHSA-fph4-wmhf-6fwf, https://github.com/advisories/GHSA-jqff-g426-hqxp, https://github.com/advisories/GHSA-4c8g-83qw-93j6

**js-yaml@4.1.1** (transitive)
- Advisory id: GHSA-h67p-54hq-rp68, GHSA-52cp-r559-cp3m, GHSA-5p4m-2wfm-xmqj, GHSA-2883-xcg3-v3hh
- Description: JS-YAML: Quadratic-complexity DoS in merge key handling via repeated aliases; js-yaml: YAML merge-key chains can force quadratic CPU consumption; JS-YAML: Quadratic CPU consumption in !!omap resolution (3.x and 4.x) — CVE-2026-59870 fix not backported; js-yaml: maxTotalMergeKeys does not limit CPU use for empty merge sources
- Fix version: available
- Range: `4.0.0 - 4.3.1`
- Effects: none
- URLs: https://github.com/advisories/GHSA-h67p-54hq-rp68, https://github.com/advisories/GHSA-52cp-r559-cp3m, https://github.com/advisories/GHSA-5p4m-2wfm-xmqj, https://github.com/advisories/GHSA-2883-xcg3-v3hh

**miniflare@4.20260507.1** (transitive)
- Advisory id: n/a
- Description: via sharp, undici, ws
- Fix version: available
- Range: `<=0.0.0-fff677e35 || 3.20250204.0 - 5.20260801.0-alpha`
- Effects: @cloudflare/vite-plugin, wrangler
- URLs: n/a

**nanoid@3.3.12** (transitive)
- Advisory id: GHSA-28wg-ghj8-5hjv, GHSA-2v37-7h3g-55p8
- Description: nanoid: non-secure generators can loop indefinitely with negative size; nanoid: custom generators can loop indefinitely when size is zero
- Fix version: available
- Range: `<=3.3.17`
- Effects: none
- URLs: https://github.com/advisories/GHSA-28wg-ghj8-5hjv, https://github.com/advisories/GHSA-2v37-7h3g-55p8

**postcss@8.5.14** (transitive)
- Advisory id: GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849
- Description: PostCSS: incomplete fix of GHSA-6g55-p6wh-862q — attacker-controlled sourceMappingURL reads arbitrary .map files when `from` is unset; PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure
- Fix version: available
- Range: `<=8.5.22`
- Effects: none
- URLs: https://github.com/advisories/GHSA-fxqj-rqcc-2cmp, https://github.com/advisories/GHSA-r28c-9q8g-f849

**sharp@0.34.5** (transitive)
- Advisory id: GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c
- Description: sharp inherited vulnerabilities in libvips: CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591; sharp: Vulnerabilities in libheif: GHSA-g89c-p67h-r497 and GHSA-2jg2-4ch7-h545
- Fix version: available
- Range: `<=0.35.4-rc.0`
- Effects: astro, miniflare
- URLs: https://github.com/advisories/GHSA-f88m-g3jw-g9cj, https://github.com/advisories/GHSA-rgj7-g3m4-5g8c

**smol-toml@1.6.1** (transitive)
- Advisory id: GHSA-7w5x-hrqm-74c2
- Description: smol-toml: Denial of Service via malformed TOML documents
- Fix version: available
- Range: `<=1.7.0`
- Effects: none
- URLs: https://github.com/advisories/GHSA-7w5x-hrqm-74c2

**svgo@4.0.1** (transitive)
- Advisory id: GHSA-2p49-hgcm-8545, GHSA-w27v-7q3p-w38r, GHSA-4vpr-x523-8j87
- Description: SVGO removeScripts plugin leaves some executable scripts intact; SVGO: removeScripts allows executable links through namespace and control-character bypasses; SVGO: removeScripts incompletely sanitizes executable HTML in SVG foreignObject elements
- Fix version: available
- Range: `4.0.0 - 4.0.2`
- Effects: none
- URLs: https://github.com/advisories/GHSA-2p49-hgcm-8545, https://github.com/advisories/GHSA-w27v-7q3p-w38r, https://github.com/advisories/GHSA-4vpr-x523-8j87

**undici@7.24.8** (transitive)
- Advisory id: GHSA-vmh5-mc38-953g, GHSA-p88m-4jfj-68fv, GHSA-vxpw-j846-p89q, GHSA-hm92-r4w5-c3mj, GHSA-g8m3-5g58-fq7m, GHSA-pr7r-676h-xcf6, GHSA-8xcm-r25x-g524, GHSA-4cwx-7wf7-3272, GHSA-m8rv-5g2x-5cg5, GHSA-jr45-8vmc-qm54, GHSA-v3r7-h72x-cjcm, GHSA-35p6-xmwp-9g52
- Description: undici vulnerable to TLS certificate validation bypass via dropped requestTls in SOCKS5 ProxyAgent; undici vulnerable to HTTP header injection via Set-Cookie percent-decoding; undici WebSocket client vulnerable to denial of service via fragment count bypass; undici vulnerable to cross-origin request routing via SOCKS5 proxy pool reuse; undici vulnerable to Set-Cookie SameSite attribute downgrade via permissive substring matching; undici vulnerable to cross-user information disclosure via shared cache whitespace bypass; undici vulnerable to downstream response desynchronization via retry interceptor; undici vulnerable to cross-user information disclosure and parse-time crash via degenerate private cache directives; undici vulnerable to CRLF Injection via blob-like body 'type' property; undici vulnerable to cross-user information disclosure via whitespace around equals in Cache-Control directives; undici vulnerable to cookie attribute injection via unsanitized domain and unparsed setCookie fields; undici vulnerable to HTTP response queue poisoning via keep-alive socket reuse
- Fix version: available
- Range: `7.0.0 - 7.28.0`
- Effects: miniflare
- URLs: https://github.com/advisories/GHSA-vmh5-mc38-953g, https://github.com/advisories/GHSA-p88m-4jfj-68fv, https://github.com/advisories/GHSA-vxpw-j846-p89q, https://github.com/advisories/GHSA-hm92-r4w5-c3mj, https://github.com/advisories/GHSA-g8m3-5g58-fq7m, https://github.com/advisories/GHSA-pr7r-676h-xcf6, https://github.com/advisories/GHSA-8xcm-r25x-g524, https://github.com/advisories/GHSA-4cwx-7wf7-3272, https://github.com/advisories/GHSA-m8rv-5g2x-5cg5, https://github.com/advisories/GHSA-jr45-8vmc-qm54, https://github.com/advisories/GHSA-v3r7-h72x-cjcm, https://github.com/advisories/GHSA-35p6-xmwp-9g52

**vite@7.3.3** (transitive)
- Advisory id: GHSA-v6wh-96g9-6wx3, GHSA-fx2h-pf6j-xcff
- Description: launch-editor: NTLMv2 hash disclosure via UNC path handling on Windows; vite: `server.fs.deny` bypass on Windows alternate paths
- Fix version: available
- Range: `7.0.0 - 7.3.3`
- Effects: none
- URLs: https://github.com/advisories/GHSA-v6wh-96g9-6wx3, https://github.com/advisories/GHSA-fx2h-pf6j-xcff

**ws@8.20.0** (transitive)
- Advisory id: GHSA-58qx-3vcg-4xpx, GHSA-96hv-2xvq-fx4p
- Description: ws: Uninitialized memory disclosure; ws: Memory exhaustion DoS from tiny fragments and data chunks
- Fix version: available
- Range: `8.0.0 - 8.20.1`
- Effects: @cloudflare/vite-plugin, miniflare
- URLs: https://github.com/advisories/GHSA-58qx-3vcg-4xpx, https://github.com/advisories/GHSA-96hv-2xvq-fx4p

#### MODERATE findings

**@astrojs/language-server@2.16.8** (transitive)
- Advisory id: n/a
- Description: via volar-service-yaml
- Fix version: available
- Range: `2.14.0 - 2.16.10`
- Effects: none
- URLs: n/a

**@cloudflare/vite-plugin@1.36.3** (transitive)
- Advisory id: n/a
- Description: via miniflare, wrangler, ws
- Fix version: available
- Range: `<=0.0.0-fff677e35 || 0.0.7 - 1.41.0`
- Effects: none
- URLs: n/a

**baseline-browser-mapping@2.10.27** (transitive)
- Advisory id: GHSA-w5vr-8v7q-w6rv
- Description: baseline-browser-mapping process termination on invalid input causes denial of service
- Fix version: available
- Range: `>=2.0.0 <2.11.0`
- Effects: none
- URLs: https://github.com/advisories/GHSA-w5vr-8v7q-w6rv

**supabase@2.98.2** (direct)
- Advisory id: n/a
- Description: via tar
- Fix version: available
- Range: `1.1.6 - 2.98.2`
- Effects: none
- URLs: n/a

**volar-service-yaml@0.0.70** (transitive)
- Advisory id: n/a
- Description: via yaml-language-server
- Fix version: available
- Range: `<=0.0.70`
- Effects: @astrojs/language-server
- URLs: n/a

**wrangler@4.90.0** (direct)
- Advisory id: n/a
- Description: via esbuild, miniflare
- Fix version: available
- Range: `<=0.0.0-kickoff-demo || 3.108.0 - 4.101.0`
- Effects: @cloudflare/vite-plugin
- URLs: n/a

**yaml@2.7.1** (transitive)
- Advisory id: GHSA-48c2-rrv3-qjmp
- Description: yaml is vulnerable to Stack Overflow via deeply nested YAML collections
- Fix version: available
- Range: `2.0.0 - 2.8.2`
- Effects: yaml-language-server
- URLs: https://github.com/advisories/GHSA-48c2-rrv3-qjmp

**yaml-language-server@1.20.0** (transitive)
- Advisory id: n/a
- Description: via yaml
- Fix version: available
- Range: `1.11.1-08d5f7b.0 - 1.21.1-f1f5a94.0 || 1.22.1-0ae5603.0 - 1.22.1-fc5f874.0`
- Effects: volar-service-yaml
- URLs: n/a

#### LOW / INFO findings

**@babel/core@7.29.0** (transitive)
- Advisory id: GHSA-4x5r-pxfx-6jf8
- Description: @babel/core: Arbitrary File Read via sourceMappingURL Comment
- Fix version: available
- Range: `<=7.29.0`
- Effects: none
- URLs: https://github.com/advisories/GHSA-4x5r-pxfx-6jf8

**esbuild@0.27.7** (transitive)
- Advisory id: GHSA-g7r4-m6w7-qqqr
- Description: esbuild allows arbitrary file read when running the development server on Windows
- Fix version: available
- Range: `0.27.3 - 0.28.0`
- Effects: astro, wrangler
- URLs: https://github.com/advisories/GHSA-g7r4-m6w7-qqqr

**postcss-selector-parser@7.1.1** (transitive)
- Advisory id: GHSA-w9m9-85wc-3x92
- Description: postcss-selector-parser allows denial of service through uncontrolled AST recursion
- Fix version: available
- Range: `7.1.0 - 7.1.2`
- Effects: none
- URLs: https://github.com/advisories/GHSA-w9m9-85wc-3x92


## Hints recorded but not acted on

| Hint                       | Value                              |
| -------------------------- | ---------------------------------- |
| bootstrapper_confidence    | first-class                        |
| quality_override           | false                              |
| path_taken                 | standard                           |
| self_check_answers         | null                               |
| team_size                  | solo                               |
| deployment_target          | cloudflare-pages                   |
| ci_provider                | github-actions                     |
| ci_default_flow            | auto-deploy-on-merge               |
| has_auth                   | true                               |
| has_payments               | false                              |
| has_realtime               | false                              |
| has_ai                     | true                               |
| has_background_jobs        | false                              |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
