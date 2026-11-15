"""Domain errors. The API maps each to an HTTP status and a stable machine-readable code.

Messages are written for the client. They never contain stack traces or filesystem paths.
"""


class ShieldError(Exception):
    status_code: int = 400
    code: str = "shield_error"

    def __init__(self, message: str = "", code: str | None = None, status_code: int | None = None):
        super().__init__(message or self.__class__.__name__)
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code


class UnsupportedImageError(ShieldError):
    code = "unsupported_image"


class FormatMismatchError(ShieldError):
    code = "format_mismatch"


class ImageTooLargeError(ShieldError):
    code = "image_too_large"
    status_code = 413


class UploadTooLargeError(ShieldError):
    code = "upload_too_large"
    status_code = 413


class CorruptImageError(ShieldError):
    code = "corrupt_image"


class InvalidOptionError(ShieldError):
    code = "invalid_option"
    status_code = 422


class BudgetUnsatisfiableError(ShieldError):
    """The requested perturbation budget cannot be met for this format/quality combination,
    because the codec's OWN compression distortion already exceeds it (measured, not assumed).
    This is a 422: the client can fix it by raising quality, using png, or using lossless webp."""
    code = "budget_unsatisfiable"
    status_code = 422


class EngineNotImplementedError(ShieldError):
    status_code = 501
    code = "engine_not_implemented"


class EngineNotFoundError(ShieldError):
    status_code = 404
    code = "engine_not_found"


class JobNotFoundError(ShieldError):
    status_code = 404
    code = "job_not_found"


class JobNotReadyError(ShieldError):
    status_code = 409
    code = "job_not_ready"


class ServerBusyError(ShieldError):
    status_code = 503
    code = "server_busy"


class RateLimitedError(ShieldError):
    status_code = 429
    code = "rate_limited"


class AuthRequiredError(ShieldError):
    status_code = 401
    code = "auth_required"


class ModelUnavailableError(ShieldError):
    status_code = 503
    code = "model_unavailable"


# ----------------------------------------------------------------- video errors
class VideoError(ShieldError):
    code = "video_error"


class UnsupportedVideoError(VideoError):
    code = "unsupported_video"
    status_code = 415


class VideoCorruptError(VideoError):
    code = "video_corrupt"


class VideoLimitError(VideoError):
    code = "video_limit_exceeded"
    status_code = 413


class VideoProcessingError(VideoError):
    """A subprocess or reconstruction step failed. Message is client-safe."""
    code = "video_processing_failed"
    status_code = 500


class VideoValidationError(VideoError):
    """The reconstructed video failed validation and was discarded."""
    code = "video_output_invalid"
    status_code = 500


class JobCancelled(Exception):
    """Raised inside processing when cancellation or a timeout is requested."""


class VerificationError(Exception):
    """Output failed post-encoding verification. Never returned to the client as success."""
