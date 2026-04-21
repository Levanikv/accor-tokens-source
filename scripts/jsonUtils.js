// @ts-check

import fs from 'node:fs';
import path from 'node:path';

/**
 * Get absolute paths to .json files in a directory.
 * Optionally filter by a specific list of file names.
 *
 * @param {string} root - Root folder (typically tokens root)
 * @param {string} dirName - Subdirectory name (e.g., 'brands')
 * @param {{ includedFileNames?: string[]; excludedFileNames?: string[] }} [options] - Optional list of file names to include
 * @returns {string[]} - List of absolute file paths
 */
const getFilesInDir = (
  root,
  dirName,
  { includedFileNames = undefined, excludedFileNames = undefined } = {}
) => {
  if (includedFileNames && excludedFileNames) {
    // eslint-disable-next-line no-console
    console.warn(
      'Both includedFileNames and excludedFileNames provided - excludedFileNames will be applied after includedFileNames'
    );
  }

  const dirPath = path.resolve(root, dirName);

  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const allFiles = fs.readdirSync(dirPath).filter((f) => f.endsWith('.json'));

  const filteredFiles = includedFileNames
    ? allFiles.filter((file) => includedFileNames.includes(file))
    : allFiles;

  const finalFiles = excludedFileNames
    ? filteredFiles.filter((file) => !excludedFileNames.includes(file))
    : filteredFiles;

  return finalFiles.map((file) => path.resolve(dirPath, file));
};

/**
 * Read and parse a single JSON file.
 *
 * @param {string} filePath
 * @returns {any}
 */
const readJsonFile = (filePath) => {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(fileContent);
};

/**
 * Merge multiple JSON files (flat) into a single object.
 *
 * @param {string[]} filePaths
 * @returns {object}
 */
const mergeFilesContent = (filePaths) => {
  return filePaths.reduce((acc, filePath) => {
    return {
      ...acc,
      ...readJsonFile(filePath),
    };
  }, {});
};

/**
 * Get JSON content for each file in a folder using the file name (without .json) as the key.
 *
 * @param {string} tokensRoot
 * @param {string} dirName
 * @returns {object}
 */
const getNamedJsonContentByFileName = (tokensRoot, dirName) => {
  const dirPath = path.resolve(tokensRoot, dirName);
  if (!fs.existsSync(dirPath)) {
    return {};
  }

  return fs
    .readdirSync(dirPath)
    .filter((file) => file.endsWith('.json'))
    .reduce((acc, file) => {
      const key = path.basename(file, '.json'); // e.g., "desktop-md (1280-1439)"
      const filePath = path.join(dirPath, file);
      acc[key] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return acc;
    }, {});
};

/**
 * Deep merge two objects.
 *
 * @param {object} target
 * @param {object} source
 * @returns {object}
 */
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (
      typeof target[key] === 'object' &&
      typeof source[key] === 'object' &&
      !Array.isArray(target[key]) &&
      !Array.isArray(source[key])
    ) {
      target[key] = deepMerge({ ...target[key] }, source[key]);
    } else {
      target[key] = source[key]; // override
    }
  }
  return target;
}

/**
 * Merge multiple JSON files into one object.
 * - If `useFilenameAsKey` is true, each file is stored as a top-level key.
 * - Otherwise, keys are merged deeply.
 *
 * @param {string[]} filePaths
 * @param {{ useFilenameAsKey?: boolean }} options
 * @returns {object}
 */
const mergeJsonFiles = (filePaths, options = {}) => {
  const { useFilenameAsKey = false } = options;

  return filePaths.reduce((acc, filePath) => {
    try {
      if (!fs.existsSync(filePath) || !filePath.endsWith('.json')) {
        return acc;
      }

      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      if (useFilenameAsKey) {
        const key = path.basename(filePath, '.json');
        acc[key] = content;
      } else {
        for (const [key, value] of Object.entries(content)) {
          if (acc[key]) {
            acc[key] = deepMerge(acc[key], value);
          } else {
            acc[key] = value;
          }
        }
      }
    } catch (err) {
      /* eslint-disable */
      console.error(`Error in ${filePath}: ${err.message}`);
    }

    return acc;
  }, {});
};

export {
  deepMerge,
  getFilesInDir,
  getNamedJsonContentByFileName,
  mergeFilesContent,
  mergeJsonFiles,
  readJsonFile,
};
