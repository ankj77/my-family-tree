import re
import unicodedata

MAX_LENGTH = 56


def _words(text):
    plain = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    return re.findall(r"[a-z0-9]+", plain.lower())


def _unique(base, taken, joiner):
    base = base[:MAX_LENGTH]
    candidate, number = base, 2
    while candidate in taken:
        candidate = "%s%s%d" % (base, joiner, number)
        number += 1
    return candidate


def slug(text, taken, fallback="person"):
    return _unique("_".join(_words(text)) or fallback, taken, "_")


def username(text, taken):
    return _unique(".".join(_words(text)) or "user", taken, "")
