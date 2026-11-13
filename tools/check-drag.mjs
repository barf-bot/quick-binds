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
//
// v0.1.6 adds the frame-construction rules the client's v0.1.5 report taught: the
// button's parent, its frame level and stratum, when the level is re-applied, and its
// size (see the v0.1.6 section below for the FrameXML evidence behind each one).
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

// --- v0.1.6: the button's parent, level and size -----------------------------------
//
// Why the v0.1.5 raise did nothing in-game: the round bronze ring is
// `MinimapCompassTexture` (`atlas="ui-hud-minimap-frame"`) on the frame
// `MinimapBackdrop` (Blizzard_Minimap/Mainline/Minimap.xml:219-238) — the 175x16
// `BorderTop` that comment cited is Minimap.xml:18-25, a header plate, not the ring —
// and a frame parented to `Minimap` cannot outrank that art by frame level alone,
// because levels only rank frames inside one stratum. Blizzard's own over-the-border
// ornament (`InstanceDifficulty`) is a child of `MinimapCluster`, raised with
// `local raisedFrameLevel = self:GetFrameLevel() + 10;`
// `self.InstanceDifficulty:SetFrameLevel(raisedFrameLevel)`
// (MinimapClusterMixin:OnLoad, Blizzard_Minimap/Mainline/Minimap.lua:373-374), so the
// button has to join that parent, copy that stratum and re-apply that level on
// `PLAYER_ENTERING_WORLD` and `UI_SCALE_CHANGED` — the client restamps cluster levels
// after `ADDON_LOADED`, so a level set only at creation is not enough.
//
// The size rule is the other half of the same report: the two neighbouring addon
// buttons measure 27 px on the player's ~1.1 UI-scale screen (their 198-unit `Minimap`
// frame renders as the 215 px terrain circle), so 24 units — 0.75× the 32-unit frame
// v0.1.4 and v0.1.5 shipped with.
//
// Every rule below reads the AST and compares normalized spellings, so a reformat
// cannot hide a change and `SIZE` still has to resolve to the number the rule names.

const BUTTON_FRAME_NAME = "QuickBindsMinimapButton";
const BUTTON_SIZE_UNITS = 24;
const RAISE_LEVEL = 10;
const RAISE_EVENTS = ["PLAYER_ENTERING_WORLD", "UI_SCALE_CHANGED"];
const CLUSTER_PARENT = "MinimapCluster or Minimap";

// A node's exact source text, or null when it carries no range.
function rawText(source, node) {
  if (!node || typeof node !== "object" || !node.range) return null;
  return source.slice(node.range[0], node.range[1]);
}

// The same text with whitespace and parentheses dropped: `parent`,
// `(MinimapCluster or Minimap)` and any re-wrapping of one expression compare equal.
function norm(text) {
  return text.replace(/[\s()]/gu, "");
}

function normalized(source, node) {
  const raw = rawText(source, node);
  return raw === null ? null : norm(raw);
}

// `x = expr` and `local x = expr` anywhere in the file: name → every node ever assigned
// to it (all of them, so a moved or renamed intermediate still resolves).
function assignmentMap(node, out = new Map()) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) assignmentMap(child, out);
    return out;
  }
  if (node.type === "LocalStatement" || node.type === "AssignmentStatement") {
    const inits = node.init ?? node.expressions ?? [];
    for (const variable of node.variables ?? node.nodes ?? []) {
      if (!variable || variable.type !== "Identifier") continue;
      const list = out.get(variable.name) ?? [];
      out.set(variable.name, list);
      for (const init of inits) list.push(init);
    }
  }
  for (const key of Object.keys(node)) {
    if (key !== "range" && key !== "loc") assignmentMap(node[key], out);
  }
  return out;
}

// Every spelling an expression can have in this file: its own text plus, for an
// identifier, the text of everything assigned to it (`SIZE` → `24`, `parent` →
// `MinimapCluster or Minimap`); for a member expression the receiver's spellings with
// the member kept (`parent:GetFrameStrata()` → `MinimapCluster or
// Minimap:GetFrameStrata()`); for a call or an operator the same expansion one level
// down. Cycle-safe through `seen`.
function spellings(source, assigns, node, seen = new Set()) {
  const out = new Set();
  const own = normalized(source, node);
  if (own === null) return out;
  out.add(own);
  if (node.type === "Identifier") {
    if (seen.has(node.name)) return out;
    const next = new Set(seen);
    next.add(node.name);
    for (const init of assigns.get(node.name) ?? []) {
      for (const spelling of spellings(source, assigns, init, next)) out.add(spelling);
    }
    return out;
  }
  if (node.type === "MemberExpression" && node.identifier) {
    const member = node.identifier.name;
    for (const base of spellings(source, assigns, node.base, seen)) {
      out.add(norm(`${base}:${member}`));
      out.add(norm(`${base}.${member}`));
    }
    return out;
  }
  if (node.type === "CallExpression") {
    for (const base of spellings(source, assigns, node.base, seen)) out.add(`${base}()`);
    return out;
  }
  if ((node.type === "BinaryExpression" || node.type === "LogicalExpression") && node.operator) {
    for (const left of spellings(source, assigns, node.left, seen)) {
      for (const right of spellings(source, assigns, node.right, seen)) {
        out.add(norm(`${left} ${node.operator} ${right}`));
      }
    }
  }
  return out;
}

