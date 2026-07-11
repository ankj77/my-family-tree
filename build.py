#!/usr/bin/env python3
import sys

from family_tree.model import load_people, LoadError
from family_tree.validate import validate, ValidationError
from family_tree.tree import build_tree
from family_tree.render import render_html

DATA = "family-tree.yaml"
OUT = "family-tree.html"


def main() -> int:
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

    root, unlinked, summary = build_tree(people)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(render_html(root, unlinked, summary))

    print("Wrote %s" % OUT)
    print(
        "People: %d | Generations: %d | Uncertain: %d | Needs-parent: %d"
        % (summary.total, summary.generations, summary.uncertain, summary.needs_parent)
    )
    for w in warnings:
        print("  - " + w)
    return 0


if __name__ == "__main__":
    sys.exit(main())
