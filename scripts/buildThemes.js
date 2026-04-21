// @ts-check

/**
 * Unified build script that generates JSON tokens and CSS themes.
 *
 * This script:
 * 1. Generates JSON token files per brand directly from source
 * 2. Generates CSS theme files from the tokens
 * 3. Writes all files to dist/ at the end
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { register } from '@tokens-studio/sd-transforms';
import { writeFile } from 'fs/promises';
import StyleDictionary from 'style-dictionary';
import { logVerbosityLevels, logWarningLevels, transforms } from 'style-dictionary/enums';

import { buildAppCompose } from './buildAppCompose.js';
import { buildAppiOS } from './buildAppiOS.js';
import { getFilesInDir } from './jsonUtils.js';
import { buildMergedThemeTokens } from './tokenBuilder.js';
import { cssTransform, lineHeightsToRem, scssTransform } from './transforms.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.resolve(rootDir, 'src');
const distDir = path.resolve(rootDir, 'dist');
const themeDir = path.join(distDir, 'themes');
const jsonDir = path.join(themeDir, 'json');
const cssDir = path.join(themeDir, 'css');
const jsDir = path.join(themeDir, 'js');
const scssDir = path.join(themeDir, 'scss');
// APP outputs can be redirected to another repo via DIST_DIR env var.
const appDistDir = process.env.DIST_DIR
  ? path.resolve(rootDir, process.env.DIST_DIR)
  : distDir;
const androidDir = path.join(appDistDir, 'android');
const iosDir = path.join(appDistDir, 'ios');
const manifestPath = path.join(themeDir, 'manifest.json');

// Register custom formats
StyleDictionary.registerFormat({
  name: 'css/custom',
  format: cssTransform,
});

StyleDictionary.registerFormat({
  name: 'scss/custom',
  format: scssTransform,
});

StyleDictionary.registerFormat({
  name: 'js/css-module',
  format: ({ dictionary }) => {
    const css = cssTransform({ dictionary });
    const escaped = css.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
    return `export const theme = \`${escaped}\`;\n`;
  },
});

StyleDictionary.registerTransform({
  name: 'lineHeightsToRem',
  type: 'value',
  transitive: true,
  filter: (token) => {
    return token.$type === 'lineHeight';
  },
  transform: lineHeightsToRem,
});

/**
 * Clean semantic data inside breakpoints by removing unnecessary properties.
 * Specifically removes `typography` and `breakpointName` from the `sem` object.
 *
 * @param {Record<string, any>} breakpoints
 * @returns {Record<string, any>}
 */
