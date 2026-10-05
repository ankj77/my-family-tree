#!/usr/bin/env python3
import os
import sys

from family_tree.render import WEB_DIR, render_admin, render_index

PAGES = (("index.html", render_index), ("family-tree.html", render_index), ("admin.html", render_admin))


def main() -> int:
    for path, render in PAGES:
        if render is render_admin and not os.path.exists(os.path.join(WEB_DIR, "admin.html")):
            continue
        with open(path, "w", encoding="utf-8") as f:
            f.write(render())
        print("Wrote %s" % path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
