"""Wipe the throwaway e2e database + media directory before the e2e backend starts."""
import shutil
import sys
from pathlib import Path

target = Path(sys.argv[1]).resolve()
assert target.name == ".e2e", "refusing to delete anything that is not a .e2e directory"
shutil.rmtree(target, ignore_errors=True)
target.mkdir(parents=True)
print("reset", target)
