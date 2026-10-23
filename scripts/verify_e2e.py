"""End-to-end verification against the REAL configured backend.

Usage (from backend/ with the venv active):
    python ../scripts/verify_e2e.py            # or copy anywhere; uses env vars

Checks, in order:
  1. /api/health         — pipeline initialized, store queryable
  2. /api/documents      — real document inventory
  3. /api/retrieval/trace— real embedding + MMR + PCA values
  4. /api/chat           — real Groq answer (only when GROQ_API_KEY is set;
                           otherwise the documented degraded behaviour)

Exit code 0 = all executed checks passed.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request

BASE = os.environ.get("NEUROVAULT_BASE_URL", "http://127.0.0.1:8000")


def call(method: str, path: str, payload: dict | None = None):
    req = urllib.request.Request(
        f"{BASE}{path}",
        method=method,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            return res.status, json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


def main() -> int:
    failures: list[str] = []

    print(f"== NeuroVault E2E verification against {BASE} ==")

    status, health = call("GET", "/api/health")
    print(f"[1] health            -> {status} status={health.get('status')}")
    if status != 200:
        failures.append("health")
    print(f"    checks: {json.dumps(health.get('checks', {}), default=str)[:400]}")

    status, docs = call("GET", "/api/documents")
    names = [d["name"] for d in docs.get("documents", [])]
    print(f"[2] documents         -> {status} {names}")
    if status != 200:
        failures.append("documents")

    status, trace = call("POST", "/api/retrieval/trace", {"question": "What is backpropagation?"})
    print(
        f"[3] retrieval trace   -> {status} status={trace.get('status')} "
        f"dim={trace.get('query_embedding_dim')} candidates={len(trace.get('candidates', []))} "
        f"timings={trace.get('timings')}"
    )
    if status != 200 or trace.get("status") != "ok":
        failures.append("trace")

    status, chat = call("POST", "/api/chat", {"question": "What is backpropagation?"})
    if status == 200:
        grounded = chat.get("metadata", {}).get("grounded")
        print(f"[4] chat              -> {status} grounded={grounded}")
        print(f"    answer: {chat.get('answer', '')[:220]}")
        srcs = []
        for s in chat.get("sources", []):
            page = f" p.{s['page']}" if s.get("page") is not None else ""
            srcs.append(s["document"] + page)
        print(f"    sources: {srcs}")
    else:
        detail = chat.get("detail", chat)
        print(f"[4] chat              -> {status} (expected without GROQ_API_KEY)")
        print(f"    detail: {json.dumps(detail, default=str)[:220]}")
        if os.environ.get("GROQ_API_KEY"):
            failures.append("chat")

    if failures:
        print(f"\nFAILED checks: {failures}")
        return 1
    print("\nAll executed checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
