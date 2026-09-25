"""Real-time and offline Retrieval-based Voice Conversion.

realtime.py converts a microphone or file one overlapping block at a time.
offline.py converts a whole file through pipeline.py.
rtrvc.py is the streaming model: HuBERT features, optional FAISS index,
pitch, then the synthesizer.
hubert.py, rmvpe.py, and fcpe.py supply content features and pitch.
module/ is the voice model loaded from a .pth checkpoint.
"""

from inference.rtrvc import RVC, get_synthesizer

__all__ = ["RVC", "get_synthesizer"]