// The frames the file stores in a variable: `button = CreateFrame("Button",
// "QuickBindsMinimapButton", parent)` → { name, frameType, parent }.
function frameSetups(assigns) {
  const out = [];
  for (const [name, inits] of assigns) {
    for (const init of inits) {
      if (!init || init.type !== "CallExpression" || dotted(init.base) !== "CreateFrame") {
        continue;
      }
      const args = init.arguments ?? [];
      if (stringText(args[1]) !== BUTTON_FRAME_NAME) continue;
      out.push({ name, frameType: stringText(args[0]), parent: args[2] });
    }
  }
  return out;
}

// Every call written as `name:method(...)`, the spellings of each of a call's
// arguments (one Set per argument), and the printable form of a Set — `SIZE/24` for the
// local v0.1.6 names — used verbatim in the failure messages.
function callsOn(allCalls, name, method) {
  return allCalls.filter((call) => dotted(call.base) === `${name}.${method}`);
}

function argSpellingSets(source, assigns, call) {
  return (call.arguments ?? []).map((arg) => spellings(source, assigns, arg));
}

function firstArgSpells(source, assigns, call) {
  return argSpellingSets(source, assigns, call)[0] ?? new Set();
}

function spellingText(spells) {
  return [...spells].join("/");
}

// The string literals an expression holds (`event == "UI_SCALE_CHANGED"`).
function* stringLiterals(node) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) yield* stringLiterals(child);
    return;
  }
  const text = stringText(node);
  if (text !== null) yield text;
  for (const key of Object.keys(node)) {
    if (key !== "range" && key !== "loc") yield* stringLiterals(node[key]);
  }
}

// Every if/elseif clause in the file (luaparse 0.3.1 groups them into
// IfStatement.clauses) — the same inspection check-apis.mjs does for
// `if SettingsPanel and SettingsPanel:IsShown()`.
function clauseBodies(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) clauseBodies(child, out);
    return out;
  }
  if (node.type === "IfStatement") {
    for (const clause of node.clauses ?? [{ condition: node.condition, body: node.body }]) {
      if (clause && clause.body) out.push(clause);
    }
  }
  for (const key of Object.keys(node)) {
    if (key !== "range" && key !== "loc") clauseBodies(node[key], out);
  }
  return out;
}

// event → every name the bodies that test that event can reach: `elseif event ==
// "UI_SCALE_CHANGED" then RaiseAboveBorder() end` answers for UI_SCALE_CHANGED.
function eventsHandled(ast, defs) {
  const out = new Map();
  for (const clause of clauseBodies(ast)) {
    for (const event of stringLiterals(clause.condition ?? {})) {
      const reached = out.get(event) ?? new Set();
      out.set(event, reached);
      for (const name of reachableFrom(clause, defs)) reached.add(name);
    }
  }
  return out;
}

