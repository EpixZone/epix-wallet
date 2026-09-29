import fs from "fs";
import path from "path";

// A private, exclusive directory prevents symlink attacks. Keeping it beside
// the destination also makes rename atomic when /tmp is on another filesystem.
export function writeFileAtomic(outputPath, contents) {
  const tempDir = fs.mkdtempSync(
    path.join(path.dirname(outputPath), ".sync-tokens-")
  );
  try {
    const tempPath = path.join(tempDir, "output");
    fs.writeFileSync(tempPath, contents, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    fs.renameSync(tempPath, outputPath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export function iconFilePath(componentsDir, name) {
  if (
    typeof name !== "string" ||
    name.trim() !== name ||
    !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)
  ) {
    throw new Error("Invalid icon name");
  }
  const outputPath = path.resolve(componentsDir, `${name}-icon.tsx`);
  if (path.dirname(outputPath) !== path.resolve(componentsDir)) {
    throw new Error("Icon path escapes the components directory");
  }
  return outputPath;
}
