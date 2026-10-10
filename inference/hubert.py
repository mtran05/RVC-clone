"""HuBERT content features for v1 (256-D) and v2 (768-D) voice models.

The weights live in assets/hubert_base. v1 reads encoder layer 9 and a
final projection. v2 reads the last hidden state.
"""

import logging
from functools import lru_cache, partial
from pathlib import Path

import torch
from torch import nn
from transformers import AutoFeatureExtractor, HubertModel

from inference.cuda_graph import device_type, run_cuda_graph


logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent


class HubertModelWithFinalProj(HubertModel):
    """HuBERT plus the linear layer that turns layer 9 into 256-D features."""

    def __init__(self, config):
        """Add final_proj, which the stock Transformers HubertModel omits."""
        super().__init__(config)
        self.final_proj = nn.Linear(config.hidden_size, config.classifier_proj_size)


HUBERT_MODEL_PATH = (PROJECT_ROOT / "assets" / "hubert_base").resolve()


def load_hubert_model(device, is_half=False):
    """Load the local Transformers HuBERT/ContentVec model for RVC."""
    if not (HUBERT_MODEL_PATH / "config.json").is_file():
        raise FileNotFoundError(
            f"Transformers HuBERT model not found: {HUBERT_MODEL_PATH}"
        )

    dtype = torch.float16 if is_half else torch.float32
    load_options = {
        "local_files_only": True,
        "torch_dtype": dtype,
    }
    # DirectML does not implement every SDPA kernel used by Transformers.
    if device_type(device) == "privateuseone":
        load_options["attn_implementation"] = "eager"

    logger.info(
        "Loading Transformers HuBERT from %s (%s on %s)",
        HUBERT_MODEL_PATH,
        dtype,
        device,
    )
    model = HubertModelWithFinalProj.from_pretrained(
        str(HUBERT_MODEL_PATH), **load_options
    )
    model = model.to(device)
    return model.eval()


@lru_cache(maxsize=1)
def hubert_audio_requires_normalization():
    """Return whether this checkpoint expects peak-normalized input audio."""
    feature_extractor = AutoFeatureExtractor.from_pretrained(
        str(HUBERT_MODEL_PATH), local_files_only=True
    )
    return bool(feature_extractor.do_normalize)


def _v1_features(model, input_values, attention_mask):
    """Project HuBERT layer 9 into the 256-D v1 features."""
    outputs = model(
        input_values=input_values,
        attention_mask=attention_mask,
        output_hidden_states=True,
        return_dict=True,
    )
    return model.final_proj(outputs.hidden_states[9])


def _v2_features(model, input_values, attention_mask):
    """Return the last HuBERT layer, which is the 768-D v2 feature."""
    return model(
        input_values=input_values,
        attention_mask=attention_mask,
        output_hidden_states=False,
        return_dict=True,
    ).last_hidden_state


def extract_hubert_features(model, source, version, padding_mask=None):
    """Return the RVC v1 (256-D) or v2 (768-D) HuBERT representation.

    Transformers hidden_states[N] is numerically equivalent to the source checkpoint's
    output_layer=N for this converted checkpoint. RVC v1 uses layer 9 followed
    by final_proj; RVC v2 uses the final (12th) encoder layer directly.
    """
    if version not in {"v1", "v2"}:
        raise ValueError(f"Unsupported RVC feature version: {version!r}")

    attention_mask = None
    if padding_mask is not None and bool(torch.any(padding_mask).item()):
        attention_mask = (~padding_mask.bool()).long()

    project = _v1_features if version == "v1" else _v2_features

    # The graph cache keys on the namespace, so the masked and unmasked paths
    # stay separate names. Passing None through the graph is not possible: the
    # cache inspects every input's shape.
    if attention_mask is None:
        forward = partial(project, model, attention_mask=None)
        return run_cuda_graph(model, f"hubert-{version}-no-mask", forward, source)

    forward = partial(project, model)
    return run_cuda_graph(model, f"hubert-{version}-mask", forward, source, attention_mask)
