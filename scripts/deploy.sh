#!/usr/bin/env bash
# Publishes dist/ to https://jbrowse.org/demos/bandagejs/. Needs aws
# credentials that can write the jbrowse.org bucket and invalidate its
# CloudFront distribution.
set -euo pipefail

DEST=s3://jbrowse.org/demos/bandagejs
DISTRIBUTION=E13LGELJOT4GQO

aws s3 sync dist "$DEST" --delete --cache-control 'no-cache, must-revalidate'
AWS_PAGER="" aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION" --paths '/demos/bandagejs/*'
