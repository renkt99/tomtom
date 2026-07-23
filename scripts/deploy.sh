#!/usr/bin/env bash
# Build locally and publish dist/ to the gh-pages branch (GitHub Pages,
# branch source). No GitHub Actions involved — this repo must not use them.
set -euo pipefail
cd "$(dirname "$0")/.."

npm test
npm run build
touch dist/.nojekyll

sha=$(git rev-parse --short HEAD)
cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.name="tomtom-deploy" -c user.email="deploy@local" \
  commit -q -m "Deploy $sha"
git push -f https://github.com/renkt99/tomtom.git gh-pages:gh-pages
rm -rf .git
echo "Deployed $sha → https://renkt99.github.io/tomtom/"
