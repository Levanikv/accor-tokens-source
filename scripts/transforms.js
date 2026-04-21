import { extractTokenContext } from './tokenContext.js';

/** Return a string with one CSS custom property per line. */
const toCssVars = (items) => items.map(({ name, value }) => `--${name}: ${value};`).join('\n');

/** Group any token list by its `mode` property (color / radius). */
export function groupByMode(list) {
  return list.reduce((acc, item) => {
    const { mode, ...rest } = item;
    if (!acc[mode]) {
      acc[mode] = [];
    }
    acc[mode].push(rest);
    return acc;
  }, {});
}

function getFilteredTokens(dictionary) {
  return dictionary.allTokens.filter(({ name }) => {
    return !(
      name.includes('wel-sem-text-breakpoint-name') ||
      name.includes('wel-web-b-sem-') ||
      name.includes('wel-web-b-comp-') ||
      name.includes('brand-name') ||
      name.includes('mode-name')
    );
  });
}

/** Collect the different token buckets we need in a single pass. */
export function collectTokens(dictionary) {
  const buckets = {
    root: [],
    colorMode: [],
    radiusMode: [],
    media: [],
  };

  const filteredTokens = getFilteredTokens(dictionary);

  filteredTokens.forEach(({ name, $value: value }) => {
    // Exclude useless tokens and brand tokens
    if (
      name.includes('wel-sem-text-breakpoint-name') ||
      name.includes('wel-web-b-sem-') ||
      name.includes('wel-web-b-comp-') ||
      name.includes('brand-name') ||
      name.includes('mode-name')
    ) {
      return;
    }

    const { context, token: tokenName, ...rest } = extractTokenContext(name);

    switch (context) {
      case 'radius-mode':
        if (rest.mode === 'rounded') {
          buckets.root.push({ name: tokenName, value });
        }
        buckets.radiusMode.push({ name: tokenName, value, mode: rest.mode });
        break;

      case 'border-mode':
        buckets.root.push({ name: tokenName, value });
        break;

      case 'color-mode':
        if (rest.mode === 'light') {
          buckets.root.push({ name: tokenName, value });
        }
        buckets.colorMode.push({ name: tokenName, value, mode: rest.mode });
        break;

      case 'breakpoint': {
        if (tokenName.includes('text-breakpoint-name')) {
          return;
        }
        const { min, max } = rest;
        if (min === 1280 && !buckets.root.some((t) => t.name === tokenName)) {
          buckets.root.push({ name: tokenName, value });
        }
        buckets.media.push({ name: tokenName, value, media: { min, max } });
        break;
      }

      default:
        buckets.root.push({ name, value });
    }
  });

  return buckets;
}

/** Convert media tokens into an object keyed by the final query string. */
export function groupMediaQueries(mediaTokens) {
  return mediaTokens.reduce((acc, { name, value, media: { min, max } }) => {
    const allMin = mediaTokens.map((t) => Number(t.media.min)).filter(Boolean);
    const allMax = mediaTokens.map((t) => Number(t.media.max)).filter(Boolean);

    const isFirstMin = Number(min) === Math.min(...allMin);
    const isLastMax = Number(max) === Math.max(...allMax);

    let query = '';
    if (isFirstMin) {
      query = `@media (max-width: ${max}px)`;
    } else if (isLastMax) {
      query = `@media (min-width: ${min}px)`;
    } else {
      query = `@media (min-width: ${min}px) and (max-width: ${max}px)`;
    }

    if (!acc[query]) {
      acc[query] = [];
    }

    acc[query].push({ name, value });
    return acc;
  }, {});
}
/* -------------------------------------------------------------------------- */
/*  CSS-generation helpers                                                    */
/* -------------------------------------------------------------------------- */

const buildColorModeCss = (groups) =>
  Object.entries(groups)
    .map(([mode, tokens]) => {
      const css = toCssVars(tokens);
      return mode === 'dark'
        ? [
            /** to add when aem page is ready for dark
            `@media (prefers-color-scheme: dark) {`,
            `  :root {\n${css}\n  }`,
            `}`,
            **/
            `[data-color-mode="dark"] {\n${css}\n}`,
          ].join('\n')
        : `[data-color-mode="${mode}"] {\n${css}\n}`;
    })
    .join('\n');

const buildRadiusModeCss = (groups) =>
  Object.entries(groups)
    .map(([mode, tokens]) => `[data-radius-mode="${mode}"] {\n${toCssVars(tokens)}\n}`)
    .join('\n');

const buildMediaCss = (groups) =>
  Object.entries(groups)
    .map(([query, tokens]) => `${query} {\n  :root {\n${toCssVars(tokens)}\n  }\n}`)
    .join('\n');

/* -------------------------------------------------------------------------- */
/*  cssTransform                                         */
/* -------------------------------------------------------------------------- */

export const cssTransform = ({ dictionary }) => {
  // Bucket all tokens in one traversal
  const { root, colorMode, radiusMode, media } = collectTokens(dictionary);

  // Build independent CSS blocks
  const rootCss = `:root {\n${toCssVars(root)}\n}`;
  const colorModeCss = buildColorModeCss(groupByMode(colorMode));
  const radiusModeCss = buildRadiusModeCss(groupByMode(radiusMode));
  const mediaCss = buildMediaCss(groupMediaQueries(media));

  // Concatenate and return
  return [rootCss, mediaCss, colorModeCss, radiusModeCss].join('\n');
};

/* -------------------------------------------------------------------------- */
/*  scssTransform                                                             */
/* -------------------------------------------------------------------------- */

export const scssTransform = ({ dictionary }) => {
  const vars = new Set();

  const filteredTokens = getFilteredTokens(dictionary);

  filteredTokens.forEach(({ name }) => {
    // Exclude useless tokens and brand tokens
    if (
      name.includes('wel-sem-text-breakpoint-name') ||
      name.includes('wel-web-b-sem-') ||
      name.includes('wel-web-b-comp-') ||
      name.includes('brand-name') ||
      name.includes('mode-name')
    ) {
      return;
    }

    const { token: tokenName } = extractTokenContext(name);
    if (tokenName.startsWith('wel-sem') || tokenName.startsWith('wel-comp')) {
      vars.add(`$${tokenName}: var(--${tokenName});`);
    }
  });

  return [...vars].join('\n');
};

export const lineHeightsToRem = (token) => {
  const value = token.$value;
  const v = value?.toString().trim();
  if (!v || v.endsWith('rem') || v.endsWith('px')) {
    return value;
  }
  const num = parseFloat(v);
  if (!Number.isNaN(num)) {
    return `${num / 16}rem`;
  }
  return token.$value;
};
