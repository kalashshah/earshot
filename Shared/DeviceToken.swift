import Foundation
import Security

/// This device's API token, issued when the iPhone is paired from the website and relayed to the
/// watch. Kept in the Keychain, readable after first unlock so background uploads work while locked.
/// Posts `changed` (on main) whenever it is saved or cleared; a 401 from any call clears it.
enum DeviceToken {
    static let changed = Notification.Name("DeviceTokenChanged")

    private static var item: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "com.kalashshah.earshot",
         kSecAttrAccount as String: "device-token"]
    }

    static var current: String? {
        var q = item
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func save(_ token: String) {
        guard token != current else { return }
        SecItemDelete(item as CFDictionary)
        var q = item
        q[kSecValueData as String] = Data(token.utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
        notify()
    }

    static func clear() {
        guard current != nil else { return }
        SecItemDelete(item as CFDictionary)
        notify()
    }

    /// `req` with the bearer header. Throws when this device isn't paired.
    static func authorize(_ req: URLRequest) throws -> URLRequest {
        guard let token = current else {
            throw URLError(.userAuthenticationRequired, userInfo: [NSLocalizedDescriptionKey: "This device isn't paired."])
        }
        var req = req
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return req
    }

    /// Call with every response. A 401 means the device was removed on the website, so forget the
    /// token (the apps then show pairing). Only when the request carried the current token, so a
    /// stale in-flight upload can't undo a fresh pairing.
    static func check(_ res: URLResponse?, for req: URLRequest?) {
        guard (res as? HTTPURLResponse)?.statusCode == 401, let current,
              req?.value(forHTTPHeaderField: "Authorization") == "Bearer \(current)" else { return }
        clear()
    }

    private static func notify() {
        DispatchQueue.main.async { NotificationCenter.default.post(name: changed, object: nil) }
    }
}
