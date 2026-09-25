"""Streaming voice conversion for one audio block at a time.

RVC holds HuBERT, an optional FAISS index, a pitch cache, and the
synthesizer. infer() is what realtime.py calls for every block.
"""

import logging
import traceback
from time import time as ttime

import faiss
import numpy as np
import parselmouth
import torch
import torch.nn.functional as F
from torchaudio.transforms import Resample

from inference.hubert import extract_hubert_features, load_hubert_model
from tools.cuda_graph import run_cuda_graph


logger = logging.getLogger(__name__)


def get_synthesizer(pth_path, device=torch.device("cpu")):
    """Build the synthesizer that matches a .pth checkpoint and load its weights."""
    from inference.module.models import (
        SynthesizerTrnMs256NSFsid,
        SynthesizerTrnMs256NSFsid_nono,
        SynthesizerTrnMs768NSFsid,
        SynthesizerTrnMs768NSFsid_nono,
    )

    checkpoint = torch.load(pth_path, map_location=torch.device("cpu"))
    # Speaker count in the saved config can disagree with the embedding table.
    checkpoint["config"][-3] = checkpoint["weight"]["emb_g.weight"].shape[0]
    use_f0 = checkpoint.get("f0", 1)
    version = checkpoint.get("version", "v1")
    if version == "v1":
        if use_f0 == 1:
            net_g = SynthesizerTrnMs256NSFsid(*checkpoint["config"], is_half=False)
        else:
            net_g = SynthesizerTrnMs256NSFsid_nono(*checkpoint["config"])
    elif version == "v2":
        if use_f0 == 1:
            net_g = SynthesizerTrnMs768NSFsid(*checkpoint["config"], is_half=False)
        else:
            net_g = SynthesizerTrnMs768NSFsid_nono(*checkpoint["config"])
    else:
        raise ValueError(f"Unsupported RVC version: {version!r}")
    # The posterior encoder is only used in training.
    if hasattr(net_g, "enc_q"):
        del net_g.enc_q
    net_g.load_state_dict(checkpoint["weight"], strict=False)
    net_g = net_g.float()
    net_g.eval().to(device)
    net_g.remove_weight_norm()
    return net_g, checkpoint


