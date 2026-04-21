# accor-tokens-source

Source repo for the Accor design tokens pipeline.

Contains raw tokens (`src/`) and the build scripts (`scripts/`). Running
`npm run release` builds Android + iOS artifacts and opens a PR against
the dist repo ([accor-tokens-dist](https://github.com/Levanikv/accor-tokens-dist)).

## Usage

```bash
npm install
npm run build       # local build (writes to dist/)
npm run release     # clone dist repo, build into it, push branch, open PR
```
