#!/usr/bin/env bash
# Publishes dist/ to https://jbrowse.org/demos/bandagejs/. Needs aws
# credentials that can write the jbrowse.org bucket and invalidate its
# CloudFront distribution.
set -euo pipefail

DEST=s3://jbrowse.org/demos/bandagejs
DISTRIBUTION=E13LGELJOT4GQO

# the sync deletes what dist lacks, so a half-built dist takes the site down
for f in index.html style.css config.json app.js examples/index.json; do
  if [ ! -s "dist/$f" ]; then
    echo "dist/$f is missing; not deploying a partial build" >&2
    exit 1
  fi
done

aws s3 sync dist "$DEST" --delete --cache-control 'no-cache, must-revalidate'
AWS_PAGER="" aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION" --paths '/demos/bandagejs/*'
