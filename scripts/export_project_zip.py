"""Export the current workspace without rewriting app or build configuration."""

import hashlib
import json
import pathlib
import subprocess
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "generated-artifacts/BellCraft-Latest-Source.zip"
PREFIX = "BellCraft/"
EXCLUDED_DIRS = {
    ".git", ".local", ".cache", ".config", ".gradle", ".idea",
    "node_modules", "dist", "build", "out", "coverage", ".expo",
    ".expo-shared", ".vite", ".pnpm-store", "Pods", "DerivedData",
    "xcuserdata", "attached_assets", "generated-artifacts",
}
EXCLUDED_SUFFIXES = {
    ".zip", ".apk", ".aab", ".log", ".tsbuildinfo",
    ".jks", ".keystore", ".p12", ".pfx", ".pem", ".key",
}
EXCLUDED_NAMES = {
    ".DS_Store", "Thumbs.db", "local.properties", "agent_assets_metadata.toml",
}
GENERATED_PREFIXES = (
    "artifacts/bellcraft/android/app/src/main/assets/",
    "artifacts/bellcraft/android/capacitor-cordova-android-plugins/",
    "artifacts/bellcraft/ios/App/App/public/",
    "artifacts/bellcraft/ios/capacitor-cordova-ios-plugins/",
)


def include(relative: pathlib.PurePosixPath) -> bool:
    return not (
        set(relative.parts) & EXCLUDED_DIRS
        or relative.suffix.lower() in EXCLUDED_SUFFIXES
        or relative.name in EXCLUDED_NAMES
        or relative.name == ".env"
        or relative.name.startswith(".env.")
        or relative.name in {"capacitor.plugins.json"}
        or relative.as_posix().startswith(GENERATED_PREFIXES)
    )


def main() -> None:
    candidates = subprocess.check_output(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=ROOT,
    ).decode().split("\0")
    paths = sorted({
        pathlib.PurePosixPath(name) for name in candidates
        if name and include(pathlib.PurePosixPath(name))
    })
    required = {
        "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml",
        "tsconfig.base.json", ".github/workflows/build-apk.yml",
        "artifacts/bellcraft/package.json",
        "artifacts/bellcraft/capacitor.config.ts",
        "artifacts/bellcraft/vite.config.ts",
        "artifacts/bellcraft/android/gradlew",
        "artifacts/bellcraft/android/gradle/wrapper/gradle-wrapper.jar",
        "artifacts/bellcraft/android/app/build.gradle",
        "artifacts/bellcraft/android/app/src/main/AndroidManifest.xml",
        "artifacts/bellcraft/android/app/src/main/java/com/bellcraft/app/BellSchedulerPlugin.java",
        "artifacts/bellcraft/android/app/src/main/java/com/bellcraft/app/BellAlarmReceiver.java",
        "artifacts/bellcraft/android/app/src/main/java/com/bellcraft/app/BellBootReceiver.java",
        "artifacts/bellcraft/src/hooks/use-capacitor-bell-scheduler.ts",
    }
    assert required <= {str(path) for path in paths}, "Required source files missing"
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    source_hashes = {}
    with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED) as archive:
        for relative in paths:
            source = ROOT / relative
            if source.is_symlink():
                raise RuntimeError(f"Refusing to export symlink: {relative}")
            if not source.is_file():
                raise RuntimeError(f"Source file missing: {relative}")
            content = source.read_bytes()
            source_hashes[str(relative)] = hashlib.sha256(content).hexdigest()
            archive.write(source, PREFIX + str(relative))
    with zipfile.ZipFile(OUTPUT) as archive:
        assert archive.testzip() is None, "ZIP CRC check failed"
        assert len(archive.namelist()) == len(source_hashes), "ZIP entry count differs"
        for relative, expected in source_hashes.items():
            exported = hashlib.sha256(archive.read(PREFIX + relative)).hexdigest()
            assert exported == expected, f"ZIP differs from source: {relative}"
            assert hashlib.sha256((ROOT / relative).read_bytes()).hexdigest() == expected, (
                f"Source changed during export: {relative}"
            )
        for directory in ("src", "public", "android"):
            assert any(name.startswith(PREFIX + f"artifacts/bellcraft/{directory}/")
                       for name in archive.namelist()), f"Missing {directory}"
    report = {
        "archive": OUTPUT.name,
        "files": len(source_hashes),
        "bytes": OUTPUT.stat().st_size,
        "sha256": hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
        "verification": "CRC and every exported file match the current source",
        "file_sha256": source_hashes,
    }
    (OUTPUT.parent / "BellCraft-Latest-Source.manifest.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    )
    print(f"RESULT: ALL CHECKS PASSED\nFiles: {report['files']}")
    print(f"ZIP: {OUTPUT.relative_to(ROOT)} ({report['bytes'] / 1048576:.2f} MiB)")
    print(f"SHA256: {report['sha256']}")


if __name__ == "__main__":
    main()
