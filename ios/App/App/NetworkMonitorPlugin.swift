import Foundation
import Capacitor
import Network

@objc(NetworkMonitorPlugin)
public class NetworkMonitorPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NetworkMonitorPlugin"
    public let jsName = "NetworkMonitor"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise)
    ]

    private var pathMonitor: NWPathMonitor?
    private var monitorQueue: DispatchQueue?
    private var lastStatus: [String: Any]?

    override public func load() {
        setupNetworkMonitoring()
    }

    deinit {
        pathMonitor?.cancel()
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        let status = getCurrentNetworkStatus()
        call.resolve(status)
    }

    private func setupNetworkMonitoring() {
        pathMonitor = NWPathMonitor()
        monitorQueue = DispatchQueue(label: "com.hunteralert.app.networkmonitor")

        pathMonitor?.pathUpdateHandler = { [weak self] path in
            self?.handlePathUpdate(path)
        }

        if let queue = monitorQueue {
            pathMonitor?.start(queue: queue)
        }
    }

    private func handlePathUpdate(_ path: NWPath) {
        let status = getNetworkStatus(from: path)

        // Only notify if status changed
        if let lastStatus = lastStatus,
           NSDictionary(dictionary: lastStatus).isEqual(to: status) {
            return
        }

        lastStatus = status
        notifyListeners("networkStatusChange", data: status)
    }

    private func getCurrentNetworkStatus() -> [String: Any] {
        guard let monitor = pathMonitor,
              let queue = monitorQueue else {
            return getOfflineStatus()
        }

        var currentPath: NWPath?
        queue.sync {
            currentPath = monitor.currentPath
        }

        guard let path = currentPath else {
            return getOfflineStatus()
        }

        return getNetworkStatus(from: path)
    }

    private func getNetworkStatus(from path: NWPath) -> [String: Any] {
        // Check if network is available
        guard path.status == .satisfied else {
            return getOfflineStatus()
        }

        // Determine connectivity type
        var connectivity = "wifi"
        var isSatellite = false

        // Check for satellite (iOS 16.1+)
        if #available(iOS 16.1, *) {
            if path.usesInterfaceType(.other) {
                // In iOS, satellite networks typically appear as "other"
                // This is a heuristic and may need refinement
                connectivity = "satellite"
                isSatellite = true
            }
        }

        if !isSatellite {
            if path.usesInterfaceType(.cellular) {
                connectivity = "cellular"
            } else if path.usesInterfaceType(.wifi) {
                connectivity = "wifi"
            } else if path.usesInterfaceType(.wiredEthernet) {
                connectivity = "wifi" // Treat ethernet as wifi
            }
        }

        // Check if network is constrained
        // isConstrained indicates a low-data mode or carrier-constrained network
        let constrained = path.isConstrained

        // Check if network is expensive (metered/cellular)
        let expensive = path.isExpensive

        // Ultra-constrained is satellite or both constrained and expensive
        let ultraConstrained = isSatellite || (constrained && expensive)

        return [
            "connectivity": connectivity,
            "constrained": constrained,
            "ultraConstrained": ultraConstrained,
            "expensive": expensive
        ]
    }

    private func getOfflineStatus() -> [String: Any] {
        return [
            "connectivity": "offline",
            "constrained": false,
            "ultraConstrained": false,
            "expensive": false
        ]
    }
}
