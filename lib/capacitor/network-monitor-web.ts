import { WebPlugin } from '@capacitor/core';
import type { NetworkMonitorPlugin, NetworkStatus } from './network-monitor';

export class NetworkMonitorWeb extends WebPlugin implements NetworkMonitorPlugin {
  private listeners: Set<(status: NetworkStatus) => void> = new Set();

  constructor() {
    super();

    // Set up listeners for web network events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleNetworkChange.bind(this));
      window.addEventListener('offline', this.handleNetworkChange.bind(this));

      const connection = (navigator as any).connection;
      if (connection) {
        connection.addEventListener('change', this.handleNetworkChange.bind(this));
      }
    }
  }

  private handleNetworkChange(): void {
    this.getStatus().then(status => {
      this.listeners.forEach(listener => listener(status));
      this.notifyListeners('networkStatusChange', status);
    });
  }

  async getStatus(): Promise<NetworkStatus> {
    if (typeof window === 'undefined') {
      return {
        connectivity: 'offline',
        constrained: false,
        ultraConstrained: false,
        expensive: false,
      };
    }

    const connection = (navigator as any).connection;
    const online = navigator.onLine;
    const type = connection?.type as string | undefined;
    const effective = connection?.effectiveType as string | undefined;
    const saveData = Boolean(connection?.saveData);

    // Determine if the connection is constrained
    const constrained = saveData || ['2g', 'slow-2g'].includes(effective || '');
    const ultraConstrained = constrained && (effective === 'slow-2g' || (connection?.downlink && connection.downlink < 0.5));

    // Determine connectivity type
    let connectivity: NetworkStatus['connectivity'] = 'wifi';
    if (!online) {
      connectivity = 'offline';
    } else if (type === 'cellular') {
      connectivity = 'cellular';
    } else if (type === 'satellite') {
      connectivity = 'satellite';
    }

    return {
      connectivity,
      constrained,
      ultraConstrained,
      expensive: constrained, // In web, expensive is same as constrained
    };
  }

  async addListener(
    eventName: 'networkStatusChange',
    listenerFunc: (status: NetworkStatus) => void,
  ): Promise<{ remove: () => Promise<void> }> {
    this.listeners.add(listenerFunc);
    return {
      remove: async () => {
        this.listeners.delete(listenerFunc);
      },
    };
  }

  async removeAllListeners(): Promise<void> {
    this.listeners.clear();
  }
}
