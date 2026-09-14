#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "package.json"), "utf8"),
);
const PACKAGE_NAME = pkg.name;
const BEGIN = `<!-- BEGIN ${PACKAGE_NAME} -->`;
const END = `<!-- END ${PACKAGE_NAME} -->`;
const MANIFEST_NAME = ".ai-toolkit-manifest.json";
const MANIFEST_DIRS = [".cursor", ".claude"];
const RULES_FILES = new Set(["AGENTS.md", "CLAUDE.md"]);

function log(message) {
  console.log(`${PACKAGE_NAME}: ${message}`);
}

function findProjectRoot() {
  if (process.env.PROJECT_ROOT) {
    return path.resolve(process.env.PROJECT_ROOT);
  }

  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (path.basename(dir) === "node_modules") {
      return path.dirname(dir);
    }
    dir = path.dirname(dir);
  }

  return process.cwd();
}

function removeRulesBlock(content) {
  const start = content.indexOf(BEGIN);
  const end = content.indexOf(END);
  if (start === -1 || end === -1 || end < start) return content;
  return (content.slice(0, start) + content.slice(end + END.length)).replace(
    /\n{3,}/g,
    "\n\n",
  );
}

function stripRulesFiles(projectRoot) {
  for (const rel of RULES_FILES) {
    const rulesPath = path.join(projectRoot, rel);
    if (!fs.existsSync(rulesPath)) continue;
    fs.writeFileSync(
      rulesPath,
      removeRulesBlock(fs.readFileSync(rulesPath, "utf8")),
    );
  }
}

function removeEmptyParents(filePath, projectRoot) {
  let dir = path.dirname(filePath);
  while (dir.startsWith(projectRoot) && dir !== projectRoot) {
    if (!fs.existsSync(dir)) {
      dir = path.dirname(dir);
      continue;
    }
    if (fs.readdirSync(dir).length > 0) break;
    fs.rmdirSync(dir);
    dir = path.dirname(dir);
  }
}

function uninstallFromManifest(projectRoot, manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const relPath of manifest.files || []) {
    if (RULES_FILES.has(relPath)) continue;
    const abs = path.join(projectRoot, relPath);
    fs.rmSync(abs, { recursive: true, force: true });
    removeEmptyParents(abs, projectRoot);
  }
  fs.rmSync(manifestPath, { force: true });
}

function main() {
  const projectRoot = findProjectRoot();
  const manifests = MANIFEST_DIRS.map((dir) =>
    path.join(projectRoot, dir, MANIFEST_NAME),
  ).filter((manifestPath) => fs.existsSync(manifestPath));

  if (manifests.length === 0) {
    log("no manifest found, nothing to uninstall");
    return;
  }

  for (const manifestPath of manifests) {
    uninstallFromManifest(projectRoot, manifestPath);
  }

  stripRulesFiles(projectRoot);
  log("uninstalled managed files");
}

main();
