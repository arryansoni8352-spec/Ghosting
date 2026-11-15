"""Style Shield: Glaze-inspired style-cloak engine (independent implementation, JAX).

NOT an exact reproduction of Glaze. See docs/STYLE_SHIELD_DESIGN.md for every substitution.
Protection is not guaranteed. Visual quality is measured on the final encoded output.
Adversarial effectiveness is NOT measured per request (see docs/STYLE_SHIELD_TECHNICAL_REPORT.md).
"""
from __future__ import annotations

import time
from dataclasses import asdict, dataclass, field

import jax
import jax.numpy as jnp
import numpy as np

from app import __version__
from app.core.engine import EngineDescription, ProtectionEngine
from app.core.errors import BudgetUnsatisfiableError, InvalidOptionError, ModelUnavailableError
from app.engines.style_shield import optimise as opt
from app.engines.style_shield.budget import (
    apply_integer_budget, assert_within_budget, integer_budget, measure_codec_noise,
)
from app.engines.style_shield.mobilenet import load_mobilenet_v1
from app.engines.style_shield.weights import (
    MOBILENET_V1_NOTOP, WeightDownloadError, WeightIntegrityError, ensure_weights, sha256_of,
    weights_status,
)
from app.evaluation import art_generator
from app.evaluation.compare import compare_arrays
from app.schemas.common import EngineName
from app.utils import images

EXEMPLAR_SIZE = 128
STRENGTH_PRESETS = ("low", "balanced", "high")
MAX_STEPS_OVERRIDE = 1000


@dataclass
class Control:
    """Cooperative control handed to long-running work."""
    should_stop: callable = lambda: False
    progress: callable = lambda stage, fraction: None


@dataclass
class ProcessResult:
    encoded: bytes
    mime: str
    extension: str
    record: dict = field(default_factory=dict)


def _platform() -> str:
    return jax.default_backend()


