import type { CleanupDeleteResponse, CleanupPreviewResponse } from '@opencreator/protocol';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  CleanupSettingsView,
  type CleanupSettingsService
} from './CleanupSettingsView.js';

describe('CleanupSettingsView', () => {
  it('shows a disconnected state without calling the service', () => {
    const service = cleanupService();

    render(<CleanupSettingsView connected={false} service={service} />);

    expect(screen.getByText('The local Runtime is disconnected. Cleanup candidates cannot be checked.')).toBeInTheDocument();
    expect(service.previewCleanup).not.toHaveBeenCalled();
  });

  it('previews an empty cleanup result and explains retention rules', async () => {
    const service = cleanupService({
      preview: {
        olderThanDays: 30,
        items: [],
        totalSizeBytes: 0,
        warnings: []
      }
    });

    render(<CleanupSettingsView connected service={service} />);
    fireEvent.click(screen.getByRole('button', { name: 'Check cleanup candidates' }));

    expect(await screen.findByText('No eligible cleanup candidates')).toBeInTheDocument();
    expect(screen.getByText(/Active, queued, and canceling tasks are retained/)).toBeInTheDocument();
    expect(service.previewCleanup).toHaveBeenCalledWith(30);
  });

  it('requires a second confirmation and reports deleted, failed, and skipped items separately', async () => {
    const service = cleanupService({
      preview: previewWithItems(),
      deleted: {
        deleted: [{
          type: 'run_logs',
          id: 'run_old',
          path: '/runtime/runs/run_old',
          sizeBytes: 2048
        }],
        failed: [{
          type: 'managed_thread_workspace',
          id: 'thread_failed',
          path: '/runtime/workspaces/thread_failed',
          sizeBytes: 1024,
          error: 'permission denied'
        }],
        totalDeletedBytes: 2048,
        warnings: ['一个目录在删除前发生变化']
      }
    });

    render(<CleanupSettingsView connected service={service} />);
    fireEvent.click(screen.getByRole('button', { name: 'Check cleanup candidates' }));

    expect(await screen.findByText('/runtime/runs/run_old')).toBeInTheDocument();
    expect(screen.getByText('/runtime/workspaces/thread_failed')).toBeInTheDocument();
    expect(screen.getByText('/runtime/workspaces/thread_skipped')).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Cleanup preview' }).querySelector('.cleanup-summary p')
    ).toHaveTextContent('3 items | 4 KB');

    fireEvent.click(screen.getByRole('button', { name: 'Remove 3 items' }));
    const confirmation = screen.getByRole('region', { name: 'Confirm cleanup' });
    expect(within(confirmation).getByText(/This cannot be undone/)).toBeInTheDocument();

    fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }));
    expect(service.deleteCleanup).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove 3 items' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deleting 3 items' }));

    await waitFor(() => {
      expect(service.deleteCleanup).toHaveBeenCalledWith({
        olderThanDays: 30,
        confirm: true
      });
    });
    expect(await screen.findByText('Deleted 1 items')).toBeInTheDocument();
    expect(screen.getByText('Deletion failed 1 items')).toBeInTheDocument();
    expect(screen.getByText('Skipped 1 items')).toBeInTheDocument();
    expect(screen.getByText('permission denied')).toBeInTheDocument();
    expect(screen.getByText('一个目录在删除前发生变化')).toBeInTheDocument();
  });
});

function cleanupService(input: {
  preview?: CleanupPreviewResponse;
  deleted?: CleanupDeleteResponse;
} = {}): CleanupSettingsService & {
  previewCleanup: ReturnType<typeof vi.fn>;
  deleteCleanup: ReturnType<typeof vi.fn>;
} {
  return {
    previewCleanup: vi.fn(async () => input.preview ?? {
      olderThanDays: 30,
      items: [],
      totalSizeBytes: 0,
      warnings: []
    }),
    deleteCleanup: vi.fn(async () => input.deleted ?? {
      deleted: [],
      failed: [],
      totalDeletedBytes: 0,
      warnings: []
    })
  };
}

function previewWithItems(): CleanupPreviewResponse {
  return {
    olderThanDays: 30,
    totalSizeBytes: 4096,
    warnings: [],
    items: [
      {
        type: 'run_logs',
        id: 'run_old',
        path: '/runtime/runs/run_old',
        sizeBytes: 2048,
        lastModifiedAt: '2026-05-01T00:00:00.000Z',
        reason: 'run logs older than 30 days'
      },
      {
        type: 'managed_thread_workspace',
        id: 'thread_failed',
        path: '/runtime/workspaces/thread_failed',
        sizeBytes: 1024,
        lastModifiedAt: '2026-05-02T00:00:00.000Z',
        reason: 'archived managed thread workspace older than 30 days'
      },
      {
        type: 'managed_thread_workspace',
        id: 'thread_skipped',
        path: '/runtime/workspaces/thread_skipped',
        sizeBytes: 1024,
        lastModifiedAt: '2026-05-03T00:00:00.000Z',
        reason: 'archived managed thread workspace older than 30 days'
      }
    ]
  };
}