class RVC:
    """Streaming voice conversion for fixed-size audio blocks."""

    def __init__(
        self,
        key,
        formant,
        pth_path,
        index_path,
        index_rate,
        config,
        last_rvc=None,
    ):
        """Load HuBERT, the voice model, and the index unless last_rvc already has them."""
        try:
            self.config = config
            self.device = config.device
            self.f0_up_key = key
            self.formant_shift = formant
            self.f0_min = 50
            self.f0_max = 1100
            self.rmvpe_threshold = 0.03
            self.fcpe_threshold = 0.006
            self.index_neighbors = 8
            self.f0_mel_min = 1127 * np.log(1 + self.f0_min / 700)
            self.f0_mel_max = 1127 * np.log(1 + self.f0_max / 700)
            self.is_half = config.is_half
            self.pth_path = pth_path
            self.index_path = index_path
            self.index_rate = index_rate
            if index_rate != 0:
                self._load_index()
            self.cache_pitch = torch.zeros(1024, device=self.device, dtype=torch.long)
            self.cache_pitchf = torch.zeros(
                1024, device=self.device, dtype=torch.float32
            )
            self.infer_count = 0
            self.resample_kernel = {}

            if last_rvc is None:
                self.model = load_hubert_model(self.device, self.is_half)
            else:
                self.model = last_rvc.model

            self.net_g = None
            if last_rvc is None or last_rvc.pth_path != self.pth_path:
                self._load_synthesizer()
            else:
                self.tgt_sr = last_rvc.tgt_sr
                self.if_f0 = last_rvc.if_f0
                self.version = last_rvc.version
                self.is_half = last_rvc.is_half
                self.net_g = last_rvc.net_g

            if last_rvc is not None and hasattr(last_rvc, "model_rmvpe"):
                self.model_rmvpe = last_rvc.model_rmvpe
            if last_rvc is not None and hasattr(last_rvc, "model_fcpe"):
                self.model_fcpe = last_rvc.model_fcpe
        except Exception:
            logger.error(traceback.format_exc())
            raise

    def _load_index(self):
        """Read the FAISS index and keep every stored feature vector in memory."""
        self.index = faiss.read_index(self.index_path)
        self.big_npy = self.index.reconstruct_n(0, self.index.ntotal)
        logger.info("Index retrieval enabled")

    def _load_synthesizer(self):
        """Load the voice model and remember its sample rate, version, and f0 flag."""
        self.net_g, checkpoint = get_synthesizer(self.pth_path, self.device)
        self.tgt_sr = checkpoint["config"][-1]
        self.if_f0 = checkpoint.get("f0", 1)
        self.version = checkpoint.get("version", "v1")
        if self.is_half:
            self.net_g = self.net_g.half()
        else:
            self.net_g = self.net_g.float()

    def change_key(self, new_key):
        """Set the pitch shift in semitones for later blocks."""
        self.f0_up_key = new_key

    def change_formant(self, new_formant):
        """Set the formant shift in semitones for later blocks."""
        self.formant_shift = new_formant

    def change_index_rate(self, new_index_rate):
        """Change how strongly retrieved index features replace HuBERT features."""
        if new_index_rate != 0 and self.index_rate == 0:
            self._load_index()
        self.index_rate = new_index_rate

    def get_f0_post(self, f0):
        """Turn Hz pitch into the coarse 1..255 bins the synthesizer expects."""
        if not torch.is_tensor(f0):
            f0 = torch.from_numpy(f0)
        f0 = f0.float().to(self.device).squeeze()
        f0_mel = 1127 * torch.log(1 + f0 / 700)
        voiced = f0_mel > 0
        f0_mel[voiced] = (f0_mel[voiced] - self.f0_mel_min) * 254 / (
            self.f0_mel_max - self.f0_mel_min
        ) + 1
        f0_mel[f0_mel <= 1] = 1
        f0_mel[f0_mel > 255] = 255
        f0_coarse = torch.round(f0_mel).long()
        return f0_coarse, f0

    def get_f0(self, x, f0_up_key, method="rmvpe"):
        """Estimate pitch with rmvpe, fcpe, or Parselmouth, then shift it."""
        if method == "rmvpe":
            return self.get_f0_rmvpe(x, f0_up_key)
        if method == "fcpe":
            return self.get_f0_fcpe(x, f0_up_key)
        if method != "pm":
            raise ValueError(f"Unsupported F0 method: {method}")
        # Parselmouth needs padding so the first pitch frame lines up with the audio.
        x = x.cpu().numpy()
        p_len = x.shape[0] // 160 + 1
        f0_min = self.f0_min
        l_pad = int(np.ceil(1.5 / f0_min * 16000))
        r_pad = l_pad + 1
        sound = parselmouth.Sound(np.pad(x, (l_pad, r_pad)), 16000).to_pitch_ac(
            time_step=0.01,
            voicing_threshold=0.6,
            pitch_floor=f0_min,
            pitch_ceiling=self.f0_max,
        )
        if abs(sound.t1 - 1.5 / f0_min) >= 0.001:
            raise RuntimeError("Parselmouth pitch window does not match the padding")
        f0 = sound.selected_array["frequency"]
        if len(f0) < p_len:
            f0 = np.pad(f0, (0, p_len - len(f0)))
        f0 = f0[:p_len]
        return self._shift_f0(f0, f0_up_key)

    def get_f0_rmvpe(self, x, f0_up_key):
        """Estimate pitch with RMVPE and apply the semitone shift."""
        if not hasattr(self, "model_rmvpe"):
            from inference.rmvpe import RMVPE

            logger.info("Loading RMVPE model")
            self.model_rmvpe = RMVPE(
                "assets/rmvpe/rmvpe.pt",
                is_half=self.is_half,
                device=self.device,
            )
        f0 = self.model_rmvpe.infer_from_audio(x, thred=self.rmvpe_threshold)
        return self._shift_f0(f0, f0_up_key)

    def get_f0_fcpe(self, x, f0_up_key):
        """Estimate pitch with FCPE and apply the semitone shift."""
        if not hasattr(self, "model_fcpe"):
            from inference.fcpe import FCPEInfer

            logger.info("Loading FCPE model")
            self.model_fcpe = FCPEInfer(self.device)
        f0 = (
            self.model_fcpe.infer(
                x.unsqueeze(0).float(),
                sr=16000,
                decoder_mode="local_argmax",
                threshold=self.fcpe_threshold,
            )
            .squeeze()
            .detach()
            .cpu()
            .numpy()
        )
        return self._shift_f0(f0, f0_up_key)

    def _shift_f0(self, f0, f0_up_key):
        """Fill unvoiced gaps, shift by semitones, and quantize to coarse bins."""
        unvoiced = f0 == 0
        if np.any(~unvoiced):
            f0[unvoiced] = np.interp(
                np.where(unvoiced)[0], np.where(~unvoiced)[0], f0[~unvoiced]
            )
        f0 *= pow(2, f0_up_key / 12)
        return self.get_f0_post(f0)

    def infer(
        self,
        input_wav,
        block_frame_16k,
        skip_head,
        return_length,
        f0method,
    ):
        """Convert one 16 kHz block and return audio at the model's frame rate.

        skip_head drops the extra context the caller keeps for a stable
        start. return_length is how many 10 ms frames the caller wants back.
        """
        report_status = self.infer_count < 3 or self.infer_count % 100 == 0
        self.infer_count += 1
        started = ttime()
        with torch.no_grad():
            if self.config.is_half:
                feats = input_wav.half().view(1, -1)
            else:
                feats = input_wav.float().view(1, -1)
            padding_mask = torch.zeros(feats.shape, dtype=torch.bool, device=self.device)
            # Content features. The extra last frame keeps the length even.
            feats = extract_hubert_features(
                self.model,
                feats,
                self.version,
                padding_mask=padding_mask,
            )
            feats = torch.cat((feats, feats[:, -1:, :]), 1)
        features_done = ttime()
        try:
            # Blend HuBERT features toward the nearest stored voice vectors.
            if hasattr(self, "index") and self.index_rate != 0:
                npy = feats[0][skip_head // 2 :].cpu().numpy().astype("float32")
                score, ix = self.index.search(npy, k=self.index_neighbors)
                if (ix >= 0).all():
                    weight = np.square(1 / score)
                    weight /= weight.sum(axis=1, keepdims=True)
                    npy = np.sum(
                        self.big_npy[ix] * np.expand_dims(weight, axis=2), axis=1
                    )
                    if self.config.is_half:
                        npy = npy.astype("float16")
                    feats[0][skip_head // 2 :] = (
                        torch.from_numpy(npy).unsqueeze(0).to(self.device)
                        * self.index_rate
                        + (1 - self.index_rate) * feats[0][skip_head // 2 :]
                    )
                else:
                    logger.warning(
                        "Index is invalid. Use an added_*.index file, not a trained_*.index file."
                    )
            elif report_status:
                logger.info("Index retrieval is disabled")
        except Exception:
            logger.exception("Index retrieval failed")
        index_done = ttime()
        p_len = input_wav.shape[0] // 160
        factor = pow(2, self.formant_shift / 12)
        return_length2 = int(np.ceil(return_length * factor))
        if self.if_f0 == 1:
            f0_extractor_frame = block_frame_16k + 800
            if f0method == "rmvpe":
                f0_extractor_frame = 5120 * ((f0_extractor_frame - 1) // 5120 + 1) - 160
            pitch, pitchf = self.get_f0(
                input_wav[-f0_extractor_frame:],
                self.f0_up_key - self.formant_shift,
                f0method,
            )
            # Slide the pitch cache forward by this block, then write the new tail.
            shift = block_frame_16k // 160
            self.cache_pitch[:-shift] = self.cache_pitch[shift:].clone()
            self.cache_pitchf[:-shift] = self.cache_pitchf[shift:].clone()
            self.cache_pitch[4 - pitch.shape[0] :] = pitch[3:-1]
            self.cache_pitchf[4 - pitch.shape[0] :] = pitchf[3:-1]
            cache_pitch = self.cache_pitch[None, -p_len:]
            cache_pitchf = (
                self.cache_pitchf[None, -p_len:] * return_length2 / return_length
            )
        pitch_done = ttime()
        # HuBERT frames are 20 ms. The synthesizer wants 10 ms frames.
        feats = F.interpolate(feats.permute(0, 2, 1), scale_factor=2).permute(0, 2, 1)
        feats = feats[:, :p_len, :]
        p_len_tensor = torch.tensor([p_len], device=self.device, dtype=torch.long)
        sid = torch.tensor([0], device=self.device, dtype=torch.long)
        skip_head_value = int(skip_head)
        return_length_value = int(return_length)
        return_length2_value = int(return_length2)
        with torch.no_grad():
            if self.if_f0 == 1:
                inferred_audio = run_cuda_graph(
                    self.net_g,
                    "rvc-realtime-f0-%s-%s-%s"
                    % (skip_head_value, return_length_value, return_length2_value),
                    lambda phone, lengths, coarse, continuous, speaker: self.net_g.infer(
                        phone,
                        lengths,
                        coarse,
                        continuous,
                        speaker,
                        skip_head_value,
                        return_length_value,
                        return_length2_value,
                    )[0],
                    feats,
                    p_len_tensor,
                    cache_pitch,
                    cache_pitchf,
                    sid,
                )
            else:
                inferred_audio = run_cuda_graph(
                    self.net_g,
                    "rvc-realtime-no-f0-%s-%s-%s"
                    % (skip_head_value, return_length_value, return_length2_value),
                    lambda phone, lengths, speaker: self.net_g.infer(
                        phone,
                        lengths,
                        speaker,
                        skip_head_value,
                        return_length_value,
                        return_length2_value,
                    )[0],
                    feats,
                    p_len_tensor,
                    sid,
                )
        inferred_audio = inferred_audio.squeeze(1).float()
        # A formant shift changes the model's output hop, so resample back.
        upp_res = int(np.floor(factor * self.tgt_sr // 100))
        if upp_res != self.tgt_sr // 100:
            if upp_res not in self.resample_kernel:
                self.resample_kernel[upp_res] = Resample(
                    orig_freq=upp_res,
                    new_freq=self.tgt_sr // 100,
                    dtype=torch.float32,
                ).to(self.device)
            inferred_audio = self.resample_kernel[upp_res](
                inferred_audio[:, : return_length * upp_res]
            )
        finished = ttime()
        if report_status:
            logger.info(
                "Timing: features=%.3fs, index=%.3fs, pitch=%.3fs, model=%.3fs",
                features_done - started,
                index_done - features_done,
                pitch_done - index_done,
                finished - pitch_done,
            )
        return inferred_audio.squeeze()
