/**
 * Small filesystem helpers shared by the build scripts.
 */

const fs = require('fs');
const path = require('path');

/** Create a directory (and parents) if it does not exist yet. */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/** Create the parent directory of a file path. */
function ensureParentDir(filePath) {
  ensureDir(path.dirname(filePath));
}

/** Copy a file, creating the destination directory first. */
function copyFile(from, to) {
  ensureParentDir(to);
  fs.copyFileSync(from, to);
}

/** Return the first existing path, or undefined. */
function firstExisting(candidates) {
  return candidates.find((candidate) => fs.existsSync(candidate));
}

module.exports = { ensureDir, ensureParentDir, copyFile, firstExisting };
