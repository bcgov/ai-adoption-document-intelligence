#!/usr/bin/env node
/**
 * Verifies that every `logger.error(...)` call made inside a `catch` clause (or a
 * promise `.catch(...)` callback) passes the caught error so its original stack
 * trace is logged, e.g. `{ error: err }` or an explicit `stack: ...` property.
 *
 * Usage:
 *   node scripts/check-error-logging.js          # report violations, exit 1 if any
 *   node scripts/check-error-logging.js --fix    # add `error: <caughtVar>` where safe
 */
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const LOGGER_RECEIVERS = /(^|\.)(logger|log|activityLogger|workerLogger)$/;
const FIX = process.argv.includes("--fix");

/** @returns {string[]} tracked non-test TypeScript source files under apps/ and packages/. */
function listSourceFiles() {
  return execSync("git ls-files 'apps/**/*.ts' 'packages/**/*.ts'", {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean)
    .filter(
      (f) =>
        !/\.(spec|test)\.ts$|\.d\.ts$|integration-tests|testUtils|node_modules|\/dist\//.test(
          f,
        ),
    );
}

/**
 * Finds the variable name of the enclosing catch clause or `.catch(cb)` callback.
 * @param {ts.Node} node
 * @returns {string | undefined}
 */
function enclosingCaughtVar(node) {
  for (let cur = node.parent; cur; cur = cur.parent) {
    if (ts.isCatchClause(cur)) {
      const decl = cur.variableDeclaration;
      return decl && ts.isIdentifier(decl.name) ? decl.name.text : undefined;
    }
    if (
      (ts.isArrowFunction(cur) || ts.isFunctionExpression(cur)) &&
      cur.parent &&
      ts.isCallExpression(cur.parent) &&
      ts.isPropertyAccessExpression(cur.parent.expression) &&
      cur.parent.expression.name.text === "catch" &&
      cur.parameters[0] &&
      ts.isIdentifier(cur.parameters[0].name)
    ) {
      return cur.parameters[0].name.text;
    }
  }
  return undefined;
}

/**
 * True when the call passes the caught error or an explicit stack.
 * @param {ts.CallExpression} call
 * @param {string} caught
 */
function attachesError(call, caught) {
  const ctx = call.arguments[1];
  if (!ctx) return false;
  if (!ts.isObjectLiteralExpression(ctx)) return true; // opaque context: cannot judge
  return ctx.properties.some((p) => {
    if (ts.isShorthandPropertyAssignment(p)) {
      return p.name.text === "stack" || p.name.text === caught;
    }
    if (ts.isSpreadAssignment(p)) return true;
    if (!ts.isPropertyAssignment(p)) return false;
    const key = p.name.getText();
    if (key === "stack") return true;
    return (
      (key === "error" || key === "err") &&
      ts.isIdentifier(p.initializer) &&
      p.initializer.text === caught
    );
  });
}

/**
 * Builds the text edit that attaches the caught error, or undefined if it cannot be done safely.
 * @param {ts.CallExpression} call
 * @param {string} caught
 * @param {ts.SourceFile} sf
 */
function buildFix(call, caught, sf) {
  const prop = caught === "error" ? "error" : `error: ${caught}`;
  const ctx = call.arguments[1];
  if (call.arguments.length === 1) {
    const end = call.arguments[0].getEnd();
    return { start: end, end, text: `, { ${prop} }` };
  }
  if (call.arguments.length !== 2 || !ts.isObjectLiteralExpression(ctx)) {
    return undefined;
  }
  const existing = ctx.properties.find(
    (p) =>
      (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
      ["error", "err"].includes(p.name.getText()),
  );
  if (existing) {
    // Replace a stringified message with the Error itself; the logger serializes both.
    return {
      start: existing.getStart(sf),
      end: existing.getEnd(),
      text: prop,
    };
  }
  const first = ctx.properties[0];
  const at = first ? first.getStart(sf) : ctx.getStart(sf) + 1;
  return { start: at, end: at, text: first ? `${prop}, ` : prop };
}

/** Walks one file and returns violations plus applied/available edits. */
function scan(file) {
  const abs = path.join(ROOT, file);
  const source = fs.readFileSync(abs, "utf8");
  const sf = ts.createSourceFile(abs, source, ts.ScriptTarget.Latest, true);
  const violations = [];
  const edits = [];

  /** @param {ts.Node} node */
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "error" &&
      LOGGER_RECEIVERS.test(node.expression.expression.getText(sf))
    ) {
      const caught = enclosingCaughtVar(node);
      if (caught && !attachesError(node, caught)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        const fix = buildFix(node, caught, sf);
        violations.push({ file, line: line + 1, caught, fixable: !!fix });
        if (fix) edits.push(fix);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  if (FIX && edits.length > 0) {
    let out = source;
    for (const e of edits.sort((a, b) => b.start - a.start)) {
      out = out.slice(0, e.start) + e.text + out.slice(e.end);
    }
    fs.writeFileSync(abs, out);
  }
  return violations;
}

const all = listSourceFiles().flatMap(scan);
const remaining = FIX ? all.filter((v) => !v.fixable) : all;

if (FIX) {
  console.log(`Fixed ${all.length - remaining.length} call(s).`);
}
if (remaining.length > 0) {
  console.error(
    `${remaining.length} logger.error call(s) in catch blocks do not pass the caught error:`,
  );
  for (const v of remaining) {
    console.error(
      `  ${v.file}:${v.line}  add { error: ${v.caught} }${v.fixable ? "" : " (manual)"}`,
    );
  }
  process.exit(1);
}
console.log("OK: all catch-block logger.error calls attach the caught error.");
