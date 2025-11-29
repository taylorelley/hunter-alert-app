export type NetworkConnectivity = 'offline' | 'wifi' | 'cellular' | 'satellite';

export type NetworkState = {
  connectivity: NetworkConnectivity;
  constrained: boolean;
  ultraConstrained?: boolean;
};

export type PendingActionType = 'SEND_MESSAGE';

export interface PendingAction {
  id: string;
  type: PendingActionType;
  payload: unknown;
  createdAt: string;
}

export type SyncState = 'offline' | 'satellite' | 'normal';

export interface SyncEngineOptions {
  satelliteBatchLimit?: number;
  normalBatchLimit?: number;
}

export class SyncStateMachine {
  private state: SyncState;

  private readonly queue: PendingAction[] = [];

  private readonly satelliteBatchLimit: number;

  private readonly normalBatchLimit: number;

  constructor(initialNetwork: NetworkState, options: SyncEngineOptions = {}) {
    this.state = this.deriveState(initialNetwork);
    this.satelliteBatchLimit = Math.max(options.satelliteBatchLimit ?? 5, 1);
    this.normalBatchLimit = Math.max(options.normalBatchLimit ?? 10, 1);
  }

  get currentState(): SyncState {
    return this.state;
  }

  get pendingActions(): PendingAction[] {
    return [...this.queue];
  }

  handleNetworkChange(network: NetworkState) {
    this.state = this.deriveState(network);
  }

  enqueue(action: PendingAction) {
    this.queue.push(action);
  }

  dequeueBatch(): PendingAction[] {
    if (this.state === 'offline') {
      return [];
    }

    const limit = this.state === 'satellite' ? this.satelliteBatchLimit : this.normalBatchLimit;
    return this.queue.splice(0, limit);
  }

  private deriveState(network: NetworkState): SyncState {
    if (network.connectivity === 'offline') {
      return 'offline';
    }

    if (network.connectivity === 'satellite' || network.constrained || network.ultraConstrained) {
      return 'satellite';
    }

    return 'normal';
  }
}
