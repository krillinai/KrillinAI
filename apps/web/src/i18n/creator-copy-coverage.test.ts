import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { swedishInlineCopy } from './swedish-inline-copy.js';

describe('new Creator inline copy coverage', () => {
  it.each([
    'features/settings/LocalTranscriptionComponents.tsx',
    'features/settings/CodexImageStatusNotice.tsx',
    'features/dashboard/LocalTranscriptionNotice.tsx',
    'features/dashboard/BilibiliPartSelector.tsx',
    'runtime/runtime-recovery.tsx',
    'features/issues/OriginalErrorDetails.tsx'
  ])('has Swedish for every fixed user-facing message in %s', file => {
    const source = ts.createSourceFile(file, readFileSync(resolve(process.cwd(), 'src', file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const missing: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['l', 'localize'].includes(node.expression.text)
        && node.arguments.length === 2 && node.arguments[1] && ts.isStringLiteral(node.arguments[1])) {
        const english = node.arguments[1].text;
        if (/[A-Za-z]/.test(english) && !swedishInlineCopy[english]) missing.push(english);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    expect(missing).toEqual([]);
  });

  it('covers fixed task phases and public error guidance used by video translation and native image generation', () => {
    const file = 'features/dashboard/creator-panel-adapters.ts';
    const source = ts.createSourceFile(file, readFileSync(resolve(process.cwd(), 'src', file), 'utf8'), ts.ScriptTarget.Latest, true);
    const missing = new Set<string>();
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['l', 'localize'].includes(node.expression.text)
        && node.arguments.length === 2 && node.arguments[1] && ts.isStringLiteral(node.arguments[1])) {
        const english = node.arguments[1].text;
        if (/[A-Za-z]/.test(english) && !swedishInlineCopy[english]) missing.add(english);
      }
      ts.forEachChild(node, visit);
    }
    function select(node: ts.Node) {
      if ((ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'videoTranslationPanelAdapter')
        || (ts.isFunctionDeclaration(node) && node.name && ['genericPhaseLabel', 'creatorSystemIssueText'].includes(node.name.text))) {
        visit(node);
      } else ts.forEachChild(node, select);
    }
    select(source);
    expect([...missing]).toEqual([]);
  });
});
