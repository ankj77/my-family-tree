import hashlib
import hmac
import secrets

ITERATIONS = 200000
MIN_LENGTH = 8


def hash_password(password: str, salt_hex: str, iterations: int) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), iterations
    ).hex()


PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
PASSWORD_LENGTH = 10
MAX_ITERATIONS = 1000000


def make_hash(password: str, iterations: int = ITERATIONS) -> str:
    salt = secrets.token_hex(16)
    return "pbkdf2_sha256$%d$%s$%s" % (iterations, salt, hash_password(password, salt, iterations))


def check_hash(password: str, stored: str) -> bool:
    parts = stored.split("$")
    if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
        return False
    _, iterations_str, salt, digest = parts
    try:
        iterations = int(iterations_str)
        if iterations < 1 or iterations > MAX_ITERATIONS:
            return False
        return hmac.compare_digest(hash_password(password, salt, iterations), digest)
    except (ValueError, TypeError):
        return False


def new_password() -> str:
    return "".join(secrets.choice(PASSWORD_ALPHABET) for _ in range(PASSWORD_LENGTH))


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
