import logging
import re

import torch

from tools.cuda_graph import configure_cuda_graph


logger = logging.getLogger(__name__)


def get_device_dtype_sm(idx):
    """Pick a CUDA device for inference, or CPU when the GPU is too small."""
    cpu = torch.device("cpu")
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

    mem_gb = mem_bytes / (1024**3) + 0.4
    sm_version = major + minor / 10.0
    is_16_series = bool(re.search(r"16\d{2}", gpu_name)) and sm_version == 7.5
    if mem_gb < 4 or sm_version < 5.3:
        return cpu, torch.float32, 0.0, 0.0
    if sm_version == 6.1 or is_16_series:
        return cuda, torch.float32, sm_version, mem_gb
    if sm_version > 6.1:
        return cuda, torch.float16, sm_version, mem_gb
    return cpu, torch.float32, 0.0, 0.0


def _detect_directml():
    try:
        import torch_directml

        device = torch_directml.device(torch_directml.default_device())
        probe = torch.ones(1, dtype=torch.float32).to(device)
        _ = (probe + 1).cpu()
        return True, device
    except Exception:
        return False, None


GPU_PROFILES = (
    [get_device_dtype_sm(i) for i in range(torch.cuda.device_count())]
    if torch.cuda.is_available()
    else []
)
if GPU_PROFILES:
    infer_device, infer_dtype, _, infer_gpu_mem = max(
        GPU_PROFILES, key=lambda profile: (profile[2], profile[3])
    )
else:
    infer_device, infer_dtype, infer_gpu_mem = torch.device("cpu"), torch.float32, 0.0

if infer_device.type != "cuda":
    directml_available, directml_device = _detect_directml()
    if directml_available:
        infer_device, infer_dtype, infer_gpu_mem = directml_device, torch.float32, 0.0
    else:
        infer_device, infer_dtype, infer_gpu_mem = torch.device("cpu"), torch.float32, 0.0

CUDA_GRAPH_AVAILABLE = configure_cuda_graph(infer_device)


class Config:
    """Device and chunk settings shared by real-time and offline conversion."""

    def __init__(self):
        self.device = infer_device
        self.dtype = infer_dtype
        self.is_half = infer_dtype == torch.float16
        self.cuda_graph = CUDA_GRAPH_AVAILABLE
        self.gpu_mem = infer_gpu_mem if infer_device.type == "cuda" else None
        if self.is_half:
            self.x_pad, self.x_query, self.x_center, self.x_max = 3, 10, 60, 65
        else:
            self.x_pad, self.x_query, self.x_center, self.x_max = 1, 6, 38, 41
        if self.gpu_mem is not None and self.gpu_mem <= 4:
            self.x_pad, self.x_query, self.x_center, self.x_max = 1, 5, 30, 32
