#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "package.json"), "utf8"),
);
const PACKAGE_NAME = pkg.name;
const PACKAGE_VERSION = pkg.version;
const BEGIN = `<!-- BEGIN ${PACKAGE_NAME} -->`;
const END = `<!-- END ${PACKAGE_NAME} -->`;
const MANIFEST_NAME = ".ai-toolkit-manifest.json";

const PROFILES = {
  cursor: {
    skillDir: ".cursor/skills",
    rulesFiles: ["AGENTS.md", "CLAUDE.md"],
    manifestDir: ".cursor",
  },
  "claude-code": {
    skillDir: ".claude/skills",
    rulesFiles: ["CLAUDE.md", "AGENTS.md"],
    manifestDir: ".claude",
  },
};

function warn(message) {
  console.warn(`${PACKAGE_NAME}: ${message}`);
}

function log(message) {
  console.log(`${PACKAGE_NAME}: ${message}`);
}

function isInsideNodeModules(filePath) {
  return filePath.split(path.sep).includes("node_modules");
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

function shouldRunInstall(command) {
  if (process.env.PROJECT_ROOT) return true;
  if (command === "install") return true;
  return isInsideNodeModules(__dirname);
}

function selectedProfiles() {
  const raw = process.env.AI_TOOLKIT_TOOLS;
  const names = raw
    ? raw
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
    : Object.keys(PROFILES);
  const profiles = [];

  for (const name of names) {
    const profile = PROFILES[name];
    if (!profile) {
      warn(`unknown tool "${name}", skipping`);
      continue;
    }
    profiles.push({ name, ...profile });
  }

  return profiles;
}

function copyDir(source, target, installedFiles, projectRoot) {
  fs.mkdirSync(target, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const src = path.join(source, entry.name);
    const dst = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDir(src, dst, installedFiles, projectRoot);
    } else {
      fs.copyFileSync(src, dst);
      installedFiles.push(path.relative(projectRoot, dst));
    }
  }
}

function installSkills(projectRoot, skillDir, installedFiles) {
  const source = path.join(__dirname, "skills");
  if (!fs.existsSync(source)) return;

  const targetRoot = path.join(projectRoot, skillDir);
  fs.mkdirSync(targetRoot, { recursive: true });

  for (const skill of fs.readdirSync(source, { withFileTypes: true })) {
    if (!skill.isDirectory()) continue;
    const target = path.join(targetRoot, skill.name);
    fs.rmSync(target, { recursive: true, force: true });
    copyDir(path.join(source, skill.name), target, installedFiles, projectRoot);
  }
}

function applyRulesBlock(existing, teamRules) {
  const start = existing.indexOf(BEGIN);
  const end = existing.indexOf(END);
  const hasStart = start !== -1;
  const hasEnd = end !== -1;

  if (hasStart !== hasEnd || (hasStart && hasEnd && end < start)) {
    warn("corrupted sentinel block; left file unchanged");
    return { content: existing, applied: false };
  }

  const block = `${BEGIN}\n${teamRules.trim()}\n${END}`;
  if (hasStart && hasEnd) {
    return {
      content:
        existing.slice(0, start) + block + existing.slice(end + END.length),
      applied: true,
    };
  }

  const prefix = existing.trimEnd();
  const content = prefix ? `${prefix}\n\n${block}\n` : `${block}\n`;
  return { content, applied: true };
}

function collectRulesTargets(profiles) {
  const files = new Set();
  for (const profile of profiles) {
    for (const file of profile.rulesFiles) {
      files.add(file);
    }
  }
  return [...files];
}

function installRules(projectRoot, rulesFiles, installedFiles) {
  const rulesSource = path.join(__dirname, "rules", "AGENTS.md");
  if (!fs.existsSync(rulesSource)) return;

  const teamRules = fs.readFileSync(rulesSource, "utf8");
  if (teamRules.includes(BEGIN) || teamRules.includes(END)) {
    warn("rules payload contains sentinel markers; skipped rules install");
    return;
  }

  for (const rel of rulesFiles) {
    const target = path.join(projectRoot, rel);
    const existing = fs.existsSync(target)
      ? fs.readFileSync(target, "utf8")
      : "";
    const { content, applied } = applyRulesBlock(existing, teamRules);
    if (!applied) continue;
    fs.writeFileSync(target, content);
    if (!installedFiles.includes(rel)) installedFiles.push(rel);
  }
}

function writeManifest(projectRoot, manifestDir, installedFiles) {
  const dir = path.join(projectRoot, manifestDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, MANIFEST_NAME),
    `${JSON.stringify(
      {
        package: PACKAGE_NAME,
        version: PACKAGE_VERSION,
        installedAt: new Date().toISOString(),
        files: installedFiles,
      },
      null,
      2,
    )}\n`,
  );
}

function runInstall() {
  if (!shouldRunInstall(process.argv[2])) {
    return;
  }

  const projectRoot = findProjectRoot();
  const profiles = selectedProfiles();
  if (profiles.length === 0) {
    warn("no tool profiles selected");
    return;
  }

  const rulesFiles = collectRulesTargets(profiles);
  const sharedRulesFiles = [];
  installRules(projectRoot, rulesFiles, sharedRulesFiles);

  let fileCount = 0;
  for (const profile of profiles) {
    const installedFiles = [];
    installSkills(projectRoot, profile.skillDir, installedFiles);
    for (const rel of sharedRulesFiles) {
      if (!installedFiles.includes(rel)) installedFiles.push(rel);
    }
    writeManifest(projectRoot, profile.manifestDir, installedFiles);
    fileCount += installedFiles.length;
  }

  log(`installed ${fileCount} tracked path(s) into ${projectRoot}`);
}

function main() {
  const command = process.argv[2];
  if (command === "uninstall") {
    require("./uninstall.js");
    return;
  }

  try {
    runInstall();
  } catch (error) {
    warn(`postinstall warning: ${error.message}`);
  }
}

main();
