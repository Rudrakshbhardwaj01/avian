"""Morphological similarity networks.

Nodes are species; edges connect each species to its k nearest neighbors in
standardized trait space. Communities are detected with greedy modularity
(networkx); centrality highlights morphologically central or peripheral
species. Edges encode morphological similarity ONLY — this is not a
phylogeny and must not be read as evolutionary relatedness.

Scopes are capped because visualization and community detection on 10k nodes
would produce an unreadable hairball; the UI enforces a scope ≤ 3,000 nodes.
"""
from __future__ import annotations

import json
from functools import lru_cache

import networkx as nx
import numpy as np
import pandas as pd
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler

from app.config import RANDOM_SEED
from app.data.filters import Filters, apply_filters, filter_key
from app.data.loader import NUMERIC_TRAITS, species_frame
from app.util import py

MAX_NODES = 3000


@lru_cache(maxsize=32)
def _network(fkey: str, features: tuple[str, ...], k: int, max_nodes: int) -> dict:
    f = Filters(**json.loads(fkey))
    df = apply_filters(f)
    feats = list(features)
    complete = df[["id", "sci", "en", "order", "family", "habitat", "iucn"] + feats].dropna(subset=feats).reset_index(drop=True)
    pool_n = len(complete)
    if pool_n < 20:
        return {"error": "fewer than 20 fully measured species in scope — widen the filters"}
    if pool_n > max_nodes:
        # deterministic priority: rarest taxonomic representation first, then
        # dataset order, to keep communities interpretable
        counts = complete["family"].map(complete["family"].value_counts())
        complete = (
            complete.assign(_c=counts)
            .sort_values(["_c"], kind="stable")
            .head(max_nodes)
            .reset_index(drop=True)
        )
    sampled = pool_n > max_nodes

    X = StandardScaler().fit_transform(complete[feats].to_numpy(dtype=float))
    k_eff = min(k, len(complete) - 1)
    nn = NearestNeighbors(n_neighbors=k_eff + 1, metric="euclidean")
    nn.fit(X)
    dist, idx = nn.kneighbors(X)

    G = nx.Graph()
    ids = complete["id"].tolist()
    for i in range(len(complete)):
        G.add_node(i)
    edge_set = set()
    for i in range(len(complete)):
        for j_pos in range(1, k_eff + 1):
            j = int(idx[i, j_pos])
            if i == j:
                continue
            key = (min(i, j), max(i, j))
            if key in edge_set:
                continue
            edge_set.add(key)
            G.add_edge(i, j, weight=float(1.0 / (1.0 + dist[i, j_pos])))

    # community detection + centrality
    communities = nx.community.greedy_modularity_communities(G, weight="weight")
    comm_of = {}
    for ci, members in enumerate(communities):
        for m in members:
            comm_of[m] = ci
    degree = dict(G.degree())
    # eigenvector centrality on the largest connected component subset is
    # expensive on huge graphs; use degree + strength instead for scale
    strength = {n: sum(d["weight"] for _, _, d in G.edges(n, data=True)) for n in G.nodes()}

    # 2-D layout: PCA of the standardized traits (deterministic, meaningful)
    from sklearn.decomposition import PCA

    coords = PCA(n_components=2, random_state=RANDOM_SEED).fit_transform(X)

    nodes = []
    for i in range(len(complete)):
        r = complete.iloc[i]
        nodes.append({
            "id": py(r["id"]), "en": py(r["en"]), "sci": py(r["sci"]),
            "order": py(r["order"]), "family": py(r["family"]),
            "habitat": py(r["habitat"]), "iucn": py(r["iucn"]),
            "community": int(comm_of.get(i, -1)),
            "degree": int(degree.get(i, 0)),
            "strength": py(strength.get(i, 0.0)),
            "x": py(coords[i, 0]), "y": py(coords[i, 1]),
        })

    edges = [
        {"a": int(a), "b": int(b), "weight": py(d["weight"])}
        for a, b, d in G.edges(data=True)
    ]

    # community composition
    comp = []
    for ci, members in enumerate(sorted(communities, key=len, reverse=True)[:12]):
        sub = complete.iloc[list(members)]
        comp.append({
            "community": ci,
            "n": len(members),
            "topOrders": {py(k2): int(v) for k2, v in sub["order"].value_counts().head(4).items()},
            "topHabitats": {py(k2): int(v) for k2, v in sub["habitat"].value_counts().head(3).items()},
        })

    return {
        "features": feats,
        "k": k_eff,
        "poolN": int(pool_n),
        "nodesShown": int(len(complete)),
        "sampled": sampled,
        "nodes": nodes,
        "edges": edges,
        "nEdges": len(edges),
        "nCommunities": len(communities),
        "communityComposition": comp,
        "centralSpecies": sorted(nodes, key=lambda n: -n["degree"])[:12],
        "note": (
            "Each edge connects a species to one of its k nearest neighbors "
            "in standardized trait space. Communities are greedy-modularity "
            "groupings of morphological similarity — they are NOT clades and "
            "this network is NOT an evolutionary tree. Layout uses trait PCA."
        ),
    }


def network_payload(f: Filters, features: list[str] | None = None, k: int = 6,
                    max_nodes: int = 1500) -> dict:
    feats = [v for v in (features or NUMERIC_TRAITS[:8]) if v in NUMERIC_TRAITS]
    if len(feats) < 3:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="select at least three numeric features")
    k = max(3, min(12, int(k)))
    max_nodes = max(100, min(MAX_NODES, int(max_nodes)))
    return _network(filter_key(f), tuple(feats), k, max_nodes)
