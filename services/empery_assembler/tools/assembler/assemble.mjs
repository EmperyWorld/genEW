#!/usr/bin/env node
/**
 * EIC Assembler CLI — inject Manifest composition into @assembler-slot widgets.
 *
 * Usage:
 *   node assemble.mjs --manifest path.json --target path.tsx [--out path.tsx]
 *     [--metrics-var metrics|session.metrics]
 *
 * Injected widgets bind dynamic props via scaffold DI helpers:
 *   metricField / metricSeries (ops_dashboard)
 *   chatMessages / setMessage / onSend / busy / message (companion_chat)
 *   studioJobs / setPrompt / onGenerate / busy / prompt (studio_job)
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import _generate from "@babel/generator";
import * as t from "@babel/types";
import prettier from "prettier";

const traverse = _traverse.default || _traverse;
const generate = _generate.default || _generate;

function usage() {
  console.error(
    "Usage: node assemble.mjs --manifest <file> --target <tsx> [--out <tsx>] [--metrics-var metrics]",
  );
  process.exit(2);
}

function arg(name) {
  const i = process.argv.indexOf(name);
  if (i < 0 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

function staticProp(mapping, name) {
  const row = (mapping || []).find((m) => m.prop_name === name);
  if (!row) return null;
  if (row.source_type === "static") return row.value;
  return null;
}

function componentName(item) {
  if (item.component === "Chart" || item.widget_type === "chart") return "BaseChart";
  if (item.component === "MetricTile" || item.widget_type === "metric") {
    return "BaseMetricTile";
  }
  if (item.component === "Table" || item.widget_type === "table") return "BaseCard";
  if (
    item.component === "ChatPanel" ||
    item.widget_type === "message_list"
  ) {
    return "BaseChatPanel";
  }
  if (item.component === "Composer" || item.widget_type === "composer") {
    return "BaseComposer";
  }
  if (item.component === "JobForm" || item.widget_type === "job_form") {
    return "BaseJobForm";
  }
  if (item.component === "JobList" || item.widget_type === "job_list") {
    return "BaseJobList";
  }
  return "BaseCard";
}

function jsxString(value) {
  if (value == null) return t.jsxExpressionContainer(t.nullLiteral());
  if (typeof value === "number") {
    return t.jsxExpressionContainer(t.numericLiteral(value));
  }
  if (typeof value === "boolean") {
    return t.jsxExpressionContainer(t.booleanLiteral(value));
  }
  return t.stringLiteral(String(value));
}

function callExpr(name) {
  return t.jsxExpressionContainer(
    t.callExpression(t.identifier(name), []),
  );
}

function identExpr(name) {
  return t.jsxExpressionContainer(t.identifier(name));
}

/** value={metricField("Title", "value")} */
function metricFieldExpr(title, field) {
  return t.jsxExpressionContainer(
    t.callExpression(t.identifier("metricField"), [
      t.stringLiteral(String(title)),
      t.stringLiteral(field),
    ]),
  );
}

function metricSeriesExpr() {
  return t.jsxExpressionContainer(
    t.callExpression(t.identifier("metricSeries"), []),
  );
}

