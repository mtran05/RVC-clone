"""Retrieval-based Voice Conversion.

realtime.py is the entry point. It converts a microphone or a file one
overlapping block at a time, and is what the desktop app drives.

rtrvc.py is the streaming model behind it: HuBERT features, an optional FAISS
index, pitch, then the synthesizer. hubert.py, rmvpe.py, and fcpe.py supply
content features and pitch. cuda_graph.py records and replays fixed-shape work
so repeated blocks skip the launch cost. device.py picks the GPU and the
precision, and opts.py reads the shared option spec.

module/ is the voice model loaded from a .pth checkpoint. It comes from
upstream RVC and is left as it is, so it stays easy to re-sync.

Nothing is imported here on purpose. Importing the package should not pull in
torch; call detect_device() in device.py where the device is needed.
"""