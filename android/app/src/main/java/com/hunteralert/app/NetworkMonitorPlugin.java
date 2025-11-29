package com.hunteralert.app;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NetworkMonitor")
public class NetworkMonitorPlugin extends Plugin {
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private JSObject lastStatus;

    @Override
    public void load() {
        connectivityManager = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        registerNetworkCallback();
    }

    @Override
    protected void handleOnDestroy() {
        if (connectivityManager != null && networkCallback != null) {
            connectivityManager.unregisterNetworkCallback(networkCallback);
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject status = getCurrentNetworkStatus();
        call.resolve(status);
    }

    private void registerNetworkCallback() {
        // Build a NetworkRequest that accepts constrained networks
        // This is critical for satellite network support
        NetworkRequest.Builder requestBuilder = new NetworkRequest.Builder();

        // Remove the "not constrained" capability to allow satellite and other constrained networks
        // This aligns with Android's satellite network guidelines
        // Requires API 34+ (minSdkVersion = 34)
        requestBuilder.removeCapability(NetworkCapabilities.NET_CAPABILITY_NOT_BANDWIDTH_CONSTRAINED);

        NetworkRequest request = requestBuilder.build();

        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                notifyNetworkChange();
            }

            @Override
            public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) {
                notifyNetworkChange();
            }

            @Override
            public void onLost(Network network) {
                notifyNetworkChange();
            }
        };

        connectivityManager.registerNetworkCallback(request, networkCallback);
    }

    private void notifyNetworkChange() {
        JSObject status = getCurrentNetworkStatus();

        // Only notify if status actually changed
        if (lastStatus == null || !status.toString().equals(lastStatus.toString())) {
            lastStatus = status;
            notifyListeners("networkStatusChange", status);
        }
    }

    private JSObject getCurrentNetworkStatus() {
        JSObject status = new JSObject();

        if (connectivityManager == null) {
            status.put("connectivity", "offline");
            status.put("constrained", false);
            status.put("ultraConstrained", false);
            status.put("expensive", false);
            return status;
        }

        Network activeNetwork = connectivityManager.getActiveNetwork();

        if (activeNetwork == null) {
            status.put("connectivity", "offline");
            status.put("constrained", false);
            status.put("ultraConstrained", false);
            status.put("expensive", false);
            return status;
        }

        NetworkCapabilities capabilities = connectivityManager.getNetworkCapabilities(activeNetwork);

        if (capabilities == null) {
            status.put("connectivity", "offline");
            status.put("constrained", false);
            status.put("ultraConstrained", false);
            status.put("expensive", false);
            return status;
        }

        // Determine connectivity type
        String connectivity = "wifi";
        boolean isSatellite = false;

        // Check for satellite transport (API 31+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_SATELLITE)) {
                connectivity = "satellite";
                isSatellite = true;
            }
        }

        if (!isSatellite) {
            if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
                connectivity = "cellular";
            } else if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                connectivity = "wifi";
            } else if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) {
                connectivity = "wifi"; // Treat ethernet as wifi for our purposes
            }
        }

        // Determine if network is constrained
        // A network is constrained if it does NOT have the NOT_BANDWIDTH_CONSTRAINED capability
        // Requires API 34+ (minSdkVersion = 34)
        boolean constrained = !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_BANDWIDTH_CONSTRAINED);

        // Determine if network is expensive (metered)
        boolean expensive = !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED);

        // Ultra-constrained is satellite or both constrained and expensive
        boolean ultraConstrained = isSatellite || (constrained && expensive);

        status.put("connectivity", connectivity);
        status.put("constrained", constrained);
        status.put("ultraConstrained", ultraConstrained);
        status.put("expensive", expensive);

        return status;
    }
}