function buildWidgetElement(item) {
  const name = componentName(item);
  const mapping = item.mapping || [];
  const title =
    staticProp(mapping, "title") ||
    item.component_id ||
    "Widget";
  const hasDynamic =
    Boolean(item.data_source) ||
    (mapping || []).some((m) => m.source_type === "dynamic");

  const attrs = [
    t.jsxAttribute(t.jsxIdentifier("key"), t.stringLiteral(item.component_id)),
  ];
  if (item.data_source) {
    attrs.push(
      t.jsxAttribute(
        t.jsxIdentifier("data-assembly-data-source"),
        t.stringLiteral(String(item.data_source)),
      ),
    );
  }

  if (name === "BaseChatPanel") {
    const emptyHint =
      staticProp(mapping, "empty_hint") ||
      "Ask anything — replies come from living Nervas.";
    attrs.push(
      t.jsxAttribute(t.jsxIdentifier("title"), jsxString(title)),
      t.jsxAttribute(t.jsxIdentifier("emptyHint"), jsxString(emptyHint)),
      t.jsxAttribute(t.jsxIdentifier("messages"), callExpr("chatMessages")),
    );
  } else if (name === "BaseComposer") {
    const placeholder =
      staticProp(mapping, "placeholder") || "Ask the companion…";
    const sendLabel = staticProp(mapping, "send_label") || "Send";
    attrs.push(
      t.jsxAttribute(t.jsxIdentifier("title"), jsxString(title)),
      t.jsxAttribute(t.jsxIdentifier("placeholder"), jsxString(placeholder)),
      t.jsxAttribute(t.jsxIdentifier("sendLabel"), jsxString(sendLabel)),
      t.jsxAttribute(t.jsxIdentifier("value"), identExpr("message")),
      t.jsxAttribute(t.jsxIdentifier("busy"), identExpr("busy")),
      t.jsxAttribute(t.jsxIdentifier("onChange"), identExpr("setMessage")),
      t.jsxAttribute(
        t.jsxIdentifier("onSend"),
        t.jsxExpressionContainer(
          t.arrowFunctionExpression(
            [],
            t.callExpression(t.identifier("onSend"), []),
          ),
        ),
      ),
    );
  } else if (name === "BaseJobForm") {
    const placeholder =
      staticProp(mapping, "placeholder") || "Describe what to generate…";
    const buttonLabel = staticProp(mapping, "button_label") || "Generate";
    attrs.push(
      t.jsxAttribute(t.jsxIdentifier("title"), jsxString(title)),
      t.jsxAttribute(t.jsxIdentifier("placeholder"), jsxString(placeholder)),
      t.jsxAttribute(t.jsxIdentifier("buttonLabel"), jsxString(buttonLabel)),
      t.jsxAttribute(t.jsxIdentifier("value"), identExpr("prompt")),
      t.jsxAttribute(t.jsxIdentifier("busy"), identExpr("busy")),
      t.jsxAttribute(t.jsxIdentifier("onChange"), identExpr("setPrompt")),
      t.jsxAttribute(
        t.jsxIdentifier("onGenerate"),
        t.jsxExpressionContainer(
          t.arrowFunctionExpression(
            [],
            t.callExpression(t.identifier("onGenerate"), []),
          ),
        ),
      ),
    );
  } else if (name === "BaseJobList") {
    const emptyHint = staticProp(mapping, "empty_hint") || "No jobs yet.";
    attrs.push(
      t.jsxAttribute(t.jsxIdentifier("title"), jsxString(title)),
      t.jsxAttribute(t.jsxIdentifier("emptyHint"), jsxString(emptyHint)),
      t.jsxAttribute(t.jsxIdentifier("jobs"), callExpr("studioJobs")),
    );
  } else if (name === "BaseChart") {
    const chartType = staticProp(mapping, "chart_type") || "area_line";
    attrs.push(
      t.jsxAttribute(t.jsxIdentifier("title"), jsxString(title)),
      t.jsxAttribute(t.jsxIdentifier("chartType"), jsxString(chartType)),
      t.jsxAttribute(
        t.jsxIdentifier("series"),
        hasDynamic
          ? metricSeriesExpr()
          : t.jsxExpressionContainer(t.arrayExpression([])),
      ),
    );
  } else {
    const staticValue = staticProp(mapping, "value");
    const staticUnit = staticProp(mapping, "unit");
    const icon = staticProp(mapping, "icon");
    attrs.push(t.jsxAttribute(t.jsxIdentifier("title"), jsxString(title)));
    if (hasDynamic) {
      attrs.push(
        t.jsxAttribute(
          t.jsxIdentifier("value"),
          metricFieldExpr(title, "value"),
        ),
      );
      attrs.push(
        t.jsxAttribute(t.jsxIdentifier("unit"), metricFieldExpr(title, "unit")),
      );
    } else {
      attrs.push(
        t.jsxAttribute(
          t.jsxIdentifier("value"),
          staticValue != null
            ? jsxString(staticValue)
            : t.jsxExpressionContainer(t.stringLiteral("—")),
        ),
      );
      if (staticUnit != null) {
        attrs.push(t.jsxAttribute(t.jsxIdentifier("unit"), jsxString(staticUnit)));
      }
    }
    if (icon != null) {
      attrs.push(t.jsxAttribute(t.jsxIdentifier("icon"), jsxString(icon)));
    }
  }
  return t.jsxElement(
    t.jsxOpeningElement(t.jsxIdentifier(name), attrs, true),
    null,
    [],
    true,
  );
}

