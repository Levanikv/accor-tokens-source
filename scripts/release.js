// @ts-check

/**
 * Release script.
 *
 * 1. Clones the dist repo into a temp dir
 * 2. Runs buildThemes.js with DIST_DIR pointed at the clone
 *    → web output stays in this repo's dist/themes (gitignored)
 *    → android + ios outputs land in the clone
 * 3. Creates a branch, commits the app outputs, pushes, opens a PR
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const DIST_REPO = process.env.DIST_REPO || 'Levanikv/accor-tokens-dist';
const BASE_BRANCH = process.env.BASE_BRANCH || 'main';

const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });
const runQuiet = (cmd, opts = {}) =>
  execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], ...opts }).toString().trim();

const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
const branchName = `build/${ts}`;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'accor-dist-'));

try {
  console.log(`📥 Cloning ${DIST_REPO} → ${tmpDir}`);
  run(`git clone --depth 1 --branch ${BASE_BRANCH} https://github.com/${DIST_REPO}.git "${tmpDir}"`);

  console.log(`🌿 Creating branch ${branchName}`);
  run(`git checkout -b ${branchName}`, { cwd: tmpDir });
  // Ensure folder case changes (e.g. ios → iOS) are visible on macOS
  run(`git config core.ignorecase false`, { cwd: tmpDir });

  // Wipe existing app outputs via git rm so deletions are tracked in the index.
  // fs.rmSync alone doesn't work on macOS (case-insensitive FS) for folder case
  // changes like ios → iOS — git would never see the lowercase folder as removed.
  for (const sub of ['android', 'ios', 'iOS']) {
    try {
      execSync(`git rm -rf --quiet --ignore-unmatch -- "${sub}"`, { cwd: tmpDir, stdio: 'ignore' });
    } catch { /* folder wasn't tracked */ }
    fs.rmSync(path.join(tmpDir, sub), { recursive: true, force: true });
  }

  console.log(`🏗️  Running build (DIST_DIR=${tmpDir})`);
  run(`node scripts/buildThemes.js`, {
    cwd: rootDir,
    env: { ...process.env, DIST_DIR: tmpDir },
  });

  run(`git add -A android ios iOS`, { cwd: tmpDir });
  const status = runQuiet(`git status --porcelain`, { cwd: tmpDir });
  if (!status) {
    console.log('✨ No changes — nothing to PR.');
    process.exit(0);
  }

  const commitMsg = `build: tokens ${ts}`;
  run(`git -c user.name="tokens-bot" -c user.email="tokens@bot.local" commit -m "${commitMsg}"`, { cwd: tmpDir });
  run(`git push -u origin ${branchName}`, { cwd: tmpDir });

  console.log('🔀 Opening PR');
  run(
    `gh pr create --repo ${DIST_REPO} --base ${BASE_BRANCH} --head ${branchName} --title "${commitMsg}" --body "Automated tokens build from accor-tokens-source."`,
    { cwd: tmpDir }
  );

  console.log(`\n✅ Release complete. Branch: ${branchName}`);
} finally {
  // Cleanup tmp clone
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
