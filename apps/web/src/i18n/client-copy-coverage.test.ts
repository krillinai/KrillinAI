import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { additionalLanguageCatalogs } from './translated-copy.js';

const auditedSurfaces = [
  'features/assets/AssetEditor.tsx', 'features/assets/AssetLibraryPage.tsx', 'features/assets/DictionaryAssetPicker.tsx',
  'features/dashboard/SubtitleTimeline.tsx',
  'features/shell/OpenCreatorSidebar.tsx', 'components/layout/AppLayout.tsx',
  'components/editor/FileTree.tsx', 'components/editor/FileEditor.tsx',
  'features/files/FileTopBar.tsx', 'features/files/FilePathBar.tsx', 'features/files/ProjectFileTree.tsx',
  'features/files/FileEditorPane.tsx', 'features/files/FileWorkspaceView.tsx', 'features/files/HtmlPreview.tsx',
  'features/settings/MemorySettingsView.tsx', 'features/settings/CleanupSettingsView.tsx',
  'features/settings/McpSettingsView.tsx', 'features/settings/ProfileSettingsView.tsx',
  'features/settings/CreatorServicesSettingsView.tsx', 'features/settings/DiagnosticsSettingsView.tsx',
  'features/connection/ConnectionPanel.tsx', 'features/conversation/ConversationHeader.tsx',
  'features/conversation/MemorySuggestion.tsx', 'features/runs/RunDetailPanel.tsx',
  'features/approvals/ApprovalPanel.tsx', 'features/threads/ThreadList.tsx',
  'features/tasks/TaskCenter.tsx', 'features/schedules/SchedulesView.tsx', 'components/timeline/Timeline.tsx',
  'features/schedules/ScheduleEditor.tsx', 'features/schedules/ScheduleThreadHeader.tsx',
  'features/details/DetailPanel.tsx', 'features/capabilities/CapabilitiesView.tsx',
  'components/layout/DesktopWindowControls.tsx'
];

describe('audited client copy', () => {
  it.each(auditedSurfaces)('covers fixed and interpolated messages in %s', file => {
    const source = ts.createSourceFile(file, readFileSync(resolve(process.cwd(), 'src', file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const missing = new Set<string>();
    const rawChinese: string[] = [];
    function checkCopy(node: ts.Node) {
      let english: string | undefined;
      if (ts.isStringLiteralLike(node)) english = node.text;
      if (ts.isTemplateExpression(node)) english = node.head.text + node.templateSpans.map((span, index) => `{{${index}}}${span.literal.text}`).join('');
      if (english && /[A-Za-z]/.test(english)) {
        for (const [language, catalog] of Object.entries(additionalLanguageCatalogs)) {
          if (!Object.hasOwn(catalog!, english)) missing.add(`${language}: ${english}`);
        }
      }
      if (ts.isConditionalExpression(node)) { checkCopy(node.whenTrue); checkCopy(node.whenFalse); }
    }
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['l', 'localize'].includes(node.expression.text) && node.arguments[1]) checkCopy(node.arguments[1]);
      if (ts.isJsxText(node) && /[\u3400-\u9fff]/.test(node.text)) rawChinese.push(node.text.trim());
      if (ts.isJsxAttribute(node) && ['aria-label', 'title', 'placeholder'].includes(node.name.getText(source)) && node.initializer && ts.isStringLiteral(node.initializer) && /[\u3400-\u9fff]/.test(node.initializer.text)) rawChinese.push(node.initializer.text);
      ts.forEachChild(node, visit);
    }
    visit(source);
    expect([...missing]).toEqual([]);
    expect(rawChinese).toEqual([]);
  });
});
