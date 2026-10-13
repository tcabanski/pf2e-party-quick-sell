"""Validate metadata and build a minimal, directly installable Foundry archive."""
import json
import os
import pathlib
import re
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / "module.json").read_text())
module_id = "pf2e-party-quick-sell"
repository = "https://github.com/tcabanski/" + module_id
version = manifest["version"]
assert re.fullmatch(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", version), "Invalid semantic version"
assert manifest["id"] == module_id
assert manifest["compatibility"] == {"minimum": "14.361", "verified": "14.369", "maximum": "14"}
assert manifest["relationships"]["systems"] == [{"id": "pf2e", "type": "system", "compatibility": {"minimum": "8.6.1", "verified": "8.6.1"}}]
assert manifest["url"] == repository
assert manifest["manifest"] == "https://raw.githubusercontent.com/tcabanski/pf2e-party-quick-sell/main/module.json"
assert manifest["download"] == f"{repository}/releases/download/v{version}/module.zip"
assert manifest["socket"] is True
assert not manifest.get("dependencies"), "No runtime dependencies allowed"
tag = os.environ.get("RELEASE_TAG")
if tag:
    assert tag == f"v{version}", f"Tag {tag} does not match manifest {version}"
files = [ROOT / name for name in ["module.json", "README.md", "LICENSE"]]
files += sorted((ROOT / "scripts").glob("*.js"))
files += sorted((ROOT / "docs").glob("*.md"))
files += sorted((ROOT / "docs").glob("*.json"))
for name in manifest["esmodules"]:
    assert ROOT / name in files and (ROOT / name).is_file(), f"Missing entry point {name}"
assert all(path.is_file() and not path.is_symlink() for path in files)
dist = ROOT / "dist"
dist.mkdir(exist_ok=True)
(dist / "module.json").write_text(json.dumps(manifest, indent=2) + "\n")
with zipfile.ZipFile(dist / "module.zip", "w", zipfile.ZIP_DEFLATED) as archive:
    for path in files:
        # A single module directory is accepted by Foundry's package installer.
        archive.write(path, f"{module_id}/{path.relative_to(ROOT).as_posix()}")
with zipfile.ZipFile(dist / "module.zip") as archive:
    assert archive.testzip() is None
    assert json.loads(archive.read(f"{module_id}/module.json")) == manifest
    assert all(name.startswith(module_id + "/") and ".." not in name.split("/") for name in archive.namelist())
print(f"Validated {module_id} {version}; built {dist / 'module.zip'} ({len(files)} files)")
