// Drag-configuration check: StartMoving()/StopMovingOrSizing() are no-ops unless the
// frame is declared movable (FrameXML always pairs `movable="true"` with
// registerForDrag, e.g. Blizzard_MovePad.xml). A left-dragged button must therefore get
// SetMovable(true) in frame setup, before its OnDragStart handler is wired. This check
// parses QuickBinds/*.lua and fails if a file calls :StartMoving() without that, so an
// edit dropping SetMovable(true) — the v0.1.0 bug that made dragging do nothing — fails
// the build. Run: node tools/check-drag.mjs
//
// v0.1.4 adds the ring rule: the button centre may only sit on the circle around the
// minimap, so the drag path has to turn the dragged position into an angle, rebuild the
// point from that angle (exactly one `math.cos`/`math.sin` helper) and persist the angle
// in QuickBindsDB.minimapButton instead of the free x/y pair v0.1.1 stored.
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

// Collect every CallExpression anywhere in the AST.
function* calls(node) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) yield* calls(n);
    return;
  }
  if (node.type === "CallExpression") yield node;
  for (const key of Object.keys(node)) {
    if (key !== "range") yield* calls(node[key]);
  }
}

// `receiver:name(...)` — the method-call form every frame API uses.
function methodName(call) {
  const base = call.base;
  return base && base.type === "MemberExpression" && base.identifier
    ? base.identifier.name
    : null;
}

// The text of a StringLiteral: luaparse 0.3.1 leaves .value null; the spelling is .raw.
function stringText(node) {
  if (!node || node.type !== "StringLiteral") return null;
  if (typeof node.value === "string") return node.value;
  return typeof node.raw === "string" ? node.raw.slice(1, -1) : null;
}

function isStringArg(node, value) {
  return stringText(node) === value;
}

function isTrueArg(node) {
  return !!node && node.type === "BooleanLiteral" && node.value === true;
}

// Dotted spelling of a reference: `math.cos`, `button:SetMovable` → "button.SetMovable",
// `QuickBindsDB.minimapButton`; null when the target cannot be named.
function dotted(node) {
  if (!node || typeof node !== "object") return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && node.identifier) {
    const base = dotted(node.base);
    return base ? `${base}.${node.identifier.name}` : null;
  }
  return null;
}

// Function definitions by name — `local function N()`, `function N()`, `T.N = function()`
// and `SetScript("OnDragStop", function() ... end)` keyed by the event name — enough to
// walk a file's own call graph.
function definitionsIn(node, out = new Map()) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) definitionsIn(child, out);
    return out;
  }
  if (node.type === "FunctionDeclaration" && node.identifier) {
    const name = dotted(node.identifier);
    if (name && !out.has(name)) out.set(name, node);
  } else if (node.type === "CallExpression" && methodName(node) === "SetScript") {
    const args = node.arguments || [];
    const event = stringText(args[0]);
    const handler = args.find((arg) => arg && arg.type === "FunctionDeclaration");
    if (event && handler && !out.has(event)) out.set(event, handler);
  }
  for (const key of Object.keys(node)) {
    if (key !== "range") definitionsIn(node[key], out);
  }
  return out;
}

// Names a body calls, fully (`self.StopMovingOrSizing`) and short (`StopMovingOrSizing`),
// so `math.cos(angle)` answers to both "math.cos" and "cos".
function* callNamesIn(fn) {
  for (const call of calls(fn)) {
    const full = dotted(call.base);
    if (!full) continue;
    const parts = full.split(".");
    for (let i = 0; i < parts.length; i++) yield parts.slice(i).join(".");
  }
}

// Every name a handler reaches through this file's function bodies (transitive,
// cycle-safe): for OnDragStop that is the whole save path, wherever it lives.
function reachableFrom(handler, defs) {
  const names = new Set();
  const seen = new Set([handler]);
  const queue = [...callNamesIn(handler)];
  while (queue.length > 0) {
    const name = queue.pop();
    names.add(name);
    const target = defs.get(name);
    if (target && !seen.has(target)) {
      seen.add(target);
      queue.push(...callNamesIn(target));
    }
  }
  return names;
}

// Field names of every table assigned to `QuickBindsDB.minimapButton` in the file
// (`{ angle = a }` → "angle"); clearing it with nil writes no fields.
function* savedFields(node) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) yield* savedFields(child);
    return;
  }
  if (node.type === "AssignmentStatement") {
    for (const target of node.variables || []) {
      if (!/\.minimapButton$/.test(dotted(target) || "")) continue;
      for (const init of node.init || []) {
        if (init.type === "TableConstructorExpression") {
          for (const field of init.fields || []) {
            if (field.type === "TableKeyString" && field.key) yield field.key.name;
          }
        }
      }
    }
  }
  for (const key of Object.keys(node)) {
    if (key !== "range") yield* savedFields(node[key]);
  }
}

