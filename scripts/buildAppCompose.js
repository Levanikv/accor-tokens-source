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
const androidDir = path.join(distDir, 'android');

const primitiveSource = path.join(srcDir, 'primitives/all.json');
const brandBookSource = path.join(srcDir, 'brands/brandBook.json');
const lightSource = path.join(srcDir, 'colorModes/light.json');
const darkSource = path.join(srcDir, 'colorModes/dark.json');

function toComposeColor(value) {
  if (!value || typeof value !== 'string') return null;
  if (value.startsWith('{') && value.endsWith('}')) return null;

  const rgbaMatch = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (rgbaMatch) {
    const [, r, g, b, a] = rgbaMatch;
    const alpha = a !== undefined ? Math.round(parseFloat(a) * 255) : 255;
    const alphaHex = alpha.toString(16).padStart(2, '0').toUpperCase();
    const red = parseInt(r).toString(16).padStart(2, '0').toUpperCase();
    const green = parseInt(g).toString(16).padStart(2, '0').toUpperCase();
    const blue = parseInt(b).toString(16).padStart(2, '0').toUpperCase();
    return `Color(0x${alphaHex}${red}${green}${blue})`;
  }

  const hexMatch = value.match(/^#([A-Fa-f0-9]{6})$/);
  if (hexMatch) return `Color(0xFF${hexMatch[1].toUpperCase()})`;

  const hexAlphaMatch = value.match(/^#([A-Fa-f0-9]{8})$/);
  if (hexAlphaMatch) {
    const hex = hexAlphaMatch[1].toUpperCase();
    return `Color(0x${hex.slice(6)}${hex.slice(0, 6)})`;
  }

  return null;
}

function toPascalCasePrimitive(str) {
  return str
    .split('-')
    .map(part => {
      if (/^\d+$/.test(part)) return part;
      let result = part.charAt(0).toUpperCase() + part.slice(1);
      result = result
        .replace(/grey/gi, 'Grey').replace(/blue/gi, 'Blue').replace(/green/gi, 'Green')
        .replace(/white/gi, 'White').replace(/black/gi, 'Black').replace(/yellow/gi, 'Yellow')
        .replace(/red/gi, 'Red').replace(/pink/gi, 'Pink').replace(/alpha/gi, 'Alpha')
        .replace(/naval/gi, 'Naval').replace(/royal/gi, 'Royal').replace(/electric/gi, 'Electric')
        .replace(/duck/gi, 'Duck').replace(/lime/gi, 'Lime').replace(/peacock/gi, 'Peacock')
        .replace(/pop/gi, 'Pop').replace(/strawberry/gi, 'Strawberry').replace(/raspberry/gi, 'Raspberry')
        .replace(/fuchsia/gi, 'Fuchsia').replace(/marine/gi, 'Marine').replace(/sky/gi, 'Sky')
        .replace(/tropos/gi, 'Tropos').replace(/stratos/gi, 'Stratos').replace(/platinum/gi, 'Platinum')
        .replace(/diamond/gi, 'Diamond').replace(/gold/gi, 'Gold').replace(/silver/gi, 'Silver')
        .replace(/limitless/gi, 'Limitless').replace(/classic/gi, 'Classic').replace(/temp/gi, 'Temp');
      return result;
    })
    .join('');
}

function toPascalCaseSemantic(str) {
  return str
    .split('-')
    .map(part => {
      if (/^\d+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('')
    .replace(/Hi$/g, 'High')
    .replace(/Hi([A-Z])/g, 'High$1');
}

function toPrimitiveKotlinName(tokenPath) {
  const fullName = tokenPath.join('-');
  let cleanName = fullName
    .replace(/^wel-prim-color-leg-/i, '')
    .replace(/^wel-prim-color-/i, '')
    .replace(/^wel-prim-/i, '')
    .replace(/^wel-/i, '')
    .replace(/^leg-/i, '');
  cleanName = cleanName.replace(/-temp$/i, 'Temp');
  return toPascalCasePrimitive(cleanName);
}

StyleDictionary.registerFormat({
  name: 'compose/primitives',
  format: ({ dictionary, options }) => {
    const packageName = options.packageName || 'com.example.tokens';
    const objectName = options.objectName || 'Colors';

    const tokens = dictionary.allTokens
      .filter(token => {
        if ((token.$type || token.type) !== 'color') return false;
        if (token.path.includes('leg')) return false;
        return true;
      })
      .map(token => {
        const value = token.value || token.$value;
        const composeColor = toComposeColor(value);
        if (!composeColor) return null;
        const name = toPrimitiveKotlinName(token.path);
        return { name, line: `    val ${name} = ${composeColor}` };
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(item => item.line)
      .join('\n');

    return `package ${packageName}

import androidx.compose.ui.graphics.Color

@Suppress("MagicNumber")
internal object ${objectName} {

${tokens}
}
`;
  }
});

const semanticColorsMap = new Map();
const primitivePathMap = new Map();
const brandbookPathMap = new Map();

StyleDictionary.registerFormat({
  name: 'compose/primitives-collect',
  format: ({ dictionary }) => {
    dictionary.allTokens
      .filter(token => (token.$type || token.type) === 'color')
      .forEach(token => {
        const name = toPrimitiveKotlinName(token.path);
        primitivePathMap.set(token.path.join('.'), `AccorColorPrimitives.${name}`);
      });
    return '';
  }
});

StyleDictionary.registerFormat({
  name: 'compose/brandbook-collect',
  format: ({ dictionary }) => {
    dictionary.allTokens
      .filter(token => (token.$type || token.type) === 'color')
      .forEach(token => {
        const pathKey = token.path.join('.');
        const originalValue = token.original?.$value || token.original?.value;
        if (originalValue && typeof originalValue === 'string') {
          const match = originalValue.match(/^\{(.+)\}$/);
          if (match && primitivePathMap.has(match[1])) {
            brandbookPathMap.set(pathKey, primitivePathMap.get(match[1]));
          }
        }
      });
    return '';
  }
});

function getPrimitiveRef(token) {
  const originalValue = token.original?.$value || token.original?.value;
  if (!originalValue || typeof originalValue !== 'string') return null;
  const match = originalValue.match(/^\{(.+)\}$/);
  if (!match) return null;
  const refPath = match[1];
  if (primitivePathMap.has(refPath)) return primitivePathMap.get(refPath);
  if (brandbookPathMap.has(refPath)) return brandbookPathMap.get(refPath);
  return null;
}

StyleDictionary.registerFormat({
  name: 'compose/semantic-collect',
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
        const composeColor = toComposeColor(value);
        if (!composeColor) return;

        const relevantPath = token.path.slice(3);
        const name = toPascalCaseSemantic(relevantPath.join('-'));
        const primitiveRef = getPrimitiveRef(token);

        if (!semanticColorsMap.has(name)) {
          semanticColorsMap.set(name, { order: semanticColorsMap.size });
        }
        semanticColorsMap.get(name)[mode] = primitiveRef || composeColor;
      });

    return '';
  }
});

function generateMergedSemanticColors(packageName, objectName) {
  const tokens = Array.from(semanticColorsMap.entries())
    .sort((a, b) => a[1].order - b[1].order)
    .map(([name, colors]) => {
      const light = colors.light || 'Color.Unspecified';
      const dark = colors.dark || colors.light || 'Color.Unspecified';
      return `    val ${name}
        @Composable
        get() = getColor(light = ${light}, dark = ${dark})`;
    })
    .join('\n');

  return `package ${packageName}

import androidx.compose.runtime.Composable
import com.accor.designsystem.compose.AccorColor.getColor

object ${objectName} {

${tokens}
}
`;
}

export async function buildAppCompose() {
  console.log('Building design tokens for Android Compose...');

  const packageName = 'com.accor.designsystem.compose';

  primitivePathMap.clear();
  brandbookPathMap.clear();
  semanticColorsMap.clear();

  fs.mkdirSync(androidDir, { recursive: true });

  const primitiveCollectSD = new StyleDictionary({
    source: [primitiveSource],
    log: { verbosity: 'silent' },
    platforms: {
      compose: {
        transformGroup: 'tokens-studio',
        buildPath: androidDir + '/',
        files: [{ destination: '_primitives_temp.kt', format: 'compose/primitives-collect' }]
      }
    }
  });
  await primitiveCollectSD.buildAllPlatforms();

  const brandbookCollectSD = new StyleDictionary({
    source: [primitiveSource, brandBookSource],
    log: { verbosity: 'silent', errors: { brokenReferences: 'warn' } },
    platforms: {
      compose: {
        transformGroup: 'tokens-studio',
        buildPath: androidDir + '/',
        files: [{
          destination: '_brandbook_temp.kt',
          format: 'compose/brandbook-collect',
          filter: (token) => token.path[0] === 'wel' && token.path[1] === 'web' && token.path[2] === 'bSem'
        }]
      }
    }
  });
  try { await brandbookCollectSD.buildAllPlatforms(); }
  catch (e) { console.log('Brandbook collection warning:', e.message.split('\n')[0]); }

  const primitiveSD = new StyleDictionary({
    source: [primitiveSource],
    log: { verbosity: 'silent' },
    platforms: {
      compose: {
        transformGroup: 'tokens-studio',
        buildPath: androidDir + '/',
        files: [{
          destination: 'AccorColorPrimitives.kt',
          format: 'compose/primitives',
          options: { packageName, objectName: 'AccorColorPrimitives' }
        }]
      }
    }
  });
  await primitiveSD.buildAllPlatforms();

  for (const mode of ['light', 'dark']) {
    const modeSource = mode === 'light' ? lightSource : darkSource;
    const sd = new StyleDictionary({
      source: [primitiveSource, brandBookSource, modeSource],
      log: { verbosity: 'silent', errors: { brokenReferences: 'warn' } },
      platforms: {
        compose: {
          transformGroup: 'tokens-studio',
          buildPath: androidDir + '/',
          files: [{
            destination: `_${mode}_temp.kt`,
            format: 'compose/semantic-collect',
            filter: (token) => token.path[0] === 'wel' && token.path[1] === 'sem' && token.path[2] === 'color',
            options: { mode }
          }]
        }
      }
    });
    try { await sd.buildAllPlatforms(); }
    catch (e) { console.log(`${mode} mode warning:`, e.message.split('\n')[0]); }
  }

  const mergedContent = generateMergedSemanticColors(packageName, 'AccorColorSemantics');
  fs.writeFileSync(path.join(androidDir, 'AccorColorSemantics.kt'), mergedContent);

  for (const f of ['_primitives_temp.kt', '_brandbook_temp.kt', '_light_temp.kt', '_dark_temp.kt']) {
    try { fs.unlinkSync(path.join(androidDir, f)); } catch {}
  }

  console.log(`✅ Compose tokens written to ${androidDir}`);
  console.log('  - AccorColorPrimitives.kt');
  console.log('  - AccorColorSemantics.kt');
}
