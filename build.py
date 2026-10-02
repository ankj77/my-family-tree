#!/usr/bin/env python3
import getpass
import sys

from family_tree.auth import AuthMissing, load_auth, set_admin_password
from family_tree.model import load_people, resolve_photos, inherit_origins, LoadError
from family_tree.validate import validate, ValidationError
from family_tree.tree import build_tree
from family_tree.render import render_html

DATA = "family-tree.yaml"
OUT = "family-tree.html"
PHOTOS = "photos"
AUTH = "auth.json"


def set_password() -> int:
    first = getpass.getpass("New admin password: ")
    second = getpass.getpass("Type it again: ")
    if first != second:
        print("ERROR: the two passwords do not match", file=sys.stderr)
        return 1
    try:
        set_admin_password(AUTH, first)
    except ValueError as e:
        print("ERROR: %s" % e, file=sys.stderr)
        return 1
    print("Saved %s. Now run python3 build.py to rebuild the page." % AUTH)
    return 0


def main() -> int:
    if sys.argv[1:] == ["--set-admin-password"]:
        return set_password()
    try:
        auth = load_auth(AUTH)
    except AuthMissing:
        print(
            "ERROR: %s is missing. Set the admin password first:\n"
            "  python3 build.py --set-admin-password" % AUTH,
            file=sys.stderr,
        )
        return 1
    try:
        people = load_people(DATA)
    except (LoadError, FileNotFoundError) as e:
        print("ERROR loading %s: %s" % (DATA, e), file=sys.stderr)
        return 1
    try:
        warnings = validate(people)
    except ValidationError as e:
        print("VALIDATION ERROR: %s" % e, file=sys.stderr)
        return 1
    warnings = warnings + resolve_photos(people, PHOTOS)
    inherit_origins(people)

    root, unlinked, summary = build_tree(people)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(render_html(root, unlinked, summary, auth))

    print("Wrote %s" % OUT)
    print(
        "People: %d (male %d, female %d) | Generations: %d | Uncertain: %d | Needs-parent: %d"
        % (summary.total, summary.male, summary.female, summary.generations,
           summary.uncertain, summary.needs_parent)
    )
    for w in warnings:
        print("  - " + w)
    return 0


if __name__ == "__main__":
    sys.exit(main())
