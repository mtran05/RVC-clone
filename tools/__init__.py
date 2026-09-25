"""Shared helpers for real-time and offline inference.

cuda_graph.py records a repeated CUDA call the first time it runs, then
replays that recording on later audio blocks with the same shape.
"""
