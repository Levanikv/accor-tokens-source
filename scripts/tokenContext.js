// @ts-check

/**
 * Extracts structured context from a token name based on naming conventions.
 * This helps categorize tokens by type: breakpoints, color modes, radius, borders, etc.
 *
 * @param {string} name - The full token name (e.g. "color-modes-dark-primary-background")
 * @returns {object} A normalized object with `context`, `token`, and additional metadata (e.g. `mode`, `min`, `max`)
 */
export function extractTokenContext(name) {
  const matchers = [
    {
      // Matches breakpoint tokens like: breakpoints-desktop-md-1280-1439-sem-padding-inline
      type: 'breakpoint',
      regex: /breakpoints-[a-z]+(?:-[a-z]+)?-(\d+)-(\d+)-(wel-sem-[a-zA-Z0-9-]+)/,
      handler: (_, min, max, token) => ({
        context: 'breakpoint',
        min: Number(min),
        max: Number(max),
        token,
      }),
    },
    {
      // Matches color mode tokens like: color-modes-dark-primary-bg
      type: 'color-mode',
      regex: /^color-modes-([^-]+)-(.+)$/i,
      handler: (_, mode, token) => ({
        context: 'color-mode',
        mode,
        token,
      }),
    },
    {
      // Matches radius mode tokens like: radius-rounded-border-sm
      type: 'radius',
      regex: /^radius-([^-]+)-(.+)$/i,
      handler: (_, mode, token) => ({
        context: 'radius-mode',
        mode,
        token,
      }),
    },
    {
      // Matches border tokens like: borders-mode-1-sem-border-default
      type: 'borders',
      regex: /^borders-([^-]+-[^-]+)-(.+)$/,
      handler: (_, mode, token) => ({
        context: 'border-mode',
        mode,
        token,
      }),
    },
  ];

  // Try to match against each pattern
  for (const matcher of matchers) {
    const result = name.match(matcher.regex);
    if (result) {
      return matcher.handler(...result); // First arg is the full match string, rest are capture groups
    }
  }

  // Default fallback if no match: treat as standard token
  return {
    context: 'default',
    token: name,
  };
}
