"""The inference options, read from the one file that describes them.

desktop/shared/opts-spec.json is written for everyone: the desktop app's UI,
desktop/args.js which builds the command line, and realtime.py which parses it.
This module is the single reader on the Python side, so the same defaults are
not loaded twice or guessed twice.
"""

import json
from dataclasses import dataclass
from pathlib import Path

OPT_SPEC_PATH = Path(__file__).resolve().parent.parent / "desktop" / "shared" / "opts-spec.json"
OPT_SPEC = json.loads(OPT_SPEC_PATH.read_text(encoding="utf-8"))["options"]


def spec(name):
    """Return the spec entry for one option, or raise if the name is unknown."""
    try:
        return OPT_SPEC[name]
    except KeyError:
        raise KeyError(f"No option named {name!r} in {OPT_SPEC_PATH}") from None


def default(name):
    """Return the starting value declared for one option."""
    return spec(name)["default"]


@dataclass(frozen=True)
class PitchSettings:
    """The knobs that decide which pitches count as a voice.

    Build one explicitly, or take PitchSettings.defaults() for the documented
    starting values. There are no defaults on the fields themselves: a silent
    zero here would read as a real, wrong value rather than as "unset".
    """

    f0_min: int
    f0_max: int
    rmvpe_threshold: float
    fcpe_threshold: float
    index_neighbors: int

    @classmethod
    def defaults(cls):
        """Build from the shared spec."""
        return cls(
            f0_min=default("f0Min"),
            f0_max=default("f0Max"),
            rmvpe_threshold=default("rmvpeThreshold"),
            fcpe_threshold=default("fcpeThreshold"),
            index_neighbors=default("indexNeighbors"),
        )