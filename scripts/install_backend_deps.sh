#!/usr/bin/env bash
# Installs NeuroVault backend dependencies into the sandbox venv.
# CPU-only torch keeps the download small; the user's Windows machine may use
# the default torch wheel from PyPI via requirements.txt.
set -x
LOG=/home/z/my-project/scripts/pip_install.log
{
  pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
  pip install --no-cache-dir \
    "fastapi>=0.115" \
    "uvicorn[standard]>=0.32" \
    "pydantic>=2.9" \
    "pydantic-settings>=2.6" \
    "python-multipart>=0.0.12" \
    "chromadb>=0.5.20" \
    "langchain>=0.3.7" \
    "langchain-community>=0.3.5" \
    "langchain-huggingface>=0.1.2" \
    "langchain-groq>=0.2.1" \
    "langchain-text-splitters>=0.3.2" \
    "sentence-transformers>=3.2" \
    "pypdf>=5.0" \
    "python-dotenv>=1.0" \
    "numpy" \
    "pytest>=8.3" \
    "httpx>=0.27"
  echo "INSTALL_DONE rc=$?"
} >> "$LOG" 2>&1