class StyleShieldEngine(ProtectionEngine):
    name = EngineName.style_shield
    implemented = True

    def __init__(self) -> None:
        import threading
        self._params = None
        self._weights_path = None
        self._weights_sha = None
        self._load_lock = threading.Lock()

    def load_model(self):
        """Load VERIFIED weights. Raises WeightIntegrityError / FileNotFoundError / WeightDownloadError.

        In production mode, weights whose licence is not confirmed for commercial use are refused.
        """
        with self._load_lock:
            if self._params is None:
                from app.config.settings import get_settings
                if get_settings().production_mode and not MOBILENET_V1_NOTOP.licence_confirmed:
                    raise ModelUnavailableError(
                        "The Style Shield model licence is not confirmed for production use.")
                try:
                    path = ensure_weights(MOBILENET_V1_NOTOP,
                                          allow_download=get_settings().allow_weight_download)
                except (FileNotFoundError, WeightIntegrityError, WeightDownloadError, OSError) as exc:
                    raise ModelUnavailableError(
                        "The Style Shield model weights are not available on this server "
                        f"({type(exc).__name__}). The operator must install verified weights.") from exc
                sha = sha256_of(path)
                self._weights_path, self._weights_sha = path, sha
                self._params = load_mobilenet_v1(path)
            return self._params

    def readiness(self) -> dict:
        """Can this engine run right now? Never loads or downloads anything and never exposes paths."""
        from app.config.settings import get_settings
        settings = get_settings()
        if settings.production_mode and not MOBILENET_V1_NOTOP.licence_confirmed:
            return {"ready": False, "code": "model_licence_unconfirmed",
                    "message": "The model licence is not confirmed for production use, so the engine is disabled."}
        st = weights_status(MOBILENET_V1_NOTOP)
        if st["present"] and st["verified"]:
            return {"ready": True, "code": "ready", "message": "Verified model weights are installed."}
        if st["present"]:
            return {"ready": False, "code": "model_checksum_failed",
                    "message": "Installed model weights fail verification."}
        if settings.allow_weight_download:
            return {"ready": True, "code": "will_download",
                    "message": "Weights will be downloaded and verified on first use."}
        return {"ready": False, "code": "model_not_installed",
                "message": "Model weights are not installed on this server."}

    def describe(self) -> EngineDescription:
        return EngineDescription(
            engine=self.name,
            display_name="Style Shield",
            implemented=self.implemented,
            summary=(
                "Glaze-inspired style cloak: a bounded gradient-based perturbation that moves an "
                "artwork's feature representation toward a style-transferred version of itself. "
                "Uses MobileNetV1 features, a Gatys-style target and an SSIM-based perceptual penalty. "
                "Not an exact reproduction of Glaze."
            ),
            target_scenarios=[
                "Training of a model on cloaked artwork, with a feature extractor similar to the "
                "one used for optimisation (white-box). Transfer to other architectures is NOT tested.",
            ],
            limitations=[
                "Not an exact reproduction of Glaze (see docs/STYLE_SHIELD_DESIGN.md §4).",
                "Protection against diffusion or other generative training pipelines is NOT tested.",
                "Feature extractor is a classifier backbone, not Glaze's generative autoencoder.",
                "The controlled proxy experiment showed no measurable effect.",
                "CPU processing is slow: minutes per image at the maximum allowed size.",
                "Does not claim protection against all image-generation models.",
            ],
            research_basis=[
                "Shan et al., Glaze, USENIX Security 2023 (arXiv:2302.04222): objective structure "
                "and target-style selection rule (Eq. 1-2, §5.3). Independently reimplemented.",
                "Howard et al., MobileNets, 2017: feature extractor architecture.",
                "Gatys et al., 2016: Gram-matrix neural style transfer (substitute for Glaze's Ω).",
                "Wang et al., 2004: SSIM, used as the perceptual distance.",
            ],
            models=[{
                "name": MOBILENET_V1_NOTOP.name,
                "version": "keras-h5 release v0.6",
                "licence": MOBILENET_V1_NOTOP.licence_weights,
                "source_url": MOBILENET_V1_NOTOP.url,
                "loaded": self._params is not None,
            }],
        )

    # ------------------------------------------------------------------ core
    def run(self, src: images.Decoded, preset_name: str, out_format: str = "png",
            quality: int | None = None, seed: int = 0, max_steps: int | None = None,
            control: Control | None = None, input_bytes_len: int = 0,
            webp_lossless: bool = False) -> ProcessResult:
        """Protect one decoded image. Returns encoded bytes and a complete record.

        The record is produced only after the encoded output has been reopened and verified.
        """
        control = control or Control()
        if preset_name not in STRENGTH_PRESETS:
            raise InvalidOptionError("strength must be one of: low, balanced, high")
        if max_steps is not None and not 1 <= max_steps <= MAX_STEPS_OVERRIDE:
            raise InvalidOptionError(f"max_steps must be between 1 and {MAX_STEPS_OVERRIDE}")
        if out_format not in images.OUTPUT_FORMATS:
            raise InvalidOptionError("output_format must be one of: png, jpeg, webp")
        if out_format == "jpeg" and src.has_alpha:
            raise InvalidOptionError(
                "JPEG cannot store transparency. Choose png or webp to keep the alpha channel.")
        lossless_output = out_format == "png" or (out_format == "webp" and webp_lossless)

        preset = opt.PRESETS[preset_name]
        if max_steps is not None:
            preset = opt.Preset(**{**asdict(preset), "steps": max_steps})
        m = integer_budget(preset.epsilon)
        params = self.load_model()

        # Fully transparent pixels (alpha == 0) are excluded from the budget check: codecs may
        # discard colour there since it is invisible, and the optimiser never touches it either.
        visible = (src.alpha > 0) if src.has_alpha else None

        # --- pre-flight: can this format/quality even satisfy the budget with ZERO perturbation? ---
        # Lossy codecs (JPEG, lossy WebP) distort pixels by their own quantisation, independent of
        # any perturbation. If that alone exceeds the budget, optimising would be wasted work, and
        # returning the result would silently exceed the requested limit. Fail fast instead.
        if not lossless_output:
            codec_only = measure_codec_noise(src, out_format, quality, lossless=False, visible_mask=visible)
            if codec_only > m:
                raise BudgetUnsatisfiableError(
                    f"The {out_format} codec alone changes pixels by up to {codec_only} of 255 "
                    f"levels at quality {quality}, before any perturbation is added. The '{preset_name}' "
                    f"preset's budget is {m} levels, so it cannot be met. Use a higher quality, choose "
                    f"png, or set webp_lossless=true.")

        t_start = time.perf_counter()
        gray = src.is_grayscale
        colour = np.stack([src.pixels] * 3, axis=-1) if gray else src.pixels       # H x W x 3 uint8
        x01 = opt.to_array(colour)                                                  # 1 x H x W x 3
        if src.has_alpha:
            mask_np = (src.alpha > 0).astype(np.float32)[None, :, :, None]
        else:
            mask_np = np.ones((1,) + colour.shape[:2] + (1,), np.float32)
        mask = jnp.asarray(mask_np)

        # target selection (design §2.2): victim centroid from this image only
        control.progress("selecting_target", 0.0)
        rng = np.random.default_rng(seed)
        cand_imgs = {name: [opt.to_array(art_generator.paint(name, seed=1000 + j, size=EXEMPLAR_SIZE))
                            for j in range(4)]
                     for name in sorted(art_generator.CANDIDATE_STYLES)}
        target_name, sel = opt.select_target(params, [x01], cand_imgs, rng)
        style = cand_imgs[target_name][0]

        control.progress("style_transfer", 0.0)
        t0 = time.perf_counter()
        target = opt.style_transfer(
            params, x01, style, should_stop=control.should_stop,
            progress=lambda d, t: control.progress("style_transfer", d / t))
        jax.block_until_ready(target)
        transfer_s = time.perf_counter() - t0

        control.progress("cloaking", 0.0)
        cloak = opt.compute_cloak(
            params, x01, target, preset, mask=mask, channels=1 if gray else 3,
            should_stop=control.should_stop,
            progress=lambda d, t: control.progress("cloaking", d / t))

        # exact integer budget on the colour channels (alpha is never changed)
        control.progress("quantising", 0.0)
        delta_np = np.asarray(cloak.delta[0], dtype=np.float64)                    # H x W x cw
        delta_np = np.broadcast_to(delta_np, colour.shape).copy()
        out_colour = apply_integer_budget(colour, delta_np, m)
        worst_pre = assert_within_budget(colour, out_colour, m, "quantised output", visible_mask=visible)
        if gray:
            out_pix = out_colour[..., 0]
        else:
            out_pix = out_colour
        out_alpha = src.alpha if src.has_alpha else None

        # --- encode, then reopen and verify the ENCODED bytes ---
        control.progress("encoding", 0.0)
        encoded = images.encode(src.mode, out_pix, out_alpha, out_format, quality,
                                lossless=(out_format == "webp" and webp_lossless))
        decoded_out = images.verify_encoded(encoded, out_format, src)
        control.progress("verifying", 0.5)

        src_pix = src.pixels                       # H x W (grayscale) or H x W x 3
        out_pix_decoded = decoded_out.pixels
        if gray and decoded_out.mode in ("RGB", "RGBA"):
            # WebP stores grayscale as equal RGB channels; compare the first channel
            out_pix_decoded = decoded_out.pixels[..., 0]
        from app.engines.style_shield.budget import max_abs_change
        worst_encoded = max_abs_change(src_pix, out_pix_decoded, visible)
        alpha_exact = True
        alpha_max = 0
        if src.has_alpha:
            if decoded_out.alpha is None:
                alpha_exact = False
                alpha_max = 255
            else:
                alpha_max = int(np.max(np.abs(decoded_out.alpha.astype(np.int16) - src.alpha.astype(np.int16))))
                alpha_exact = alpha_max == 0
        if lossless_output:
            if worst_encoded > m:
                raise_verification("lossless output exceeded the integer budget")
            if src.has_alpha and not alpha_exact:
                raise_verification("alpha channel changed in lossless output")
        else:
            # Strict post-hoc check: the cloak's own change was within budget before encoding, but
            # the codec can interact with it. Never let an out-of-budget result reach the caller.
            if worst_encoded > m:
                raise BudgetUnsatisfiableError(
                    f"The final {out_format} output changed by {worst_encoded} of 255 levels, over "
                    f"the '{preset_name}' preset's {m}-level budget, after codec compression was "
                    f"included. The image was NOT returned. Use a higher quality, choose png, or "
                    f"set webp_lossless=true.")
        budget_exact_on_encoded = worst_encoded <= m

        quality_metrics = compare_arrays(src_pix, out_pix_decoded,
                                         original_bytes=input_bytes_len, derived_bytes=len(encoded)).to_dict()

        control.progress("done", 1.0)
        record = {
            "engine": self.name.value,
            "implementation": f"Glaze-inspired, independent (version {__version__})",
            "status_note": "protection effectiveness not measured per request",
            "strength": preset_name,
            "preset": asdict(preset),
            "seed": seed,
            "target_style": target_name,
            "target_selection": {k: v for k, v in sel.items() if k != "distances"},
            "target_distances": sel["distances"],
            "input": {
                "format": src.source_format,
                "source_mode": src.source_mode,
                "mode": src.mode,
                "width": src.size[0],
                "height": src.size[1],
                "has_alpha": src.has_alpha,
                "transparent_pixels": int(np.sum(src.alpha == 0)) if src.has_alpha else 0,
                "conversion_notes": src.notes,
            },
            "output": {
                "format": out_format,
                "mime": images.FORMAT_INFO[images.OUTPUT_FORMATS[out_format]][1],
                "mode": decoded_out.mode,
                "width": decoded_out.size[0],
                "height": decoded_out.size[1],
                "bytes": len(encoded),
                "alpha_preserved": bool(alpha_exact) if src.has_alpha else None,
                "alpha_max_change": alpha_max if src.has_alpha else None,
                "lossless": lossless_output,
                "budget_integer_levels": m,
                "budget_epsilon": preset.epsilon,
                "max_change_before_encoding": worst_pre,
                "max_change_after_encoding": worst_encoded,
                "budget_satisfied_after_encoding": bool(budget_exact_on_encoded),
                "budget_note": ("Exact and enforced for lossless output (png, or webp with "
                                "webp_lossless=true). For lossy output, the budget is enforced on "
                                "the final encoded result; if the codec alone (independent of any "
                                "perturbation) would exceed it, the job fails before optimisation "
                                "runs rather than returning an out-of-budget image."),
            },
            "quality": quality_metrics,
            "optimisation_history": cloak.history,
            "timing_seconds": {"style_transfer": round(transfer_s, 3),
                               "cloak_optimisation": round(cloak.seconds, 3),
                               "total": round(time.perf_counter() - t_start, 3)},
            "model": {"name": MOBILENET_V1_NOTOP.name,
                      "weights_sha256": self._weights_sha,
                      "weights_licence": MOBILENET_V1_NOTOP.licence_weights},
            "platform": _platform(),
            "effectiveness": None,
        }
        return ProcessResult(encoded=encoded,
                             mime=record["output"]["mime"],
                             extension=images.FORMAT_INFO[images.OUTPUT_FORMATS[out_format]][2],
                             record=record)

    # ------------------------------------------------ ProtectionEngine interface
    def protect(self, image_bytes: bytes, strength, options: dict):
        """Synchronous convenience wrapper used by tests. The API uses JobManager instead."""
        src = images.load(image_bytes, max_pixels=512 * 512, min_side=32)
        res = self.run(src, getattr(strength, "value", str(strength)), input_bytes_len=len(image_bytes), **options)
        return res.encoded, {"record": res.record}


def raise_verification(msg: str):
    from app.core.errors import VerificationError
    raise VerificationError(msg)
