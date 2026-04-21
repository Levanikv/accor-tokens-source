import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import StyleDictionary from 'style-dictionary';
import { register } from '@tokens-studio/sd-transforms';

register(StyleDictionary, { excludeParentKeys: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.resolve(rootDir, 'src');
const distDir = process.env.DIST_DIR
  ? path.resolve(rootDir, process.env.DIST_DIR)
  : path.resolve(rootDir, 'dist');
const iosDir = path.join(distDir, 'iOS');

const primitiveSource = path.join(srcDir, 'primitives/all.json');
const brandBookSource = path.join(srcDir, 'brands/brandBook.json');
const lightSource = path.join(srcDir, 'colorModes/light.json');
const darkSource = path.join(srcDir, 'colorModes/dark.json');

function toIOSComponents(value) {
  if (!value || typeof value !== 'string') return null;
  if (value.startsWith('{') && value.endsWith('}')) return null;

  const rgbaMatch = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (rgbaMatch) {
    const [, r, g, b, a] = rgbaMatch;
    const alpha = a !== undefined ? parseFloat(a) : 1;
    return {
      alpha: alpha.toFixed(3),
      red: `0x${parseInt(r).toString(16).padStart(2, '0').toUpperCase()}`,
      green: `0x${parseInt(g).toString(16).padStart(2, '0').toUpperCase()}`,
      blue: `0x${parseInt(b).toString(16).padStart(2, '0').toUpperCase()}`
    };
  }

  const hexMatch = value.match(/^#([A-Fa-f0-9]{6})$/);
  if (hexMatch) {
    const hex = hexMatch[1].toUpperCase();
    return {
      alpha: '1.000',
      red: `0x${hex.slice(0, 2)}`,
      green: `0x${hex.slice(2, 4)}`,
      blue: `0x${hex.slice(4, 6)}`
    };
  }

  const hexAlphaMatch = value.match(/^#([A-Fa-f0-9]{8})$/);
  if (hexAlphaMatch) {
    const hex = hexAlphaMatch[1].toUpperCase();
    const alphaInt = parseInt(hex.slice(6, 8), 16);
    return {
      alpha: (alphaInt / 255).toFixed(3),
      red: `0x${hex.slice(0, 2)}`,
      green: `0x${hex.slice(2, 4)}`,
      blue: `0x${hex.slice(4, 6)}`
    };
  }

  return null;
}

function toCamelCaseIOS(parts) {
  return parts
    .join('-')
    .split('-')
    .map((part, i) => {
      if (i === 0) return part.charAt(0).toLowerCase() + part.slice(1);
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('');
}

const iosColorsMap = new Map();

StyleDictionary.registerFormat({
  name: 'ios/semantic-collect',
  format: ({ dictionary, options }) => {
    const mode = options.mode;

    dictionary.allTokens
      .filter(token => {
        if ((token.$type || token.type) !== 'color') return false;
        const pathStr = token.path.join('.').toLowerCase();
        if (pathStr.includes('hover') || pathStr.includes('pressed')) return false;
        if (token.path[0] !== 'wel' || token.path[1] !== 'sem' || token.path[2] !== 'color') return false;
        return true;
      })
      .forEach(token => {
        const value = token.value || token.$value;
        const components = toIOSComponents(value);
        if (!components) return;

        const name = toCamelCaseIOS(token.path.slice(3));
        if (!iosColorsMap.has(name)) {
          iosColorsMap.set(name, { order: iosColorsMap.size });
        }
        iosColorsMap.get(name)[mode] = components;
      });

    return '';
  }
});

// Swift variable name overrides (avoid collisions with SwiftUI built-ins).
const SWIFT_NAME_OVERRIDES = {
  primary: 'accorPrimary',
};

// Section config: MARK label + match function. Order matters — earlier sections
// claim tokens first, so generic "Outline" sits after the per-family sections.
const SWIFT_SECTIONS = [
  { mark: 'Accent', match: n => n === 'accent' || n === 'onAccent' || n === 'onAccentContainer' || n === 'outlineAccent' || n.startsWith('accentContainer') },
  { mark: 'All', match: n => n === 'allPrimary' || /^all(Hi|HiVariant|Low|Min)$/.test(n) },
  { mark: 'Danger', match: n => n === 'danger' || n === 'onDanger' || n === 'outlineDanger' || n.startsWith('dangerContainer') || n.startsWith('onDangerContainer') },
  { mark: 'Eco', match: n => n === 'eco' || n === 'onEco' || n === 'outlineEco' || n.startsWith('ecoContainer') || n.startsWith('onEcoContainer') },
  { mark: 'Family', match: n => n === 'family' || n === 'onFamily' || n === 'outlineFamily' || n.startsWith('familyContainer') || n.startsWith('onFamilyContainer') },
  { mark: 'Gradient', match: n => n.startsWith('gradient') },
  { mark: 'Link', match: n => n === 'link' || n === 'onLink' },
  { mark: 'Loyalty', match: n => n === 'loyalty' || n === 'onLoyalty' || n === 'outlineLoyalty' || n.startsWith('loyaltyContainer') || n.startsWith('onLoyaltyContainer') },
  { mark: 'Loyalty Status', match: n => /^(classic|silver|gold|platinum|diamond|limitless)(GradientStart|GradientEnd)?$/.test(n) },
  { mark: 'Offer', match: n => n === 'offer' || n === 'onOffer' || n === 'outlineOffer' || n.startsWith('offerContainer') || n.startsWith('onOfferContainer') },
  { mark: 'Outline', match: n => ['outlineHi', 'outlineMid', 'outlineLow', 'outlinePrimaryHi', 'outlinePrimaryLow', 'outlineSecondary', 'strokeVoucher'].includes(n) },
  { mark: 'Overlay', match: n => n.startsWith('overlay') },
  { mark: 'Primary', match: n => n === 'primary' || n === 'onPrimary' || n === 'onPrimaryContainer' || n.startsWith('primaryContainer') },
  { mark: 'Secondary', match: n => n === 'secondaryContainer' || n === 'onSecondaryContainer' },
  { mark: 'Shadow', match: n => n.startsWith('shadow') },
  { mark: 'State', match: n => n === 'focus' },
  { mark: 'Success', match: n => n === 'success' || n === 'onSuccess' || n === 'outlineSuccess' || n.startsWith('successContainer') || n.startsWith('onSuccessContainer') },
  { mark: 'Surface', match: n => n === 'surface' || n.startsWith('surfaceContainer') || n.startsWith('onSurface') },
  { mark: 'Warning', match: n => n === 'warning' || n === 'onWarning' || n === 'onWarningContainer' || n === 'outlineWarning' || n.startsWith('warningContainer') },
];

function writeColorsSwift(outputDir) {
  const styleguidesDir = path.join(outputDir, 'Styleguides');
  fs.mkdirSync(styleguidesDir, { recursive: true });

  // Keep source-order of tokens (colorModes JSON order) within each section
  const orderedNames = Array.from(iosColorsMap.entries())
    .filter(([, data]) => data.light)
    .sort((a, b) => a[1].order - b[1].order)
    .map(([name]) => name);

  const assigned = new Set();
  const sections = [];
  for (const { mark, match } of SWIFT_SECTIONS) {
    const tokens = orderedNames.filter(n => !assigned.has(n) && match(n));
    if (!tokens.length) continue;
    tokens.forEach(t => assigned.add(t));
    sections.push({ mark, tokens });
  }
  const other = orderedNames.filter(n => !assigned.has(n));
  if (other.length) sections.push({ mark: 'Other', tokens: other });

  const lines = [
    '//',
    '//  Colors.swift',
    '//  AccorAllDesignSystem',
    '//',
    '//  Generated automatically from design tokens — do not edit by hand.',
    '//',
    '',
    'import SwiftUI',
    '',
    'public extension Color {',
  ];

  sections.forEach((section, i) => {
    lines.push(`    // MARK: - ${section.mark}`);
    lines.push('');
    for (const token of section.tokens) {
      const varName = SWIFT_NAME_OVERRIDES[token] || token;
      lines.push(`    static let ${varName} = Color("${token}", bundle: .designSystem)`);
    }
    if (i < sections.length - 1) lines.push('');
  });

  lines.push(
    '}',
    '',
    'public extension Color {',
    '    static func dynamic(light: UIColor, dark: UIColor) -> Color {',
    '        Color(UIColor { trait in',
    '            trait.userInterfaceStyle == .dark ? dark : light',
    '        })',
    '    }',
    '}',
    ''
  );

  fs.writeFileSync(path.join(styleguidesDir, 'Colors.swift'), lines.join('\n'));
}

function writeXcassets(outputDir) {
  const xcassetsDir = path.join(outputDir, 'Colors.xcassets');

  fs.rmSync(xcassetsDir, { recursive: true, force: true });
  fs.mkdirSync(xcassetsDir, { recursive: true });

  fs.writeFileSync(
    path.join(xcassetsDir, 'Contents.json'),
    JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2) + '\n'
  );

  const entries = Array.from(iosColorsMap.entries()).sort((a, b) => a[1].order - b[1].order);

  for (const [name, data] of entries) {
    if (!data.light) continue;
    const dark = data.dark || data.light;

    const contents = {
      colors: [
        { color: { 'color-space': 'srgb', components: data.light }, idiom: 'universal' },
        {
          color: { 'color-space': 'srgb', components: dark },
          idiom: 'universal',
          appearances: [{ appearance: 'luminosity', value: 'dark' }]
        }
      ],
      info: { author: 'xcode', version: 1 }
    };

    const colorsetDir = path.join(xcassetsDir, `${name}.colorset`);
    fs.mkdirSync(colorsetDir, { recursive: true });
    fs.writeFileSync(
      path.join(colorsetDir, 'Contents.json'),
      JSON.stringify(contents, null, 2) + '\n'
    );
  }

  return entries.length;
}

export async function buildAppiOS() {
  console.log('Building design tokens for iOS (Colors.xcassets)...');

  iosColorsMap.clear();
  fs.mkdirSync(iosDir, { recursive: true });

  for (const mode of ['light', 'dark']) {
    const modeSource = mode === 'light' ? lightSource : darkSource;
    const sd = new StyleDictionary({
      source: [primitiveSource, brandBookSource, modeSource],
      log: { verbosity: 'silent', errors: { brokenReferences: 'warn' } },
      platforms: {
        ios: {
          transformGroup: 'tokens-studio',
          buildPath: iosDir + '/',
          files: [{
            destination: `_${mode}_temp.txt`,
            format: 'ios/semantic-collect',
            filter: (token) => token.path[0] === 'wel' && token.path[1] === 'sem' && token.path[2] === 'color',
            options: { mode }
          }]
        }
      }
    });
    try { await sd.buildAllPlatforms(); }
    catch (e) { console.log(`${mode} mode warning:`, e.message.split('\n')[0]); }
  }

  const count = writeXcassets(iosDir);
  writeColorsSwift(iosDir);

  for (const f of ['_light_temp.txt', '_dark_temp.txt']) {
    try { fs.unlinkSync(path.join(iosDir, f)); } catch {}
  }

  console.log(`✅ iOS assets written to ${iosDir}/Colors.xcassets/ (${count} colorsets)`);
  console.log(`✅ Swift styleguide written to ${iosDir}/Styleguides/Colors.swift`);
}
