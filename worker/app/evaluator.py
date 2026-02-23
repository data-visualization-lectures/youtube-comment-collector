from __future__ import annotations

import json
from typing import Any

import requests

from .config import LLM_API_BASE_URL, LLM_API_KEY


def heuristic_evaluate(text: str) -> dict[str, Any]:
    lower = text.lower()
    positive_hits = sum(1 for w in ["great", "love", "最高", "ありがとう", "嬉しい", "nice"] if w in lower)
    negative_hits = sum(1 for w in ["bad", "hate", "最悪", "嫌い", "つまらない", "worst"] if w in lower)
    spam_hits = sum(1 for w in ["http://", "https://", "subscribe", "無料", "稼げる"] if w in lower)
    toxicity_hits = sum(1 for w in ["stupid", "idiot", "kill", "死ね", "バカ"] if w in lower)

    sentiment = "neutral"
    if positive_hits > negative_hits:
        sentiment = "positive"
    elif negative_hits > positive_hits:
        sentiment = "negative"

    return {
        "label": {
            "sentiment": sentiment,
            "is_spam": spam_hits > 0,
            "is_toxic": toxicity_hits > 0,
        },
        "score": {
            "sentiment_score": max(-1.0, min(1.0, (positive_hits - negative_hits) / 3.0)),
            "spam_score": min(1.0, spam_hits / 2.0),
            "toxicity_score": min(1.0, toxicity_hits / 2.0),
        },
        "rationale": "heuristic keyword rules",
    }


def openai_compatible_evaluate(
    text: str,
    model_name: str,
    prompt_version: str,
    api_base_url: str,
    api_key: str,
) -> dict[str, Any]:
    if not api_key:
        raise RuntimeError("LLM_API_KEY is required for openai_compatible provider")

    system = (
        "You are a strict text classifier. "
        "Return JSON only with keys: label, score, rationale. "
        "label must contain sentiment(positive|neutral|negative), is_spam(boolean), is_toxic(boolean). "
        "score must contain sentiment_score(-1..1), spam_score(0..1), toxicity_score(0..1)."
    )
    user = f"prompt_version={prompt_version}\ncomment={text}"

    response = requests.post(
        f"{api_base_url.rstrip('/')}/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model_name,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0,
            "response_format": {"type": "json_object"},
        },
        timeout=60,
    )
    response.raise_for_status()
    payload = response.json()
    content = payload["choices"][0]["message"]["content"]
    data = json.loads(content)
    if not isinstance(data, dict):
        raise RuntimeError("LLM output is not an object")
    return data


def evaluate_comment(
    text: str,
    provider: str,
    model_name: str,
    prompt_version: str,
) -> dict[str, Any]:
    if provider == "heuristic":
        return heuristic_evaluate(text)

    if provider == "openai_compatible":
        try:
            return openai_compatible_evaluate(
                text=text,
                model_name=model_name,
                prompt_version=prompt_version,
                api_base_url=LLM_API_BASE_URL,
                api_key=LLM_API_KEY,
            )
        except Exception:
            # API障害時の停止を避けるためフォールバック
            fallback = heuristic_evaluate(text)
            fallback["rationale"] = "openai_compatible_failed_fallback_to_heuristic"
            return fallback

    fallback = heuristic_evaluate(text)
    fallback["rationale"] = f"unknown_provider_fallback:{provider}"
    return fallback

