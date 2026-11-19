"""Check exact HTTPS app bytes against the local build receipt; never deploys."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import sys
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from presentation_build import verify

class SameOriginHTTPS(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        before, after = urllib.parse.urlsplit(req.full_url), urllib.parse.urlsplit(newurl)
        if after.scheme != "https" or after.netloc != before.netloc:
            raise ValueError("Refusing non-HTTPS or cross-origin redirect")
        return super().redirect_request(req, fp, code, msg, headers, newurl)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base_url")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit("Choose a new output path; existing evidence is preserved")
    parsed = urllib.parse.urlsplit(args.base_url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise SystemExit("Provide an HTTPS base URL without credentials, query, or fragment")
    build = verify()
    result = {
        "recorded_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "base_url": args.base_url, "ui_build": build["id"],
        "snapshot_id": build["snapshot_id"], "files": [],
        "scope": "Exact HTTPS bytes only; browser, workflow source and physical-device checks are separate"
    }
    base = args.base_url.rstrip("/") + "/"
    opener = urllib.request.build_opener(SameOriginHTTPS())
    files = {"build.json": hashlib.sha256((ROOT / "app/build.json").read_bytes()).hexdigest(), **build["sha256"]}
    for name, expected in files.items():
        url = base + urllib.parse.quote(name, safe="/")
        request = urllib.request.Request(url, headers={"Cache-Control": "no-cache", "User-Agent": "Xylem-release-verifier"})
        try:
            with opener.open(request, timeout=20) as response:
                content = response.read()
                actual = hashlib.sha256(content).hexdigest()
                if response.status != 200 or actual != expected:
                    raise ValueError("HTTP status or exact file hash differs")
                result["files"].append({"file": name, "status": "PASS", "sha256": actual, "bytes": len(content)})
        except Exception as error:
            result["files"].append({"file": name, "status": "FAIL", "error": str(error)})
            break
    result["status"] = "PASS" if len(result["files"]) == len(files) and all(f["status"] == "PASS" for f in result["files"]) else "FAIL"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + chr(10), encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0 if result["status"] == "PASS" else 1

if __name__ == "__main__":
    raise SystemExit(main())