let failed = false;
for (const file of files) {
  const source = readFileSync(join(addonDir, file), "utf8");
  const lineOf = (offset) => source.slice(0, offset).split("\n").length;
  let ast;
  try {
    ast = luaparse.parse(source, { luaVersion: "5.1", ranges: true });
  } catch (err) {
    failed = true;
    console.error(`FAIL QuickBinds/${file}: unparseable (${err.message})`);
    continue;
  }

  const movable = []; // SetMovable(true)
  const dragStart = []; // SetScript("OnDragStart", ...)
  const startMoving = []; // StartMoving()
  for (const call of calls(ast)) {
    const name = methodName(call);
    const line = lineOf(call.range[0]);
    if (name === "SetMovable" && call.arguments.length === 1 && isTrueArg(call.arguments[0])) {
      movable.push(line);
    } else if (name === "SetScript" && isStringArg(call.arguments[0], "OnDragStart")) {
      dragStart.push(line);
    } else if (name === "StartMoving") {
      startMoving.push(line);
    }
  }

  if (startMoving.length === 0) {
    console.log(`OK   QuickBinds/${file}: no StartMoving calls`);
    continue;
  }
  if (movable.length === 0) {
    failed = true;
    console.error(
      `FAIL QuickBinds/${file}: StartMoving() at line(s) ${startMoving.join(", ")} but the ` +
        "frame is never declared movable — add <frame>:SetMovable(true) in frame setup",
    );
    continue;
  }
  const declaredBefore =
    dragStart.length === 0
      ? Math.min(...movable) < Math.min(...startMoving)
      : Math.min(...movable) < Math.min(...dragStart);
  if (!declaredBefore) {
    failed = true;
    console.error(
      `FAIL QuickBinds/${file}: SetMovable(true) (line ${Math.min(...movable)}) must run in ` +
        `frame setup, before OnDragStart is wired (line ${Math.min(...dragStart)})`,
    );
    continue;
  }
  console.log(
    `OK   QuickBinds/${file}: SetMovable(true) line ${Math.min(...movable)} precedes ` +
      `StartMoving line ${Math.min(...startMoving)}`,
  );

  // The ring rule: the position a drag leaves behind is rebuilt from an angle by that
  // helper, and the saved record holds the angle instead of free coordinates.
  const defs = definitionsIn(ast);
  const dragStop = defs.get("OnDragStop");
  const helpers = [...defs].filter(([, fn]) => {
    const called = new Set(callNamesIn(fn));
    return called.has("math.cos") && called.has("math.sin");
  });

  if (!dragStop) {
    failed = true;
    console.error(
      `FAIL QuickBinds/${file}: StartMoving() with no OnDragStop handler — drag-stop is ` +
        "where the ring position is applied and saved",
    );
  } else if (helpers.length !== 1) {
    failed = true;
    console.error(
      `FAIL QuickBinds/${file}: ${helpers.length} function(s) turn an angle into a point ` +
        "(calling both math.cos and math.sin) — the ring needs exactly one",
    );
  } else {
    const helperName = helpers[0][0];
    const saved = new Set(savedFields(ast));
    if (!reachableFrom(dragStop, defs).has(helperName)) {
      failed = true;
      console.error(
        `FAIL QuickBinds/${file}: OnDragStop never reaches ${helperName}() — the position ` +
          "must come from the ring point at the dragged angle, not the raw GetCenter()",
      );
    } else if (!saved.has("angle")) {
      failed = true;
      console.error(
        `FAIL QuickBinds/${file}: QuickBindsDB.minimapButton saves ` +
          `${[...saved].join(", ") || "nothing"} instead of an angle — free x/y lets the ` +
          "button rest off the ring",
      );
    } else if (saved.has("x") || saved.has("y")) {
      failed = true;
      console.error(
        `FAIL QuickBinds/${file}: QuickBindsDB.minimapButton still saves ` +
          `${[...saved].join(", ")} alongside the angle — only the angle belongs in it`,
      );
    } else {
      console.log(
        `OK   QuickBinds/${file}: OnDragStop positions through ${helperName}(), ` +
          "QuickBindsDB.minimapButton saves the angle",
      );
    }
  }
}

if (failed) {
  console.error(`check-drag: ${files.length} file(s) checked, failures above`);
  process.exit(1);
}
console.log(
  `check-drag: ${files.length} file(s) checked, dragged frames declared movable and ` +
    "pinned to the minimap ring",
);
