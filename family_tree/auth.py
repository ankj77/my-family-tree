import hashlib
import hmac
import json
import os
import secrets

ITERATIONS = 200000
MIN_LENGTH = 8
DEFAULT_CONTACT = "Ankur"


class AuthMissing(Exception):
    pass


def hash_password(password: str, salt_hex: str, iterations: int) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), iterations
    ).hex()


def load_auth(path: str) -> dict:
    if not os.path.exists(path):
        raise AuthMissing(path)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def set_admin_password(path: str, password: str) -> dict:
    if len(password) < MIN_LENGTH:
        raise ValueError("the admin password must be at least %d characters" % MIN_LENGTH)
    current = load_auth(path) if os.path.exists(path) else {}
    salt = secrets.token_hex(16)
    auth = {
        "contact": current.get("contact", DEFAULT_CONTACT),
        "admin": {
            "salt": salt,
            "iterations": ITERATIONS,
            "hash": hash_password(password, salt, ITERATIONS),
        },
        "signing_key": current.get("signing_key") or secrets.token_hex(32),
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(auth, f, indent=2)
        f.write("\n")
    return auth


PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
PASSWORD_LENGTH = 10


def make_hash(password: str, iterations: int = ITERATIONS) -> str:
    salt = secrets.token_hex(16)
    return "pbkdf2_sha256$%d$%s$%s" % (iterations, salt, hash_password(password, salt, iterations))


def check_hash(password: str, stored: str) -> bool:
    parts = stored.split("$")
    if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
        return False
    _, iterations, salt, digest = parts
    return hmac.compare_digest(hash_password(password, salt, int(iterations)), digest)


def new_password() -> str:
    return "".join(secrets.choice(PASSWORD_ALPHABET) for _ in range(PASSWORD_LENGTH))


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
