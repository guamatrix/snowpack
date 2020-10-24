/**
 * Copy/paste from Snowpack utils, at least until there’s some common import
 */
const path = require('path');

/** determine if remote package or not */
function isRemoteModule(specifier) {
  return (
    specifier.startsWith('//') ||
    specifier.startsWith('http://') ||
    specifier.startsWith('https://')
  );
}
exports.isRemoteModule = isRemoteModule;

/** URL relative */
function relativeURL(path1, path2) {
  let url = path.relative(path1, path2).replace(/\\/g, '/');
  if (!url.startsWith('./') && !url.startsWith('../')) {
    url = './' + url;
  }
  return url;
}
exports.relativeURL = this.relativeURL;

/** Remove \ and / from beginning of string */
exports.removeLeadingSlash = function removeLeadingSlash(path) {
  return path.replace(/^[/\\]+/, '');
};

/** Build Manifest */
function buildManifest({buildDirectory, manifest, generated}) {
  const manifestURL = (filepath) => relativeURL(buildDirectory, filepath).replace(/^\./, '');

  const importManifest = Object.entries(manifest).map(([file, imports]) => {
    if (imports.css) {
      imports.css = imports.css.map(({actual, proxy}) => ({
        actual: manifestURL(actual),
        proxy: manifestURL(proxy),
      }));
    }
    return [manifestURL(file), imports];
  });
  importManifest.sort((a, b) => a[0].localeCompare(b[0]));
  return {
    imports: Object.fromEntries(importManifest),
    generated: generated.map(manifestURL),
  };
}
exports.buildManifest = buildManifest;
