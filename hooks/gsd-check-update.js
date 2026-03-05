#!/usr/bin/env node
// Check for GSD updates in background, write result to cache
// Called by SessionStart hook - runs once per session
//
// Supports two modes:
// 1. Fork mode: GSD installed from a git repo (custom fork)
//    - Shows green notification in fork repo when upstream has updates
//    - Shows orange notification in other projects when fork has new commits
// 2. NPM mode: GSD installed from npm package
//    - Shows orange notification when newer npm version available

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const homeDir = os.homedir();
const cwd = process.cwd();
const cacheDir = path.join(homeDir, '.claude', 'cache');
const cacheFile = path.join(cacheDir, 'gsd-update-check.json');

// GSD installation locations (check project first, then global)
const projectGsdDir = path.join(cwd, '.claude', 'get-shit-done');
const globalGsdDir = path.join(homeDir, '.claude', 'get-shit-done');

// Ensure cache directory exists
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

// Run check in background (spawn background process, windowsHide prevents console flash)
const child = spawn(process.execPath, ['-e', `
  const fs = require('fs');
  const path = require('path');
  const { execSync } = require('child_process');

  const cacheFile = ${JSON.stringify(cacheFile)};
  const cwd = ${JSON.stringify(cwd)};
  const projectGsdDir = ${JSON.stringify(projectGsdDir)};
  const globalGsdDir = ${JSON.stringify(globalGsdDir)};
  const homeDir = ${JSON.stringify(homeDir)};

  // Find GSD config directory (project or global)
  let configDir = null;
  if (fs.existsSync(path.join(cwd, '.claude'))) {
    configDir = path.join(cwd, '.claude');
  } else if (fs.existsSync(path.join(homeDir, '.claude'))) {
    configDir = path.join(homeDir, '.claude');
  }

  // Method 1: Check for gsd-install.json (explicit git installation)
  const installConfigPath = configDir ? path.join(configDir, 'gsd-install.json') : null;
  if (installConfigPath && fs.existsSync(installConfigPath)) {
    try {
      const installConfig = JSON.parse(fs.readFileSync(installConfigPath, 'utf8'));
      if (installConfig.method === 'git' && installConfig.remote) {
        // Git-based installation - check for updates via git
        const gsdDir = path.join(configDir, 'get-shit-done');
        let localHead = null;
        let remoteHead = null;
        let updateAvailable = false;

        if (fs.existsSync(path.join(gsdDir, '.git'))) {
          try {
            // Get local HEAD
            localHead = execSync('git rev-parse HEAD', {
              cwd: gsdDir,
              encoding: 'utf8',
              timeout: 5000,
              windowsHide: true
            }).trim();

            // Fetch from remote (silent)
            execSync('git fetch origin --quiet', {
              cwd: gsdDir,
              timeout: 15000,
              windowsHide: true,
              stdio: 'pipe'
            });

            // Get remote HEAD
            const branch = installConfig.branch || 'main';
            remoteHead = execSync('git rev-parse origin/' + branch, {
              cwd: gsdDir,
              encoding: 'utf8',
              timeout: 5000,
              windowsHide: true
            }).trim();

            updateAvailable = localHead !== remoteHead;
          } catch (e) {}
        }

        const result = {
          mode: 'git',
          method: 'git',
          remote: installConfig.remote,
          branch: installConfig.branch || 'main',
          local_head: localHead,
          remote_head: remoteHead,
          update_available: updateAvailable,
          gsd_path: gsdDir,
          checked: Math.floor(Date.now() / 1000)
        };
        fs.writeFileSync(cacheFile, JSON.stringify(result));
        process.exit(0);
      }
    } catch (e) {}
  }

  // Method 2: Check if we're currently IN a fork repo (has .planning/config.json with upstream)
  let isFork = false;
  let forkPath = null;
  let forkHeadSha = null;
  let forkUpstreamBehind = 0;

  const cwdConfigPath = path.join(cwd, '.planning', 'config.json');
  if (fs.existsSync(cwdConfigPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(cwdConfigPath, 'utf8'));
      if (config.upstream?.url) {
        // This is a fork repo
        forkPath = cwd;
        isFork = true;
        forkUpstreamBehind = config.upstream.commits_behind || 0;
      }
    } catch (e) {}
  }

  // Method 3: Check GSD installation directory for git repo (symlinked fork)
  if (!isFork) {
    let gsdDir = null;
    if (fs.existsSync(projectGsdDir)) {
      gsdDir = projectGsdDir;
    } else if (fs.existsSync(globalGsdDir)) {
      gsdDir = globalGsdDir;
    }

    // Resolve symlinks to find actual GSD location
    let resolvedGsdDir = gsdDir;
    if (gsdDir) {
      try {
        resolvedGsdDir = fs.realpathSync(gsdDir);
      } catch (e) {
        resolvedGsdDir = gsdDir;
      }
    }

    if (resolvedGsdDir) {
      // Walk up to find git root (fork repo root)
      let checkDir = resolvedGsdDir;
      for (let i = 0; i < 5; i++) {
        const gitDir = path.join(checkDir, '.git');
        if (fs.existsSync(gitDir)) {
          // Verify it's a fork by checking for .planning/config.json with upstream
          const configPath = path.join(checkDir, '.planning', 'config.json');
          if (fs.existsSync(configPath)) {
            try {
              const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
              if (config.upstream?.url) {
                forkPath = checkDir;
                isFork = true;
                forkUpstreamBehind = config.upstream.commits_behind || 0;
              }
            } catch (e) {}
          }
          break;
        }
        const parent = path.dirname(checkDir);
        if (parent === checkDir) break;
        checkDir = parent;
      }
    }
  }

  if (isFork && forkPath) {
    // Get fork's current HEAD SHA
    try {
      forkHeadSha = execSync('git rev-parse HEAD', {
        cwd: forkPath,
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true
      }).trim();
    } catch (e) {}

    // Check upstream commits behind from .planning/config.json
    const configPath = path.join(forkPath, '.planning', 'config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        forkUpstreamBehind = config.upstream?.commits_behind || 0;
      } catch (e) {}
    }

    // Write fork-mode cache
    const result = {
      mode: 'fork',
      fork_path: forkPath,
      fork_head_sha: forkHeadSha,
      fork_upstream_behind: forkUpstreamBehind,
      checked: Math.floor(Date.now() / 1000)
    };
    fs.writeFileSync(cacheFile, JSON.stringify(result));

  } else {
    // NPM mode - check npm registry for updates
    const projectVersionFile = path.join(projectGsdDir, 'VERSION');
    const globalVersionFile = path.join(globalGsdDir, 'VERSION');

    let installed = '0.0.0';
    try {
      if (fs.existsSync(projectVersionFile)) {
        installed = fs.readFileSync(projectVersionFile, 'utf8').trim();
      } else if (fs.existsSync(globalVersionFile)) {
        installed = fs.readFileSync(globalVersionFile, 'utf8').trim();
      }
    } catch (e) {}

    let latest = null;
    try {
      latest = execSync('npm view get-shit-done-cc version', {
        encoding: 'utf8',
        timeout: 10000,
        windowsHide: true
      }).trim();
    } catch (e) {}

    const result = {
      mode: 'npm',
      update_available: latest && installed !== latest,
      installed,
      latest: latest || 'unknown',
      checked: Math.floor(Date.now() / 1000)
    };
    fs.writeFileSync(cacheFile, JSON.stringify(result));
  }
`], {
  stdio: 'ignore',
  windowsHide: true,
  detached: true  // Required on Windows for proper process detachment
});

child.unref();
