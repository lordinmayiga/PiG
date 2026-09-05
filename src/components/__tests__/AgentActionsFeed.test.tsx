import { render, screen, fireEvent } from '@testing-library/react-native';

import { AgentActionsFeed } from '../AgentActionsFeed';
import type { AgentAction } from '../../types';

/**
 * Component-level coverage for the two behaviors UI_FIXES_PLAN.md item 1
 * added that real E2E runs can't reliably exercise: the 7-row cap needs 8+
 * ungrouped real tool calls in one turn, and a real, uncoached agent tends
 * to batch a multi-file request into far fewer actual tool invocations (see
 * `e2e/agent-actions-stream.spec.ts`'s note) — that's real agent behavior,
 * not a gap in the fix, so the cap itself is pinned down here instead with
 * synthetic actions. Auto-collapse-on-finish IS proven end-to-end (a real
 * single-tool-call turn reliably produces exactly the "still running -> done"
 * transition), so it's not duplicated here.
 */
function makeAction(i: number, overrides: Partial<AgentAction> = {}): AgentAction {
  return {
    id: `action-${i}`,
    tool: 'Read',
    label: `Reading file-${i}.ts`,
    status: 'done',
    startedAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
    ...overrides,
  };
}

describe('AgentActionsFeed', () => {
  it('renders nothing for an empty actions list', async () => {
    const { toJSON } = await render(<AgentActionsFeed actions={[]} />);
    expect(toJSON()).toBeNull();
  });

  it('caps the rendered rows at 7 even when a turn has more than 7 actions', async () => {
    const actions = Array.from({ length: 12 }, (_, i) => makeAction(i));
    await render(<AgentActionsFeed actions={actions} />);

    // Nothing is running, so it auto-collapses on mount (per the auto-collapse
    // effect) — expand it to inspect the row count.
    await fireEvent.press(screen.getByTestId('agent-actions-header'));

    const rows = screen.getAllByText(/^Reading file-\d+\.ts$/);
    expect(rows).toHaveLength(7);
    // The 5 oldest (file-0..file-4) scroll off; the 7 most recent remain.
    expect(screen.queryByText('Reading file-0.ts')).toBeNull();
    expect(screen.queryByText('Reading file-11.ts')).not.toBeNull();

    // The header's count reflects the true total, not the capped row count.
    expect(screen.getByText('12 actions')).toBeTruthy();
  });

  it('auto-collapses once nothing is running, and stays manually re-expandable', async () => {
    const running: AgentAction[] = [makeAction(0, { status: 'running' })];
    const { rerender } = await render(<AgentActionsFeed actions={running} />);

    // Still running: expanded by default, no collapse toggle rendered.
    expect(screen.getByText('Reading file-0.ts')).toBeTruthy();
    expect(screen.queryByTestId('action-pulse-dot')).toBeTruthy();

    const finished: AgentAction[] = [makeAction(0, { status: 'done' })];
    await rerender(<AgentActionsFeed actions={finished} />);

    // Turn just finished: auto-collapsed to the one-line summary, row list gone.
    expect(screen.getByText('1 action')).toBeTruthy();
    expect(screen.queryByText('Reading file-0.ts')).toBeNull();

    // Manual re-expand still works.
    await fireEvent.press(screen.getByTestId('agent-actions-header'));
    expect(screen.getByText('Reading file-0.ts')).toBeTruthy();
  });
});
