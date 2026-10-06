"""Experiment-content localization; UI controls always remain in English."""
from __future__ import annotations

import json
import re
from contextvars import ContextVar
from functools import lru_cache
from pathlib import Path
from typing import Literal

Language = Literal["en", "ko"]
_language: ContextVar[Language] = ContextVar("experiment_language", default="en")


def set_language(language: Language) -> None:
    if language not in ("en", "ko"):
        raise ValueError("language must be en or ko")
    _language.set(language)


def current_language() -> Language:
    return _language.get()


@lru_cache(maxsize=1)
def korean_catalog() -> dict[str, str]:
    return json.loads(
        (Path(__file__).parent / "locales" / "ko.json").read_text(encoding="utf-8")
    )


def tr(english: str) -> str:
    return (
        korean_catalog().get(english, english)
        if current_language() == "ko"
        else english
    )


def localized_model(model):
    """Clone static role/scenario fixtures without mutating shared definitions."""

    def translate(value):
        if isinstance(value, str):
            return tr(value)
        if isinstance(value, list):
            return [translate(item) for item in value]
        if isinstance(value, dict):
            return {key: translate(item) for key, item in value.items()}
        return value

    return type(model).model_validate(translate(model.model_dump(mode="python")))


def contains_bilingual(text: str, english: str) -> bool:
    alternatives = [english]
    if english == "30 minutes":
        alternatives += ["30-minute", "30 minute"]
    return (
        any(
            re.search(r"\b" + re.escape(term) + r"\b", text, re.IGNORECASE)
            for term in alternatives
        )
        or korean_catalog().get(english, english) in text
    )
