# NeuroVault Intelligence Lab: Knowledge Base Starter Guide

## 1. What is NeuroVault?
NeuroVault is an AI-powered Retrieval-Augmented Generation (RAG) platform and deep-learning knowledge lab. It enables users to upload research papers, documentation, and technical notes, automatically indexes them into high-dimensional vector spaces, and uses large language models (LLMs) to answer questions with verifiable citations and source grounding.

## 2. Retrieval-Augmented Generation (RAG) Architecture
RAG combines dense neural retrieval with generative language modeling:
1. **Document Ingestion**: Documents (PDF, Markdown, TXT) are loaded, normalized, and partitioned into overlapping chunks using recursive text splitting.
2. **Dense Vector Embeddings**: Each chunk is transformed into a dense 384-dimensional vector using transformer models (such as `sentence-transformers/all-MiniLM-L6-v2`).
3. **ChromaDB Vector Store**: Embeddings are stored and indexed using cosine distance or L2 metrics for rapid nearest-neighbor lookup.
4. **Maximal Marginal Relevance (MMR) Retrieval**: When a user asks a query, the retriever balances relevance and diversity to prevent redundant source chunks.
5. **Contextual Generation**: Retrieved context is injected into a system prompt. The model generates answers grounded in the retrieved sources, citing page numbers and file names.

## 3. Deep Learning & Recurrent Neural Networks
Deep learning architectures process sequential data through hidden state representations:
- **Feedforward Networks (MLP)**: Map fixed-size inputs to outputs across hidden layers with non-linear activation functions (ReLU, GELU).
- **Recurrent Neural Networks (RNN)**: Maintain a recurrent hidden state $h_t = \tanh(W x_t + U h_{t-1} + b)$ to process arbitrary sequence lengths. However, vanilla RNNs suffer from vanishing and exploding gradients over long horizons.
- **Gated Recurrent Units (GRU)**: Introduce reset gates $r_t$ and update gates $z_t$ to control the flow of information across time steps without requiring separate memory cell states like LSTMs.
- **Transformers**: Replace recurrent connections entirely with multi-head self-attention mechanisms $\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V$, allowing massive parallelization and long-range dependency tracking.

## 4. Client-Side Bring Your Own Key (BYOK)
NeuroVault uses a privacy-first, client-side BYOK architecture:
- Users provide their own API key (Groq, OpenAI, or Google Gemini) directly in the Settings page.
- Keys are stored securely in local browser storage and transmitted per-request via secure authorization headers (`X-BYOK-Key`, `X-BYOK-Provider`, `X-BYOK-Model`).
- The backend operates seamlessly without requiring server-side secret keys.
