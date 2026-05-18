#!/usr/bin/env bash

set -euxo pipefail

rm -rf dist/.next dist/standalone

pnpm exec next build
cp -R public .next/standalone/
cp -R .next/static .next/standalone/.next/

cp -R .next/standalone ./dist/
