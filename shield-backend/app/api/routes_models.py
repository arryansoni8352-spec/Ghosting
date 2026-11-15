from fastapi import APIRouter

from app.core.registry import list_engines
from app.schemas.common import EngineName
from app.schemas.models import EngineInfo, ModelInfo, ModelsResponse

router = APIRouter(tags=["models"])


@router.get("/models", response_model=ModelsResponse)
def models() -> ModelsResponse:
    engines = []
    for engine in list_engines():
        d = engine.describe()
        engines.append(EngineInfo(
            engine=EngineName(d.engine), display_name=d.display_name, implemented=d.implemented,
            summary=d.summary, target_scenarios=d.target_scenarios, limitations=d.limitations,
            models=[ModelInfo(**{k: v for k, v in m.items() if k != "loaded"}) for m in d.models],
            research_basis=d.research_basis))
    return ModelsResponse(engines=engines)
