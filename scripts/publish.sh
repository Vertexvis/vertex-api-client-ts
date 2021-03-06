#!/usr/bin/env bash
# shellcheck source=./utils.sh
. "$(pwd)"/scripts/utils.sh
set -o errexit

version="v$(get_version)"
sha="$(git rev-parse HEAD)"

npm publish --access public

curl -s -X POST "https://api.github.com/repos/$REPOSITORY/releases" \
-H "Authorization: token $GITHUB_TOKEN" \
-d @- <<EOF
{
  "tag_name": "$version",
  "target_commitish": "$sha",
  "name": "$version",
  "body": "Automated release for $version\n",
  "draft": false,
  "prelease": false
}
EOF
