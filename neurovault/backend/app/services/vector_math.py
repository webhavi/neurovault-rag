"""Vector math helpers used by the retrieval trace / embedding-space view.

All functions operate on real embedding vectors produced by the configured
embedding model. The 3D projection is a PCA approximation of the original
high-dimensional space and is always labelled as such by the API.
"""
from __future__ import annotations

import numpy as np


def cosine_similarity_matrix(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Cosine similarity between every row of *a* and every row of *b*."""
    if a.size == 0 or b.size == 0:
        return np.zeros((a.shape[0], b.shape[0]))
    a_norm = a / (np.linalg.norm(a, axis=1, keepdims=True) + 1e-12)
    b_norm = b / (np.linalg.norm(b, axis=1, keepdims=True) + 1e-12)
    return a_norm @ b_norm.T


def pca_project_3d(vectors: np.ndarray) -> np.ndarray:
    """Project vectors to 3D with PCA.

    Uses SVD on the mean-centred matrix. When fewer than three principal
    components exist (e.g. tiny corpora), the remaining axes are zero-filled
    so callers always receive exactly three coordinates per point.
    """
    vectors = np.asarray(vectors, dtype=float)
    if vectors.ndim != 2 or vectors.shape[0] == 0:
        return np.zeros((0, 3))
    centred = vectors - vectors.mean(axis=0, keepdims=True)
    # Economy SVD: rows of Vt are the principal directions.
    try:
        _u, s, vt = np.linalg.svd(centred, full_matrices=False)
    except np.linalg.LinAlgError:
        return np.zeros((vectors.shape[0], 3))
    n_components = min(3, vt.shape[0])
    projected = np.zeros((vectors.shape[0], 3))
    if n_components:
        projected[:, :n_components] = centred @ vt[:n_components].T
    # Normalise scale so the scene framing is stable across queries.
    max_abs = np.abs(projected).max()
    if max_abs > 0:
        projected = projected / max_abs * 3.0
    return projected