function ensureImports(ast, needed) {
  const existing = new Set();
  for (const node of ast.program.body) {
    if (!t.isImportDeclaration(node)) continue;
    if (node.source.value !== "@/assembly_lib") continue;
    for (const spec of node.specifiers) {
      if (t.isImportSpecifier(spec) && t.isIdentifier(spec.imported)) {
        existing.add(spec.imported.name);
      }
    }
  }
  const missing = [...needed].filter((n) => !existing.has(n));
  if (missing.length === 0) return;
  let patched = false;
  for (const node of ast.program.body) {
    if (!t.isImportDeclaration(node)) continue;
    if (node.source.value !== "@/assembly_lib") continue;
    for (const name of missing) {
      node.specifiers.push(
        t.importSpecifier(t.identifier(name), t.identifier(name)),
      );
    }
    patched = true;
    break;
  }
  if (!patched) {
    ast.program.body.unshift(
      t.importDeclaration(
        missing.map((n) => t.importSpecifier(t.identifier(n), t.identifier(n))),
        t.stringLiteral("@/assembly_lib"),
      ),
    );
  }
}

/** Drop assembly_lib imports not used after slot replace (avoids TS6133). */
function pruneAssemblyLibImports(ast, needed) {
  const keep = new Set(needed);
  // Shell chrome outside the widgets slot — never remove.
  keep.add("BaseLayout");
  for (const node of ast.program.body) {
    if (!t.isImportDeclaration(node)) continue;
    if (node.source.value !== "@/assembly_lib") continue;
    node.specifiers = node.specifiers.filter((spec) => {
      if (!t.isImportSpecifier(spec) || !t.isIdentifier(spec.imported)) {
        return true;
      }
      return keep.has(spec.imported.name);
    });
  }
}

/** Remove metricSeries helper when no BaseChart was injected. */
function pruneUnusedMetricSeries(ast, needed) {
  if (needed.has("BaseChart")) return;
  traverse(ast, {
    VariableDeclarator(path) {
      if (!t.isIdentifier(path.node.id) || path.node.id.name !== "metricSeries") {
        return;
      }
      const parent = path.parentPath;
      if (parent && parent.isVariableDeclaration()) {
        if (parent.node.declarations.length === 1) {
          parent.remove();
        } else {
          path.remove();
        }
      }
    },
  });
}

function inject(ast, composition) {
  const widgets = (composition || []).map(buildWidgetElement);
  const needed = new Set(
    (composition || []).map((item) => componentName(item)),
  );
  let replaced = false;
  traverse(ast, {
    JSXElement(path) {
      const opening = path.node.openingElement;
      const slotAttr = opening.attributes.find(
        (a) =>
          t.isJSXAttribute(a) &&
          t.isJSXIdentifier(a.name) &&
          a.name.name === "data-assembler-slot" &&
          t.isStringLiteral(a.value) &&
          a.value.value === "widgets",
      );
      if (!slotAttr) return;
      path.node.children = widgets;
      replaced = true;
      path.stop();
    },
  });
  if (!replaced) {
    throw new Error('No JSX element with data-assembler-slot="widgets" found');
  }
  ensureImports(ast, needed);
  pruneAssemblyLibImports(ast, needed);
  pruneUnusedMetricSeries(ast, needed);
  return widgets.length;
}

async function main() {
  const manifestPath = arg("--manifest");
  const targetPath = arg("--target");
  const outPath = arg("--out") || targetPath;
  if (!manifestPath || !targetPath) usage();

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const source = fs.readFileSync(targetPath, "utf8");
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });
  const count = inject(ast, manifest.composition || []);
  const { code } = generate(
    ast,
    { retainLines: false, jsescOption: { minimal: true } },
    source,
  );
  const formatted = await prettier.format(code, {
    parser: "typescript",
    filepath: outPath,
  });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, formatted, "utf8");
  console.log(
    JSON.stringify({
      ok: true,
      written: outPath,
      widget_count: count,
    }),
  );
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: String(err && err.message ? err.message : err),
    }),
  );
  process.exit(1);
});
