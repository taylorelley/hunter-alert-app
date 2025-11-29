import { registerPlugin } from '@capacitor/core';

export interface NetworkStatus {
  connectivity: 'offline' | 'wifi' | 'cellular' | 'satellite';
  constrained: boolean;
  ultraConstrained: boolean;
  expensive: boolean;
}

export interface NetworkMonitorPlugin {
  /**
   * Get the current network status
   */
  getStatus(): Promise<NetworkStatus>;

  /**
   * Add a listener for network status changes
   */
  addListener(
    eventName: 'networkStatusChange',
    listenerFunc: (status: NetworkStatus) => void,
  ): Promise<{ remove: () => Promise<void> }>;

  /**
   * Remove all listeners
   */
  removeAllListeners(): Promise<void>;
}

const NetworkMonitor = registerPlugin<NetworkMonitorPlugin>('NetworkMonitor', {
  web: () => import('./network-monitor-web').then(m => new m.NetworkMonitorWeb()),
});

export default NetworkMonitor;
