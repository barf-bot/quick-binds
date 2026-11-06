// Lua syntax check for the QuickBinds addon sources.
// WoW runs Lua 5.1 (+ Blizzard extensions); luaparse in the 5.1 dialect catches
// every plain-Lua syntax error we could ship. Run: node tools/check-lua.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import luaparse from "luaparse";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const addonDir = join(root, "QuickBinds");

if (!existsSync(addonDir)) {
  console.error("FAIL: QuickBinds/ directory not found");
  process.exit(1);
}

const files = readdirSync(addonDir).filter((f) => f.endsWith(".lua")).sort();
if (files.length === 0) {
  console.error("FAIL: no .lua files found in QuickBinds/");
  process.exit(1);
}

let failed = false;
for (const file of files) {
  const source = readFileSync(join(addonDir, file), "utf8");
  try {
    luaparse.parse(source, { luaVersion: "5.1" });
    console.log(`OK   QuickBinds/${file}`);
  } catch (err) {
    failed = true;
    console.error(`FAIL QuickBinds/${file}: ${err.message}`);
  }
}

if (failed) {
  console.error(`check-lua: ${files.length} file(s) checked, failures above`);
  process.exit(1);
}
console.log(`check-lua: ${files.length} file(s) parse clean (Lua 5.1)`);
