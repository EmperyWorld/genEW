/**
 * Fortune Seaker - AST Export Analyzer
 * Extracts exported symbols from TS/TSX/JS/JSX source files
 */

import ts from 'typescript';

export interface ExportAnalysisEntry {
  path: string;
  content: string;
}

export type ExportAnalysisResult = Record<string, string[]>;

function getScriptKind(filePath: string): ts.ScriptKind {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.tsx')) {
    return ts.ScriptKind.TSX;
  }
  if (lower.endsWith('.ts')) {
    return ts.ScriptKind.TS;
  }
  if (lower.endsWith('.jsx')) {
    return ts.ScriptKind.JSX;
  }
  return ts.ScriptKind.JS;
}

function hasExportModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ??
      false)
  );
}

function pushUnique(target: string[], value: string): void {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function collectNamedBinding(name: ts.BindingName, exports: string[]): void {
  if (ts.isIdentifier(name)) {
    pushUnique(exports, name.text);
    return;
  }

  if (ts.isObjectBindingPattern(name)) {
    for (const element of name.elements) {
      if (ts.isOmittedExpression(element.name)) {
        continue;
      }
      const exportedName =
        element.propertyName && ts.isIdentifier(element.propertyName)
          ? element.propertyName.text
          : ts.isIdentifier(element.name)
            ? element.name.text
            : undefined;
      if (exportedName) {
        pushUnique(exports, exportedName);
      }
    }
  }
}

function collectExportSpecifiers(
  elements: ts.NodeArray<ts.ExportSpecifier>,
  exports: string[]
): void {
  for (const element of elements) {
    const exportedName = element.name.text;
    pushUnique(exports, exportedName);
  }
}

export function extractExports(content: string, filePath: string): string[] {
  const exports: string[] = [];

  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      getScriptKind(filePath)
    );
  } catch {
    return exports;
  }

  const visit = (node: ts.Node): void => {
    if (ts.isExportAssignment(node)) {
      if (node.isExportEquals) {
        if (ts.isIdentifier(node.expression)) {
          pushUnique(exports, node.expression.text);
        }
      } else if (ts.isIdentifier(node.expression)) {
        pushUnique(exports, 'default');
        pushUnique(exports, node.expression.text);
      } else {
        pushUnique(exports, 'default');
      }
      ts.forEachChild(node, visit);
      return;
    }

    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        collectExportSpecifiers(node.exportClause.elements, exports);
      } else {
        pushUnique(exports, 'namespace');
      }
      ts.forEachChild(node, visit);
      return;
    }

    if (hasExportModifier(node)) {
      if (
        (ts.isFunctionDeclaration(node) ||
          ts.isClassDeclaration(node) ||
          ts.isInterfaceDeclaration(node) ||
          ts.isTypeAliasDeclaration(node) ||
          ts.isEnumDeclaration(node)) &&
        node.name
      ) {
        pushUnique(exports, node.name.text);
      }

      if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          collectNamedBinding(declaration.name, exports);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return exports.slice(0, 20);
}

export function analyzeExportsBatch(entries: ExportAnalysisEntry[]): ExportAnalysisResult {
  const result: ExportAnalysisResult = {};

  for (const entry of entries) {
    if (!entry?.path) {
      continue;
    }
    result[entry.path] = extractExports(entry.content ?? '', entry.path);
  }

  return result;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function runCli(): Promise<void> {
  const raw = await readStdin();
  if (!raw.trim()) {
    process.stdout.write('{}\n');
    return;
  }

  const entries = JSON.parse(raw) as ExportAnalysisEntry[];
  const result = analyzeExportsBatch(entries);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const isCli = process.argv[1]?.includes('exportAnalyzer');

if (isCli) {
  void runCli();
}
