const fs = require('node:fs');
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

/**
 * OneDrive Files On-Demand marks hydrated files as Windows reparse points.
 * Node reports every reparse point as a symbolic link, but readlink then throws
 * EINVAL for ordinary OneDrive files. Metro scans symlinks eagerly, so teach its
 * Dirent checks to keep treating those specific entries as regular files.
 */
function installOneDriveDirentWorkaround() {
  if (process.platform !== 'win32') return;

  const prototype = fs.Dirent?.prototype;
  const originalIsSymbolicLink = prototype?.isSymbolicLink;

  if (!prototype || !originalIsSymbolicLink || originalIsSymbolicLink.__oneDriveSafe) {
    return;
  }

  function isSymbolicLink() {
    if (!originalIsSymbolicLink.call(this)) return false;

    const parentPath = this.parentPath ?? this.path;
    if (!parentPath) return true;

    try {
      fs.readlinkSync(path.join(parentPath, this.name));
      return true;
    } catch (error) {
      return error?.code !== 'EINVAL';
    }
  }

  isSymbolicLink.__oneDriveSafe = true;
  prototype.isSymbolicLink = isSymbolicLink;
}

installOneDriveDirentWorkaround();

module.exports = getDefaultConfig(__dirname);