function cleanBreakpoints(breakpoints) {
  const cleaned = {};

  for (const [key, value] of Object.entries(breakpoints)) {
    if (
      typeof value === 'object' &&
      value !== null &&
      typeof value.sem === 'object' &&
      value.sem !== null
    ) {
      // Remove unwanted keys while preserving the rest
      const { typography: _t, breakpointName: _b, ...restSem } = value.sem;
      cleaned[key] = {
        ...value,
        sem: restSem,
      };
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

/**
 * Generates JSON tokens for all brands
 * @returns {Map<string, object>} Map of tokens per brand
 */
function generateTokens() {
  console.log('📦 Generating JSON tokens per brand...');

  const brands = getFilesInDir(srcDir, 'brands').map((filePath) =>
    path.basename(filePath, '.json')
  );

  const tokensMap = new Map();

  for (const brand of brands) {
    const mergedTokens = buildMergedThemeTokens(brand, srcDir);

    if (mergedTokens.breakpoints) {
      mergedTokens.breakpoints = cleanBreakpoints(mergedTokens.breakpoints);
    }

    tokensMap.set(brand.replace('WIP', ''), mergedTokens);
  }
  console.log(`✅ Generated ${tokensMap.size} token files in memory`);
  return tokensMap;
}

/**
 * Generates CSS theme files from tokens
 * @param {Map<string, object>} tokensMap - Map of tokens per brand
 */
async function generateThemes(tokensMap) {
  console.log('🎨 Generating CSS themes...');

  const themes = [];

  for (const [brandName] of tokensMap.entries()) {
    await register(StyleDictionary);

    const tokenFile = path.join(jsonDir, `${brandName}.tokens.json`);

    const sd = new StyleDictionary({
      source: [tokenFile],
      preprocessors: ['tokens-studio'],
      platforms: {
        css: {
          buildPath: cssDir,
          transformGroup: 'tokens-studio',
          transforms: [
            transforms.attributeCti,
            transforms.nameKebab,
            transforms.colorHex,
            transforms.sizePxToRem,
            transforms.sizeRem,
            'lineHeightsToRem',
          ],
          files: [
            {
              destination: `${brandName}.css`,
              format: 'css/custom',
            },
          ],
        },
        js: {
          buildPath: jsDir,
          transformGroup: 'tokens-studio',
          transforms: [
            transforms.attributeCti,
            transforms.nameKebab,
            transforms.colorHex,
            transforms.sizePxToRem,
            transforms.sizeRem,
            'lineHeightsToRem',
          ],
          files: [
            {
              destination: `${brandName}.js`,
              format: 'js/css-module',
            },
          ],
        },
      },
      log: {
        warnings: logWarningLevels.warn,
        verbosity: logVerbosityLevels.verbose,
      },
    });

    await sd.buildAllPlatforms();

    themes.push({
      id: brandName,
      name: brandName.toUpperCase(),
      css: `css/${brandName}.css`,
      js: `js/${brandName}.js`,
      json: `json/${brandName}.tokens.json`,
    });
  }

  if (tokensMap.has('all')) {
    await register(StyleDictionary);
    const allTokensFile = path.join(jsonDir, 'all.tokens.json');
    const scssSD = new StyleDictionary({
      source: [allTokensFile],
      preprocessors: ['tokens-studio'],
      platforms: {
        scss: {
          transformGroup: 'tokens-studio',
          transforms: [transforms.nameKebab],
          buildPath: scssDir,
          files: [
            {
              destination: 'index.scss',
              format: 'scss/custom',
            },
          ],
        },
      },
      log: {
        warnings: logWarningLevels.error,
        verbosity: logVerbosityLevels.verbose,
      },
    });
    await scssSD.buildAllPlatforms();
  }

  await writeFile(manifestPath, JSON.stringify(themes, null, 2));
  console.log(
    `✅ Generated ${themes.length} CSS themes + scss/index.scss + manifest in dist/theme/`
  );
}

/**
 * Main build function
 */
async function buildThemes() {
  try {
    console.log('🚀 Starting build...\n');
    if (fs.existsSync(distDir)) {
      fs.rmSync(distDir, { recursive: true });
    }
    fs.mkdirSync(themeDir, { recursive: true });
    fs.mkdirSync(jsonDir, { recursive: true });
    fs.mkdirSync(cssDir, { recursive: true });
    fs.mkdirSync(jsDir, { recursive: true });
    fs.mkdirSync(scssDir, { recursive: true });

    const tokensMap = generateTokens();
    console.log('\n💾 Writing token JSON files...');
    for (const [brandName, tokens] of tokensMap.entries()) {
      const outputFilePath = path.join(jsonDir, `${brandName}.tokens.json`);
      fs.writeFileSync(outputFilePath, JSON.stringify(tokens, null, 2));
    }
    console.log(`✅ Token JSON files written to ${jsonDir}\n`);

    await generateThemes(tokensMap);

    if (!fs.existsSync(androidDir)) {
      fs.mkdirSync(androidDir, { recursive: true });
    }
    await buildAppCompose();
    console.log(`✅ Token App files written to ${androidDir}\n`);

    if (!fs.existsSync(iosDir)) {
      fs.mkdirSync(iosDir, { recursive: true });
    }
    await buildAppiOS();
    console.log(`✅ Token App files written to ${iosDir}\n`);

    console.log('\n✨ Build completed successfully!');
  } catch (error) {
    console.error('❌ Build error:', error);
    process.exit(1);
  }
}

// Run it
await buildThemes();
