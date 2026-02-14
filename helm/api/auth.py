"""Authentication utilities — JWT token management."""

from __future__ import annotations

from datetime import datetime, timedelta

from helm.config import get_settings

settings = get_settings()


def _get_pwd_context():
    """Lazily create the password context to avoid import-time crashes."""
    from passlib.context import CryptContext
    return CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return _get_pwd_context().hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return _get_pwd_context().verify(plain, hashed)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    from jose import jwt

    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.jwt_expiration_minutes)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict | None:
    from jose import JWTError, jwt

    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
