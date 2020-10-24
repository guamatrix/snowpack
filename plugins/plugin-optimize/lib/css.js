const fs = require('fs');
const path = require('path');
const {parse} = require('es-module-lexer');
const {minify: minifyCss} = require('csso');

/** Early-exit function that determines, given a set of JS files, if CSS is being imported */
function hasCSSImport(files) {
  for (const file of files) {
    const code = fs.readFileSync(file, 'utf-8');
    const [imports] = parse(code);
    for (const {s, e} of imports.filter(({d}) => d === -1)) {
      const spec = code.substring(s, e);
      if (spec.endsWith('.css.proxy.js')) return true; // exit as soon as we find one
    }
  }
  return false;
}
exports.hasCSSImport = hasCSSImport;

/**
 * Scans JS for CSS imports, and embeds only what’s needed
 *
 * import 'global.css'                       -> (removed; loaded in HTML)
 * import url from 'global.css'              -> const url = 'global.css'
 * import {foo, bar} from 'local.module.css' -> const {foo, bar} = 'local.module.css'
 */
function embedStaticCSS(file, code) {
  const imports = [];
  const filePath = path.dirname(file);
  let newCode = code;

  const [importSpecifiers] = parse(code);
  importSpecifiers
    .filter(({d}) => d === -1) // this is where we discard dynamic imports (> -1) and import.meta (-2)
    .filter(({s, e}) => code.substring(s, e).endsWith('.css.proxy.js'))
    .forEach(({ss, se, s, e}) => {
      const originalImport = code.substring(s, e);
      const importedFile = originalImport.replace(/\.proxy\.js$/, '');
      imports.push({
        actual: path.resolve(filePath, importedFile),
        proxy: path.resolve(filePath, originalImport),
      });

      const importNamed = code
        .substring(ss, se)
        .replace(code.substring(s - 1, e + 1), '') // remove import
        .replace(/^import\s+/, '') // remove keyword
        .replace(/\s*from.*$/, '') // remove other keyword
        .replace(/\*\s+as\s+/, '') // sanitize star imports
        .trim();

      // transform JS

      // option 1: no transforms needed
      if (!importNamed) {
        newCode = newCode.replace(new RegExp(`${code.substring(ss, se)};?\n?`), '');
        return;
      }

      if (importedFile.endsWith('.module.css')) {
        // option 2: transform css modules
        const proxyCode = fs.readFileSync(path.resolve(filePath, originalImport), 'utf-8');
        const matches = proxyCode.match(/^let json\s*=\s*(\{[^\}]+\})/m);
        if (!matches) return;
        newCode = newCode.replace(
          new RegExp(`${code.substring(ss, se).replace(/\*/g, '\\*')};?`),
          `const ${importNamed.replace(/\*\s+as\s+/, '')} = ${matches[1]};`,
        );
      } else {
        // option 3: transfrom normal css
        newCode = newCode.replace(
          new RegExp(`${code.substring(ss, se)};?`),
          `const ${importNamed} = '${importedFile}';`,
        );
      }
    });
  return {imports, code: newCode};
}
exports.embedStaticCSS = embedStaticCSS;

/** Build CSS File */
function concatAndMinifyCSS(manifest) {
  let code = '';
  const importedFiles = new Set();
  Object.values(manifest).forEach(({css}) => {
    if (!css) return;
    css.forEach(({actual}) => {
      if (importedFiles.has(actual)) return; // don’t load CSS twice!
      code += '\n' + fs.readFileSync(actual, 'utf-8');
      importedFiles.add(actual);
    });
  });
  if (code) return minifyCss(code).css;
}
exports.concatAndMinifyCSS = concatAndMinifyCSS;

/** Remove .css.proxy.js files (that were imported) */
function removeCSSFiles(manifest) {
  Object.values(manifest).forEach(({css}) => {
    if (!css) return;
    css.forEach(({actual, proxy}) => {
      if (fs.existsSync(actual)) fs.unlinkSync(actual);
      if (fs.existsSync(proxy)) fs.unlinkSync(proxy);
    });
  });
}
exports.removeCSSFiles = removeCSSFiles;
