// @ts-check

import path from 'node:path';

import { getFilesInDir, mergeJsonFiles } from './jsonUtils.js';

/**
 * Build and merge theme tokens for a given brand
 *
 * @param {string} brandName - The brand identifier (e.g., 'all', 'fairmont', etc.)
 * @param {string} tokensRoot - Root directory containing source tokens
 * @returns {object} - Merged tokens object
 */
export function buildMergedThemeTokens(brandName, tokensRoot) {

  // Load brand-specific and shared primitive tokens
  const primitives = getFilesInDir(tokensRoot, 'primitives', {
    includedFileNames: ['all.json', 'numbers.json', `${brandName}.json`, `${brandName}WIP.json`],
  });

  // Load brand token (semantic definitions)
  const brand = getFilesInDir(tokensRoot, 'brands', { includedFileNames: [`${brandName}.json`] });

  // Load auxiliary tokens (breakpoints, borders, color modes, radius)
  const breakpoints = getFilesInDir(tokensRoot, 'breakpoints', {
    excludedFileNames: ['crossBreakpoints.json'],
  });
  const crossBreakpoints = getFilesInDir(tokensRoot, 'breakpoints', {
    includedFileNames: ['crossBreakpoints.json'],
  });
  const borders = getFilesInDir(tokensRoot, 'borders');
  const colorModes = getFilesInDir(tokensRoot, 'colorModes');
  const radius = getFilesInDir(tokensRoot, 'radius');

  // Return merged token structure
  return {
    ...mergeJsonFiles([...primitives, ...crossBreakpoints, ...brand]),
    breakpoints: mergeJsonFiles(breakpoints, { useFilenameAsKey: true }),
    borders: mergeJsonFiles(borders, { useFilenameAsKey: true }),
    colorModes: mergeJsonFiles(colorModes, { useFilenameAsKey: true }),
    radius: mergeJsonFiles(radius, { useFilenameAsKey: true }),
  };
}
