#!/usr/bin/env python3
import http.cookiejar
import json
import sys
import urllib.request

ORIGIN = "https://jainparivar.online"


def main(base, username, password) -> int:
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    def call(method, path, body=None):
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(base + path, data=data, method=method,
                                     headers={"Origin": ORIGIN, "Content-Type": "application/json"})
        with opener.open(req) as r:
            return json.loads(r.read() or b"{}")

    me = call("POST", "/login", {"username": username, "password": password})
    print("logged in as", me["username"], "admin" if me["is_admin"] else "")
    villages = call("GET", "/villages")
    family = villages[0]["families"][0]["id"]
    tree = call("GET", "/families/%s/tree" % family)
    print("tree", family, "people", tree["summary"]["total"])
    note = call("GET", "/people")
    mine = next(p for p in note if p["id"] == me["id"])
    call("PATCH", "/people/%s" % me["id"], {"note": "smoke test"})
    call("PATCH", "/people/%s" % me["id"], {"note": None})
    print("edit and undo ok for", mine["name"])
    call("POST", "/logout", {})
    print("smoke ok")
    return 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:4]))
