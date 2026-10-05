#!/bin/sh
set -e
cd "$(dirname "$0")/.."
export DATABASE_URL="${DATABASE_URL:-mysql://root@localhost/family_tree_dev}"
export ALLOWED_ORIGIN=http://localhost:8000
export COOKIE_SECURE=0
.venv/bin/python build.py
.venv/bin/python -m http.server 8000 &
PAGES=$!
trap 'kill $PAGES' EXIT
.venv/bin/flask --app backend.app run --port 5001
