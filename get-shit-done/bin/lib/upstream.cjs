/**
 * GSD Upstream Module
 *
 * Upstream remote management and sync operations for fork maintenance.
 * Part of the GSD Upstream Sync feature (v1.1).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_REMOTE_NAME = 'upstream';
const DEFAULT_BRANCH = 'main';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const CONFIG_PATH = '.planning/config.json';

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Execute a git command and return structured result.
 * @param {string} cwd - Working directory
 * @param {string[]} args - Git command arguments
 * @returns {{ success: boolean, stdout?: string, stderr?: string }}
 */
function execGit(cwd, args) {
  try {
    const stdout = execSync(`git ${args.join(' ')}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return { success: true, stdout };
  } catch (err) {
    return {
      success: false,
      stderr: err.stderr ? err.stderr.toString().trim() : err.message,
    };
  }
}

/**
 * Load upstream configuration from .planning/config.json.
 * @param {string} cwd - Working directory
 * @returns {{ url?: string, last_fetch?: string, commits_behind?: number, last_upstream_sha?: string }}
 */
function loadUpstreamConfig(cwd) {
  const configPath = path.join(cwd, CONFIG_PATH);
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);
    return config.upstream || {};
  } catch {
    return {};
  }
}

/**
 * Save upstream configuration to .planning/config.json.
 * Merges with existing config, preserving other sections.
 * @param {string} cwd - Working directory
 * @param {object} upstreamConfig - Upstream config to save
 */
function saveUpstreamConfig(cwd, upstreamConfig) {
  const configPath = path.join(cwd, CONFIG_PATH);
  let config = {};

  // Load existing config
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    // Start fresh if no config exists
  }

  // Merge upstream config
  config.upstream = upstreamConfig;

  // Ensure directory exists
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Get list of git remotes with their URLs.
 * @param {string} cwd - Working directory
 * @returns {{ name: string, url: string }[]}
 */
function getRemotes(cwd) {
  const result = execGit(cwd, ['remote', '-v']);
  if (!result.success || !result.stdout) {
    return [];
  }

  const remotes = new Map();
  const lines = result.stdout.split('\n');

  for (const line of lines) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\(fetch\)$/);
    if (match) {
      remotes.set(match[1], match[2]);
    }
  }

  return Array.from(remotes.entries()).map(([name, url]) => ({ name, url }));
}

// ─── Configure Command ────────────────────────────────────────────────────────

/**
 * Configure upstream remote.
 * Auto-detects from existing remotes if no URL provided.
 *
 * @param {string} cwd - Working directory
 * @param {string|null} url - Upstream URL (optional, auto-detect if not provided)
 * @param {object} options - { remote_name?: string }
 * @param {function} output - Output callback
 * @param {function} error - Error callback
 * @param {boolean} raw - Output as JSON
 */
function cmdUpstreamConfigure(cwd, url, options, output, error, raw) {
  const remoteName = options?.remote_name || DEFAULT_REMOTE_NAME;
  const remotes = getRemotes(cwd);

  // If no URL provided, try to auto-detect
  if (!url) {
    // Check if 'upstream' remote already exists
    const existingUpstream = remotes.find(r => r.name === 'upstream');
    if (existingUpstream) {
      url = existingUpstream.url;
    } else if (remotes.length === 1 && remotes[0].name !== 'origin') {
      // Single non-origin remote, suggest it
      url = remotes[0].url;
    } else if (remotes.length > 1) {
      // Multiple remotes - list them for user selection
      const remoteList = remotes
        .filter(r => r.name !== 'origin')
        .map((r, i) => `  ${i + 1}. ${r.name}: ${r.url}`)
        .join('\n');

      if (remoteList) {
        output({
          configured: false,
          reason: 'multiple_remotes',
          message: 'Multiple remotes found. Please specify URL or select:\n' + remoteList,
          remotes: remotes.filter(r => r.name !== 'origin'),
        }, raw, 'multiple_remotes');
        return;
      }
    }
  }

  // Still no URL - error
  if (!url) {
    error('No upstream URL provided and could not auto-detect. Usage: upstream configure <url>');
    return;
  }

  // Validate URL by testing git ls-remote
  const validateResult = execGit(cwd, ['ls-remote', '--exit-code', url, 'HEAD']);
  if (!validateResult.success) {
    output({
      configured: false,
      reason: 'invalid_url',
      url,
      error: `Could not access remote: ${validateResult.stderr}`,
    }, raw, 'invalid_url');
    return;
  }

  // Check if remote already exists
  const existingRemote = remotes.find(r => r.name === remoteName);

  if (existingRemote) {
    // Update existing remote
    const updateResult = execGit(cwd, ['remote', 'set-url', remoteName, url]);
    if (!updateResult.success) {
      error(`Failed to update remote: ${updateResult.stderr}`);
      return;
    }
  } else {
    // Add new remote
    const addResult = execGit(cwd, ['remote', 'add', remoteName, url]);
    if (!addResult.success) {
      error(`Failed to add remote: ${addResult.stderr}`);
      return;
    }
  }

  // Mirror to git config
  execGit(cwd, ['config', 'gsd.upstream.url', url]);

  // Save to config.json
  const upstreamConfig = loadUpstreamConfig(cwd);
  upstreamConfig.url = url;
  saveUpstreamConfig(cwd, upstreamConfig);

  output({
    configured: true,
    url,
    remote_name: remoteName,
    validated: true,
    action: existingRemote ? 'updated' : 'added',
  }, raw, 'configured');
}

// ─── Fetch Command ────────────────────────────────────────────────────────────

/**
 * Fetch upstream changes and update cache.
 *
 * @param {string} cwd - Working directory
 * @param {object} options - { prune?: boolean }
 * @param {function} output - Output callback
 * @param {function} error - Error callback
 * @param {boolean} raw - Output as JSON
 */
function cmdUpstreamFetch(cwd, options, output, error, raw) {
  const upstreamConfig = loadUpstreamConfig(cwd);

  // Check if upstream is configured
  if (!upstreamConfig.url) {
    error('Upstream not configured. Run: gsd-tools upstream configure <url>');
    return;
  }

  const remoteName = DEFAULT_REMOTE_NAME;
  const branch = options?.branch || DEFAULT_BRANCH;
  const pruneFlag = options?.prune ? '--prune' : '';

  // Run git fetch
  const fetchArgs = ['fetch', remoteName];
  if (pruneFlag) fetchArgs.push(pruneFlag);
  fetchArgs.push('--quiet');

  const fetchResult = execGit(cwd, fetchArgs);

  if (!fetchResult.success) {
    // Network error - return cached state with warning
    output({
      fetched: false,
      reason: 'network_error',
      error: fetchResult.stderr,
      cached_commits_behind: upstreamConfig.commits_behind || null,
      cached_last_fetch: upstreamConfig.last_fetch || null,
    }, raw, 'network_error');
    return;
  }

  // Count commits behind
  const countResult = execGit(cwd, ['rev-list', '--count', `HEAD..${remoteName}/${branch}`]);
  const commitsBehind = countResult.success ? parseInt(countResult.stdout, 10) : 0;

  // Get latest upstream commit SHA
  const shaResult = execGit(cwd, ['rev-parse', `${remoteName}/${branch}`]);
  const lastSha = shaResult.success ? shaResult.stdout : null;

  // Get latest upstream commit date
  const dateResult = execGit(cwd, ['log', '-1', '--format=%as', `${remoteName}/${branch}`]);
  const latestDate = dateResult.success ? dateResult.stdout : null;

  // Format date for display (e.g., "Feb 24")
  let formattedDate = null;
  if (latestDate) {
    try {
      const d = new Date(latestDate);
      formattedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      formattedDate = latestDate;
    }
  }

  // Update cache in config.json
  upstreamConfig.last_fetch = new Date().toISOString();
  upstreamConfig.commits_behind = commitsBehind;
  upstreamConfig.last_upstream_sha = lastSha;
  saveUpstreamConfig(cwd, upstreamConfig);

  output({
    fetched: true,
    commits_behind: commitsBehind,
    latest_date: formattedDate,
    last_sha: lastSha,
    message: commitsBehind > 0
      ? `Fetched ${commitsBehind} new commits. Run /gsd:sync-status for details.`
      : 'Fork is up to date with upstream.',
  }, raw, 'fetched');
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Constants
  DEFAULT_REMOTE_NAME,
  DEFAULT_BRANCH,
  CACHE_DURATION_MS,
  CONFIG_PATH,

  // Helper functions
  execGit,
  loadUpstreamConfig,
  saveUpstreamConfig,
  getRemotes,

  // Commands
  cmdUpstreamConfigure,
  cmdUpstreamFetch,
};
