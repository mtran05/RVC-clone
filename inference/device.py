"""Choose the device and precision the inference code runs on.

A CUDA GPU with at least 4 GiB and compute capability 5.3 is used.
Pascal (6.1) and GTX 16-series cards stay in float32. Newer CUDA cards
use float16. DirectML is the fallback when CUDA is missing. CPU is last.

Nothing here runs at import time. Call detect_device() where the choice is
actually needed, so importing this module does not initialise CUDA.
"""

import logging
import re
from dataclasses import dataclass

import torch

from inference.cuda_graph import configure_cuda_graph


logger = logging.getLogger(__name__)

# The 0.4 GiB pad matches the original RVC memory check.
MEMORY_PAD_GB = 0.4
MIN_MEMORY_GB = 4.0
MIN_CAPABILITY = 5.3


@dataclass(frozen=True)
class Device:
    """Everything the inference code needs to know about where it is running."""

    device: torch.device
    dtype: torch.dtype
    cuda_graph: bool

    @property
    def is_half(self):
        """Whether the model runs in float16."""
        return self.dtype == torch.float16


def get_device_dtype_sm(idx):
    """Return device, dtype, compute capability, and memory for one CUDA GPU."""
    cpu = torch.device("cpu")
    # Missing or out-of-range indexes are not usable for inference.
    if not torch.cuda.is_available() or idx < 0 or idx >= torch.cuda.device_count():
        return cpu, torch.float32, 0.0, 0.0

    try:
        cuda = torch.device(f"cuda:{idx}")
        major, minor = torch.cuda.get_device_capability(idx)
        gpu_name = torch.cuda.get_device_name(idx)
        mem_bytes = torch.cuda.get_device_properties(idx).total_memory
    except Exception:
        logger.exception("Unable to inspect CUDA device %s", idx)
        return cpu, torch.float32, 0.0, 0.0

    mem_gb = mem_bytes / (1024**3) + MEMORY_PAD_GB
    sm_version = major + minor / 10.0
    is_16_series = bool(re.search(r"16\d{2}", gpu_name)) and sm_version == 7.5
    # Cards below 4 GiB or before Maxwell (5.3) are left unused.
    if mem_gb < MIN_MEMORY_GB or sm_version < MIN_CAPABILITY:
        return cpu, torch.float32, 0.0, 0.0
    if sm_version == 6.1 or is_16_series:
        return cuda, torch.float32, sm_version, mem_gb
    if sm_version > 6.1:
        return cuda, torch.float16, sm_version, mem_gb
    return cpu, torch.float32, 0.0, 0.0


def _detect_directml():
    """Return whether a DirectML device can run a tiny tensor add."""
    try:
        import torch_directml

        device = torch_directml.device(torch_directml.default_device())
        probe = torch.ones(1, dtype=torch.float32).to(device)
        _ = (probe + 1).cpu()
        return True, device
    except Exception:
        return False, None


def detect_device():
    """Pick the fastest usable device, the precision to use, and whether CUDA graphs work.

    Prefers the newest, largest usable GPU. Falls back to DirectML, then CPU.
    A GPU list can be non-empty and still yield CPU, when every card was
    rejected for memory or compute capability, so the DirectML check is made
    on the device that was actually chosen rather than on the GPU count.
    """
    profiles = [get_device_dtype_sm(i) for i in range(torch.cuda.device_count())] if torch.cuda.is_available() else []

    device, dtype = torch.device("cpu"), torch.float32
    if profiles:
        device, dtype, _, _ = max(profiles, key=lambda profile: (profile[2], profile[3]))

    if device.type != "cuda":
        directml_available, directml_device = _detect_directml()
        device = directml_device if directml_available else torch.device("cpu")
        dtype = torch.float32

    return Device(device=device, dtype=dtype, cuda_graph=configure_cuda_graph(device))