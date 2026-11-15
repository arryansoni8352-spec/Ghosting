from app.core.engine import ProtectionEngine
from app.core.errors import EngineNotFoundError
from app.engines.face_shield.engine import FaceShieldEngine
from app.engines.style_shield.engine import StyleShieldEngine
from app.schemas.common import EngineName

_ENGINES: dict[EngineName, ProtectionEngine] = {
    EngineName.face_shield: FaceShieldEngine(),
    EngineName.style_shield: StyleShieldEngine(),
}


def list_engines() -> list[ProtectionEngine]:
    return list(_ENGINES.values())


def get_engine(name: str) -> ProtectionEngine:
    try:
        return _ENGINES[EngineName(name)]
    except ValueError as exc:
        raise EngineNotFoundError(f"Unknown engine '{name}'.") from exc
