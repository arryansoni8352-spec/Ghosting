"""Command-line helpers.

    python -m app.cli check-models              # report weight status; never downloads
    python -m app.cli check-models --download   # download (bounded) and verify missing weights
"""
import argparse
import sys

from app.engines.style_shield.weights import (
    MOBILENET_V1_NOTOP, WeightDownloadError, WeightIntegrityError, ensure_weights, weights_status,
)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="ghosting-shield")
    sub = ap.add_subparsers(dest="cmd", required=True)
    cm = sub.add_parser("check-models", help="verify model weights")
    cm.add_argument("--download", action="store_true", help="download missing weights")
    args = ap.parse_args(argv)

    if args.cmd == "check-models":
        status = weights_status(MOBILENET_V1_NOTOP)
        if not status["verified"] and args.download:
            try:
                ensure_weights(MOBILENET_V1_NOTOP)
                status = weights_status(MOBILENET_V1_NOTOP)
            except (WeightDownloadError, WeightIntegrityError) as exc:
                print(f"FAILED: {exc}")
                return 2
        print(f"{status['name']}: {status['note']}")
        print(f"licence: {MOBILENET_V1_NOTOP.licence_weights}")
        return 0 if status["verified"] else 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
