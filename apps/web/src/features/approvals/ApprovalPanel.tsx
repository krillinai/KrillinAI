import type { RuntimeApproval } from '@opencreator/protocol';
import { Check, ChevronDown, FilePenLine, ShieldCheck, SquareTerminal, X } from 'lucide-react';

export function ApprovalPanel(props: {
  approval: RuntimeApproval;
  resolving?: boolean;
  error?: string;
  onApprove(id: string): void;
  onReject(id: string): void;
}) {
  const pending = props.approval.status === 'pending';
  const showSummary = !approvalDetailsContainSummary(
    props.approval.details,
    props.approval.summary
  );
  const approvalCopy = getApprovalCopy(props.approval.kind);
  const ApprovalIcon = approvalCopy.icon;
  return (
    <section
      className={`approval-panel approval-${props.approval.risk}`}
      aria-label={props.approval.title}
    >
      <div className="approval-context">
        <ApprovalIcon aria-hidden="true" size={15} />
        <span>{approvalCopy.source}</span>
      </div>
      <div className="approval-copy">
        <strong>{approvalCopy.question}</strong>
        {showSummary ? <p>{props.approval.summary}</p> : null}
        {!pending ? <span>{formatApprovalStatus(props.approval.status)}</span> : null}
      </div>
      {hasApprovalDetails(props.approval.details) ? (
        <details className="approval-disclosure">
          <summary>
            <span>View operation details</span>
            <ChevronDown aria-hidden="true" size={14} />
          </summary>
          <ApprovalDetails details={props.approval.details} />
        </details>
      ) : null}
      {props.approval.status === 'expired' ? (
        <p className="approval-resolution">
          This approval has expired. The task will not continue.
        </p>
      ) : null}
      {props.approval.status === 'rejected' ? (
        <p className="approval-resolution">
          You denied this operation. The task will not continue.
        </p>
      ) : null}
      {props.error ? <p className="inline-error">{props.error}</p> : null}
      {pending ? (
        <div className="approval-footer">
          <span className="approval-scope">This time only</span>
          <div className="approval-actions">
            <button
              type="button"
              className="approval-reject"
              disabled={props.resolving}
              onClick={() => props.onReject(props.approval.id)}
            >
              <X aria-hidden="true" size={14} />
              Reject
            </button>
            <button
              type="button"
              className="approval-approve"
              disabled={props.resolving}
              onClick={() => props.onApprove(props.approval.id)}
            >
              <Check aria-hidden="true" size={14} />
              Allow once
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function getApprovalCopy(kind: RuntimeApproval['kind']): {
  source: string;
  question: string;
  icon: typeof SquareTerminal;
} {
  switch (kind) {
    case 'command_execution':
      return { source: 'Terminal', question: 'Allow OpenCreator to run this command?', icon: SquareTerminal };
    case 'file_change':
      return { source: 'Files', question: 'Allow OpenCreator to modify project files?', icon: FilePenLine };
    case 'permissions':
      return { source: 'Permission', question: 'Allow OpenCreator to request this permission?', icon: ShieldCheck };
  }
}

function approvalDetailsContainSummary(
  details: Record<string, unknown>,
  summary: string
): boolean {
  const normalizedSummary = summary.trim();
  if (normalizedSummary.length === 0) return true;
  return Object.values(details).some(value => (
    typeof value === 'string' && value.trim() === normalizedSummary
  ));
}

function ApprovalDetails(props: { details: Record<string, unknown> }) {
  const command = stringValue(props.details.command);
  const cwd = stringValue(props.details.cwd);
  const grantRoot = stringValue(props.details.grantRoot);
  const network = isRecord(props.details.network) ? props.details.network : undefined;
  const host = stringValue(network?.host);

  if (command === undefined && cwd === undefined && grantRoot === undefined && host === undefined) {
    return null;
  }

  return (
    <dl className="approval-details">
      {command ? <Detail label="Command" value={command} code /> : null}
      {cwd ? <Detail label="Directory" value={cwd} code /> : null}
      {grantRoot ? <Detail label="Write scope" value={grantRoot} code /> : null}
      {host ? <Detail label="Network target" value={formatNetwork(network!)} code /> : null}
    </dl>
  );
}

function hasApprovalDetails(details: Record<string, unknown>): boolean {
  const network = isRecord(details.network) ? details.network : undefined;
  return stringValue(details.command) !== undefined
    || stringValue(details.cwd) !== undefined
    || stringValue(details.grantRoot) !== undefined
    || stringValue(network?.host) !== undefined;
}

function Detail(props: { label: string; value: string; code?: boolean }) {
  return (
    <div>
      <dt>{props.label}</dt>
      <dd>{props.code ? <code>{props.value}</code> : props.value}</dd>
    </div>
  );
}

function formatNetwork(network: Record<string, unknown>): string {
  const protocol = stringValue(network.protocol) ?? 'network';
  const host = stringValue(network.host) ?? '';
  const port = typeof network.port === 'number' ? `:${network.port}` : '';
  return `${protocol}://${host}${port}`;
}

function formatApprovalStatus(status: RuntimeApproval['status']): string {
  switch (status) {
    case 'pending':
      return 'Waiting for your decision';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Denied';
    case 'expired':
      return 'Expired';
    case 'canceled':
      return 'Canceled';
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
