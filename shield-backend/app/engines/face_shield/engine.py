"""Face Shield: identity-protection engine inspired by Fawkes (Shan et al., USENIX Security 2020).

Phase 1: interface and description only. No optimisation exists yet.
See docs/RESEARCH.md for the method summary and open questions.
"""
from app.core.engine import EngineDescription, ProtectionEngine
from app.schemas.common import EngineName


class FaceShieldEngine(ProtectionEngine):
    name = EngineName.face_shield
    implemented = False

    def describe(self) -> EngineDescription:
        return EngineDescription(
            engine=self.name,
            display_name="Face Shield",
            implemented=self.implemented,
            summary=(
                "Planned: adds small pixel-level changes to facial photographs intended to "
                "reduce identity-recognition performance of models trained on them. "
                "Not implemented in Phase 1."
            ),
            target_scenarios=[
                "Recognition models trained by third parties on scraped photos of the protected person (planned).",
            ],
            limitations=[
                "No protection is provided yet. This is a stub.",
                "Does not claim universal protection against facial recognition systems.",
                "Protection can be weakened by future models or countermeasures.",
            ],
            research_basis=[
                "Shan et al., Fawkes: Protecting Personal Privacy against Unauthorized Deep Learning Models, USENIX Security 2020 (arXiv:2002.08327). Code: BSD-3-Clause.",
            ],
            models=[
                {"name": "Face feature extractor", "version": None, "licence": "UNCONFIRMED",
                 "source_url": None, "loaded": False},
            ],
        )
