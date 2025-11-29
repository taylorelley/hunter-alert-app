# Capacitor Setup and Native Network Plugins

This document describes the Capacitor setup for Hunter Alert and the native network monitoring plugins for Android and iOS.

## Overview

Hunter Alert uses Capacitor to provide native mobile app capabilities, with custom plugins for advanced network monitoring that support satellite and constrained networks.

## Architecture

### Native Plugins

The `NetworkMonitor` plugin provides platform-specific network status detection:

- **Android**: Uses `ConnectivityManager` and `NetworkCapabilities` to detect satellite, cellular, and WiFi networks, including constrained network detection
- **iOS**: Uses `NWPathMonitor` from the Network framework to detect network conditions, including expensive and constrained paths
- **Web**: Falls back to browser Network Information API for development

### Network Status Interface

```typescript
interface NetworkStatus {
  connectivity: 'offline' | 'wifi' | 'cellular' | 'satellite';
  constrained: boolean;       // Low-data mode or bandwidth-constrained
  ultraConstrained: boolean;  // Satellite or both constrained + expensive
  expensive: boolean;         // Metered/cellular connection
}
```

## Android Implementation

### Manifest Configuration

The Android manifest includes the satellite optimization metadata:

```xml
<meta-data
    android:name="android.telephony.PROPERTY_SATELLITE_DATA_OPTIMIZED"
    android:value="${applicationId}" />
```

### NetworkRequest Configuration

The plugin uses a `NetworkRequest` that explicitly allows constrained networks by removing the `NET_CAPABILITY_NOT_BANDWIDTH_CONSTRAINED` capability:

```java
NetworkRequest.Builder requestBuilder = new NetworkRequest.Builder();
requestBuilder.removeCapability(NetworkCapabilities.NET_CAPABILITY_NOT_BANDWIDTH_CONSTRAINED);
```

### Satellite Detection

On Android API 31+, satellite networks are detected using:

```java
capabilities.hasTransport(NetworkCapabilities.TRANSPORT_SATELLITE)
```

### Permissions

Required permissions in `AndroidManifest.xml`:
- `INTERNET` - Network access
- `ACCESS_NETWORK_STATE` - Network status monitoring

## iOS Implementation

### Entitlements

The iOS app includes carrier-constrained entitlements in `App.entitlements`:

```xml
<key>com.apple.developer.networking.carrier-constrained.app-optimized</key>
<true/>
<key>com.apple.developer.networking.carrier-constrained.appcategory</key>
<string>messaging</string>
```

These entitlements enable the app to be optimized for ultra-constrained networks and carrier-constrained paths.

### NWPathMonitor

The iOS plugin uses `NWPathMonitor` to detect network conditions:

```swift
let pathMonitor = NWPathMonitor()
pathMonitor.pathUpdateHandler = { path in
    let constrained = path.isConstrained
    let expensive = path.isExpensive
    // ...
}
```

### Network Type Detection

- **Satellite**: Detected via interface type `.other` (iOS 16.1+)
- **Cellular**: `path.usesInterfaceType(.cellular)`
- **WiFi**: `path.usesInterfaceType(.wifi)`

## Integration with React

The `NetworkProvider` component automatically uses the native plugin when running on mobile:

```typescript
// Detect platform
if (Capacitor.isNativePlatform()) {
  const status = await NetworkMonitor.getStatus()
  // Use native status
} else {
  // Fall back to web APIs
}
```

### Real-time Updates

The provider subscribes to network status changes:

```typescript
NetworkMonitor.addListener('networkStatusChange', (status) => {
  // Update UI with new network status
})
```

## Building and Testing

### Prerequisites

- Node.js 20+
- pnpm
- Java 17+ (for Android)
- Android SDK (for Android)
- Xcode (for iOS, macOS only)
- CocoaPods (for iOS, macOS only)

### Build Commands

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Build the web app:**
   ```bash
   pnpm build
   ```

3. **Sync with native platforms:**
   ```bash
   npx cap sync
   ```

4. **Open in native IDEs:**
   ```bash
   # Android Studio
   npx cap open android

   # Xcode (macOS only)
   npx cap open ios
   ```

5. **Run on device:**
   ```bash
   # Android
   npx cap run android

   # iOS (macOS only)
   npx cap run ios
   ```

### Testing Network States

To test different network conditions:

1. **WiFi**: Connect to a WiFi network
2. **Cellular**: Disable WiFi, use cellular data
3. **Constrained**: Enable "Low Data Mode" in device settings
4. **Offline**: Enable Airplane mode
5. **Satellite**: Requires actual satellite connection (or emulator)

## GitHub Actions CI/CD

The repository includes a GitHub Actions workflow (`.github/workflows/build-android.yml`) that:

1. Builds the Next.js app
2. Syncs with Capacitor
3. Builds the Android APK
4. Creates a GitHub release with the APK artifact

Releases are triggered on pushes to the `main` branch.

## Troubleshooting

### Android Build Issues

- **Gradle errors**: Ensure Java 17+ is installed
- **SDK not found**: Set `ANDROID_HOME` environment variable
- **Plugin not found**: Run `npx cap sync android`

### iOS Build Issues

- **CocoaPods errors**: Run `cd ios/App && pod install`
- **Signing errors**: Configure code signing in Xcode
- **Plugin not found**: Run `npx cap sync ios`

### Network Detection Issues

- **Always shows WiFi**: Check permissions in app settings
- **No satellite detection**: Requires API 31+ on Android, actual satellite connection
- **Listener not firing**: Ensure plugin is properly registered

## References

- [Android Satellite Networks Guide](https://developer.android.com/develop/connectivity/satellite/constrained-networks)
- [Apple Carrier-Constrained Entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.networking.carrier-constrained.app-optimized)
- [Apple Ultra-Constrained Networks](https://developer.apple.com/documentation/network/optimizing_your_app_s_networking_behavior_for_ultra_constrained_networks)
- [Capacitor Documentation](https://capacitorjs.com/docs)
