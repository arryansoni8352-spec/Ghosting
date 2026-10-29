#!/usr/bin/env python3
"""
VeilGuard Engine entry point.

Usage (from engine/ directory):
    python run_engine.py

The engine reads line-delimited JSON from stdin and writes line-delimited JSON
to stdout. It is started and managed by the Electron main process.

Do not import or call this from user-facing application code.
"""

import sys
import os

# Ensure the engine package is importable regardless of cwd
sys.path.insert(0, os.path.dirname(__file__))

from veilguard_engine.engine import run_engine_loop

if __name__ == "__main__":
    run_engine_loop()
