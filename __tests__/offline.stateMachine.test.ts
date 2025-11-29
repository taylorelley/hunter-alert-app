import { describe, expect, it } from 'vitest';
import { PendingAction, SyncStateMachine } from '../lib/offline/stateMachine';

describe('SyncStateMachine', () => {
  const baseAction = (id: string): PendingAction => ({
    id,
    type: 'SEND_MESSAGE',
    payload: { text: id },
    createdAt: new Date().toISOString(),
  });

  it('derives offline state and preserves queue while offline', () => {
    const machine = new SyncStateMachine({ connectivity: 'offline', constrained: false });
    machine.enqueue(baseAction('a'));
    machine.enqueue(baseAction('b'));

    expect(machine.currentState).toBe('offline');
    expect(machine.dequeueBatch()).toHaveLength(0);
    expect(machine.pendingActions).toHaveLength(2);

    machine.handleNetworkChange({ connectivity: 'wifi', constrained: false });
    const flushed = machine.dequeueBatch();
    expect(flushed.map((item) => item.id)).toEqual(['a', 'b']);
    expect(machine.pendingActions).toHaveLength(0);
  });

  it('enters satellite mode when constrained and limits batch size', () => {
    const machine = new SyncStateMachine(
      { connectivity: 'wifi', constrained: true },
      { satelliteBatchLimit: 1 },
    );
    machine.enqueue(baseAction('a'));
    machine.enqueue(baseAction('b'));

    expect(machine.currentState).toBe('satellite');
    expect(machine.dequeueBatch().map((item) => item.id)).toEqual(['a']);
    expect(machine.pendingActions.map((item) => item.id)).toEqual(['b']);
  });

  it('defaults to normal mode with faster flushing', () => {
    const machine = new SyncStateMachine({ connectivity: 'cellular', constrained: false });
    machine.enqueue(baseAction('a'));
    machine.enqueue(baseAction('b'));
    machine.enqueue(baseAction('c'));

    const flushed = machine.dequeueBatch();
    expect(flushed.length).toBeGreaterThanOrEqual(3);
    expect(machine.currentState).toBe('normal');
    expect(machine.pendingActions).toHaveLength(0);
  });
});
