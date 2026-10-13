"""Anonymous verification of published manifest and Foundry archive."""
import io
import json
import sys
import time
import urllib.request
import zipfile

OWNER = "tcabanski"
ID = "pf2e-party-quick-sell"
tag = sys.argv[1]
version = tag.removeprefix("v")
base = f"https://github.com/{OWNER}/{ID}/releases/download/{tag}"
stable = f"https://raw.githubusercontent.com/{OWNER}/{ID}/main/module.json"


def fetch(url):
    # Bounded retries for GitHub asset/CDN propagation. No authentication.
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": ID}), timeout=60) as response:
                assert response.status == 200
                return response.read()
        except Exception:
            if attempt == 4:
                raise
            time.sleep(3)


manifest = json.loads(fetch(base + "/module.json"))
assert manifest["id"] == ID and manifest["version"] == version
assert manifest["compatibility"] == {"minimum": "14.361", "verified": "14.369", "maximum": "14"}
assert manifest["relationships"]["systems"][0]["id"] == "pf2e"
assert manifest["relationships"]["systems"][0]["compatibility"]["minimum"] == "8.6.1"
assert manifest["download"] == base + "/module.zip"
assert manifest["manifest"] == stable
update_manifest = json.loads(fetch(stable))
# main may already advertise a newer version; it must remain a valid update source.
assert update_manifest["id"] == ID and update_manifest["manifest"] == stable
with zipfile.ZipFile(io.BytesIO(fetch(manifest["download"]))) as archive:
    assert archive.testzip() is None
    names = archive.namelist()
    assert all(name.startswith(ID + "/") and ".." not in name.split("/") for name in names)
    installed = json.loads(archive.read(ID + "/module.json"))
    assert installed == manifest
    for entry in manifest["esmodules"]:
        assert ID + "/" + entry in names
    assert ID + "/README.md" in names and ID + "/LICENSE" in names
print(json.dumps({"tag": tag, "version": version, "anonymous_manifest": True,
                  "anonymous_zip": True, "archive_files": len(names), "installed_version": installed["version"],
                  "update_manifest": stable, "advertised_version": update_manifest["version"]}, indent=2))