// The v0.1.6 rules for the file that builds the button; other files (Core.lua)
// contribute nothing. Each rule prints its own line, so one breakage per mutation.
function checkFrameSetup(file, source, ast, defs) {
  const assigns = assignmentMap(ast);
  const frames = frameSetups(assigns);
  if (frames.length === 0) return [];

  const allCalls = [...calls(ast)];
  const registeredEvents = new Set(
    allCalls
      .filter((call) => methodName(call) === "RegisterEvent")
      .flatMap((call) => (call.arguments ?? []).map((arg) => stringText(arg)))
      .filter(Boolean),
  );
  const handled = eventsHandled(ast, defs);
  const lines = [];
  const say = (ok, message) =>
    lines.push(`${ok ? "OK   " : "FAIL "}QuickBinds/${file}: ${message}`);

  for (const frame of frames) {
    const parentSpells = spellings(source, assigns, frame.parent);
    const parentText = rawText(source, frame.parent) ?? "nothing";
    const parentOk = parentSpells.has(norm(CLUSTER_PARENT));
    const parentLevel = `\`${parentText}:GetFrameLevel() + ${RAISE_LEVEL}\``;
    // What the frame is really parented to: the argument's own text, or, when the code
    // names a local, the value the file assigns it (`parent` → `Minimap`).
    const aliased = [...parentSpells].filter((spelling) => spelling !== norm(parentText));
    const parentShown = parentOk || aliased.length === 0 ? parentText : aliased.join(" | ");

    say(
      frame.frameType === "Button",
      frame.frameType === "Button"
        ? `${frame.name} is created as a Button named ${BUTTON_FRAME_NAME}`
        : `the frame named ${BUTTON_FRAME_NAME} is a ${frame.frameType ?? "frame with no type"}, ` +
          "not a Button",
    );

    say(
      parentOk,
      parentOk
        ? `${frame.name} is parented to \`${parentText}\` — MinimapCluster with the Minimap ` +
          "fallback, the frame the ring art belongs to"
        : `${frame.name} is parented to \`${parentShown}\`, not \`${CLUSTER_PARENT}\` — a ` +
          "child of Minimap renders under MinimapCompassTexture whatever level it sets",
    );

    const wantedLevel = new Set(
      [...parentSpells].map((p) => norm(`${p}:GetFrameLevel() + ${RAISE_LEVEL}`)),
    );
    const levelSets = callsOn(allCalls, frame.name, "SetFrameLevel").map((call) =>
      firstArgSpells(source, assigns, call),
    );
    const levelOk = levelSets.some((set) => [...set].some((spelling) => wantedLevel.has(spelling)));
    say(
      levelOk,
      levelOk
        ? `${frame.name}:SetFrameLevel(...) is the parent-derived ${parentLevel} raise — ` +
          "Blizzard's own recipe for clearing the cluster's border art"
        : levelSets.length === 0
          ? `${frame.name} never calls SetFrameLevel — the frame needs ${parentLevel} to sit ` +
            "above the ring art"
          : `${frame.name}:SetFrameLevel(${levelSets.map((set) => spellingText(set)).join(", ")}) ` +
            `is not ${parentLevel}: a level only ranks frames inside the stratum the border ` +
            "art is drawn in",
    );

    const wantedStrata = new Set([...parentSpells].map((p) => norm(`${p}:GetFrameStrata()`)));
    const strataSets = callsOn(allCalls, frame.name, "SetFrameStrata").map((call) =>
      firstArgSpells(source, assigns, call),
    );
    const strataOk = strataSets.some((set) => [...set].some((spelling) => wantedStrata.has(spelling)));
    say(
      strataOk,
      strataOk
        ? `${frame.name}:SetFrameStrata(...) copies \`${parentText}:GetFrameStrata()\`, so the ` +
          "level is compared in the same stratum as the border art"
        : strataSets.length === 0
          ? `${frame.name} never calls SetFrameStrata — a level only ranks frames inside one ` +
            "stratum, so the frame has to join the parent's"
          : `${frame.name}:SetFrameStrata(${strataSets.map((set) => spellingText(set)).join(", ")}) ` +
            `is not the parent's own stratum (\`${parentText}:GetFrameStrata()\`)`,
    );

    const sizeSets = callsOn(allCalls, frame.name, "SetSize").map((call) =>
      argSpellingSets(source, assigns, call),
    );
    const sizeOk = sizeSets.some(
      (args) =>
        args.length === 2 &&
        args.every((set) => set.has(String(BUTTON_SIZE_UNITS))),
    );
    say(
      sizeOk,
      sizeOk
        ? `${frame.name}:SetSize(...) measures ${BUTTON_SIZE_UNITS} units — the 27 px the ` +
          "neighbouring buttons render at the reported ~1.1 UI scale"
        : sizeSets.length === 0
          ? `${frame.name} never calls SetSize, so the frame keeps the client default instead ` +
            `of the measured ${BUTTON_SIZE_UNITS} units`
          : `${frame.name}:SetSize(${sizeSets.map((args) => args.map((set) => spellingText(set)).join(", ")).join("; ")}) ` +
            `— the frame has to be ${BUTTON_SIZE_UNITS} units, measured off the neighbouring ` +
            "buttons (0.75× the old 32)",
    );

    for (const event of RAISE_EVENTS) {
      const registered = registeredEvents.has(event);
      const reapplied = (handled.get(event) ?? new Set()).has(`${frame.name}.SetFrameLevel`);
      say(
        registered && reapplied,
        registered && reapplied
          ? `${frame.name} is re-raised for ${event} — registered, and the branch that handles ` +
            "it re-applies the parent-derived level"
          : !registered
            ? `${event} is never registered — the client restamps cluster levels after ` +
              "ADDON_LOADED, so the raise has to be re-applied by a frame that listens for it"
            : `${event} is registered, but the branch handling it never reaches ` +
              `\`${frame.name}:SetFrameLevel(...)\` — a level set at creation only loses to the ` +
              "client's restamp",
      );
    }
  }

  return lines;
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

  const defs = definitionsIn(ast);
  for (const line of checkFrameSetup(file, source, ast, defs)) {
    if (line.startsWith("FAIL")) {
      failed = true;
      console.error(line);
    } else {
      console.log(line);
    }
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
    "pinned to the minimap ring, the button parented, raised and sized as v0.1.6 measures it",
);
