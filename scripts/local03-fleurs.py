"""Fetch only 30 WAV members per authorized public FLEURS test split.

Standard library only. Streaming tar stops after the fixed first 30 regular WAV
members; no complete archive, model, user recording or credential is read.
"""
import csv
import hashlib
import io
import json
import pathlib
import math
import struct
import sys
import tarfile
import urllib.request

REVISION = "70bb2e84b976b7e960aa89f1c648e09c59f894dd"
BASE = "https://huggingface.co/datasets/google/fleurs/resolve/" + REVISION + "/"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def pcm16(audio):
    if audio[:4] != b"RIFF" or audio[8:12] != b"WAVE":
        raise RuntimeError("Not a complete WAV")
    chunks = {}
    offset = 12
    while offset + 8 <= len(audio):
        kind, size = struct.unpack_from("<4sI", audio, offset)
        chunks[kind] = audio[offset + 8:offset + 8 + size]
        offset += 8 + size + (size & 1)
    fmt = chunks[b"fmt "]
    format_id, channels, rate = struct.unpack_from("<HHI", fmt)
    bits = struct.unpack_from("<H", fmt, 14)[0]
    if channels != 1 or rate != 16000:
        raise RuntimeError("Only original mono 16 kHz public WAV allowed")
    data = chunks[b"data"]
    if format_id == 1 and bits == 16:
        return data, "PCM16"
    if format_id != 3 or bits != 32:
        raise RuntimeError("Unexpected original WAV sample encoding")
    converted = bytearray()
    for (sample,) in struct.iter_unpack("<f", data):
        if not math.isfinite(sample):
            raise RuntimeError("Non-finite original audio")
        value = max(-1.0, min(1.0, sample))
        quantized = math.floor(value * (32768 if value < 0 else 32767) + 0.5)
        converted.extend(struct.pack("<h", quantized))
    return bytes(converted), "float32 converted to PCM16 by the product clamp/scale/Math.round rule; no resampling"


def main():
    root = pathlib.Path(sys.argv[1]).resolve()
    root.mkdir(parents=True, exist_ok=True)
    manifest = {
        "dataset": "google/fleurs", "revision": REVISION,
        "license": "CC-BY-4.0", "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "datasetUrl": "https://huggingface.co/datasets/google/fleurs/tree/" + REVISION,
        "selection": "First 30 regular WAV archive members in each pinned test.tar.gz, archive order; no cherry-picking",
        "limitPerLanguage": 30, "samples": [], "sources": [],
    }
    card = urllib.request.urlopen(BASE + "README.md", timeout=60).read()
    (root / "FLEURS-README.md").write_bytes(card)
    manifest["cardSha256"] = digest(card)
    for language in ("cmn_hans_cn", "en_us"):
        folder = root / language
        folder.mkdir(exist_ok=True)
        tsv_path = "data/" + language + "/test.tsv"
        tsv = urllib.request.urlopen(BASE + tsv_path, timeout=60).read()
        (folder / "test.tsv").write_bytes(tsv)
        rows = {row[1]: row for row in csv.reader(io.StringIO(tsv.decode("utf-8")), delimiter="\t") if row}
        archive_path = "data/" + language + "/audio/test.tar.gz"
        with urllib.request.urlopen(BASE + archive_path, timeout=90) as response:
            source = {"language": language, "split": "test", "tsvUrl": BASE + tsv_path,
                      "tsvSha256": digest(tsv), "archiveUrl": BASE + archive_path,
                      "archiveEtag": response.headers.get("ETag"),
                      "archiveFullContentDownloaded": False}
            manifest["sources"].append(source)
            consumed = [0]
            original_read = response.read
            def read(size=-1):
                data = original_read(size)
                consumed[0] += len(data)
                if consumed[0] > 64 * 1024 * 1024:
                    raise RuntimeError("Public subset exceeds its bounded download budget")
                return data
            response.read = read
            count = 0
            with tarfile.open(fileobj=response, mode="r|gz") as archive:
                for member in archive:
                    if not member.isfile() or not member.name.lower().endswith(".wav"):
                        continue
                    name = pathlib.PurePosixPath(member.name).name
                    if name not in rows:
                        raise RuntimeError("Archive member is missing from pinned transcription TSV")
                    if member.size > 8 * 1024 * 1024:
                        raise RuntimeError("Unexpectedly large public clip")
                    audio = archive.extractfile(member).read()
                    pcm, conversion = pcm16(audio)
                    frames = len(pcm) // 2
                    if not (160 <= frames <= 960000):
                        raise RuntimeError("Public clip exceeds the existing product duration limit")
                    (folder / name).write_bytes(audio)
                    (folder / (name + ".pcm")).write_bytes(pcm)
                    row = rows[name]
                    manifest["samples"].append({"language": language, "split": "test", "archiveIndex": count,
                        "id": row[0], "file": language + "/" + name, "frames": frames,
                        "durationMs": frames / 16, "sha256": digest(audio), "pcmSha256": digest(pcm), "conversion": conversion,
                        "rawTranscription": row[2], "transcription": row[3], "gender": row[6]})
                    count += 1
                    if count == 30:
                        break
            if count != 30:
                raise RuntimeError("Incomplete public test subset")
            source["archiveBytesConsumed"] = consumed[0]
            source["originalArchiveContentLength"] = response.headers.get("Content-Length")
        print(json.dumps({"downloaded": language, "clips": count}), flush=True)
    (root / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"status": "passed", "clips": len(manifest["samples"]), "manifest": str(root / "manifest.json")}))


if __name__ == "__main__":
    main()
