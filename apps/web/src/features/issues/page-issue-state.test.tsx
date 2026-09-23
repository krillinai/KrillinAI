import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiClientError } from '../../runtime/errors.js';
import { usePageIssueState } from './page-issue-state.js';

describe('usePageIssueState', () => {
  it('keeps a sent operation failure until success or dismissal', () => {
    const { result } = renderHook(() => usePageIssueState('projects'));
    act(() => {
      result.current.captureOperationFailure('projects.archive', new Error('API key=secret'), '无法归档项目');
    });
    expect(result.current.issues).toHaveLength(1);
    expect(result.current.issues[0]).toMatchObject({
      scope: { kind: 'page', surface: 'projects' },
      operation: 'projects.archive',
      fallbackMessage: '无法归档项目'
    });
    act(() => result.current.resolveOperation('projects.archive'));
    expect(result.current.issues).toEqual([]);
  });

  it('preserves a normalized ApiClientError issue without storing raw details', () => {
    const { result } = renderHook(() => usePageIssueState('settings'));
    const error = new ApiClientError({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Authorization: Bearer secret',
      details: { stack: 'C:\\Users\\Mayn\\secret' }
    });
    act(() => result.current.captureOperationFailure('settings.save', error, '无法保存设置'));

    expect(JSON.stringify(result.current.issues)).not.toContain('Bearer secret');
    expect(JSON.stringify(result.current.issues)).not.toContain('Users');
  });
});
