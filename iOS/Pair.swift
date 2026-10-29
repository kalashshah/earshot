import AuthenticationServices
import CryptoKit
import SwiftUI

/// Shown until this iPhone has a device token. "Sign in" opens the website's sign-in (Google or an
/// email code) in a web auth sheet and comes back with a pairing code; a code typed from
/// Settings → Pair your iPhone still works. Either way the token is saved and relayed to the watch.
struct PairView: View {
    @State private var code = ""
    @State private var showCode = false
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focused: Bool
    @Environment(\.webAuthenticationSession) private var webAuth

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            ParticleOrb(active: false, count: 360).frame(width: 180, height: 180)
            Text("Earshot").font(.largeTitle.bold())
            Text("Sign in to sync your watch's conversations, promises and briefs.")
                .multilineTextAlignment(.center).foregroundStyle(.secondary)

            if let error {
                Text(error).font(.callout).foregroundStyle(.orange).multilineTextAlignment(.center)
            }

            Button(action: signIn) {
                Group {
                    if busy && !showCode { ProgressView().tint(.black) } else { Text("Sign in").bold() }
                }
                .frame(maxWidth: .infinity, minHeight: 28)
            }
            .buttonStyle(.borderedProminent)
            .foregroundStyle(.black)
            .controlSize(.large)
            .disabled(busy)

            if showCode {
                TextField("XXXX-XXXX", text: $code)
                    .font(.system(.title2, design: .monospaced).weight(.semibold))
                    .multilineTextAlignment(.center)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .focused($focused)
                    .padding(12)
                    .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 14))
                    .onChange(of: code) { _, new in
                        let formatted = Self.format(new)
                        if formatted != new { code = formatted }
                        if formatted.count == 9 { claim(formatted) }
                    }
            } else {
                Button("Have a pairing code?") { showCode = true; focused = true }
                    .font(.callout)
            }

            Spacer()
            Spacer()
        }
        .padding(.horizontal, 32)
        .tint(.ember)
    }

    /// Uppercase letters/digits only, max 8, with a dash after the fourth: "4f7k9q" → "4F7K-9Q".
    static func format(_ raw: String) -> String {
        let chars = raw.uppercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber) }.prefix(8)
        return chars.count > 4 ? "\(chars.prefix(4))-\(chars.dropFirst(4))" : String(chars)
    }

    private func signIn() {
        guard !busy else { return }
        // the code comes back over earshot://, so bind it to a secret only this app holds
        let verifier = (0..<32).map { _ in String(format: "%02x", UInt8.random(in: 0...255)) }.joined()
        let challenge = SHA256.hash(data: Data(verifier.utf8)).map { String(format: "%02x", $0) }.joined()
        let url = URL(string: "https://earshot.keronlabs.com/app-link?challenge=\(challenge)")!
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                let back = try await webAuth.authenticate(using: url, callbackURLScheme: "earshot", preferredBrowserSession: .shared)
                let items = URLComponents(url: back, resolvingAgainstBaseURL: false)?.queryItems ?? []
                guard let code = items.first(where: { $0.name == "code" })?.value else {
                    error = items.first(where: { $0.name == "error" })?.value ?? "Sign-in didn't finish."
                    return
                }
                try await save(API.claim(code: code, name: UIDevice.current.name, verifier: verifier))
            } catch ASWebAuthenticationSessionError.canceledLogin {
                // closed the sheet: nothing to say
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func claim(_ code: String) {
        guard !busy else { return }
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do { try await save(API.claim(code: code, name: UIDevice.current.name)) } catch { self.error = error.localizedDescription }
        }
    }

    private func save(_ token: String) {
        DeviceToken.save(token)
        Uploader.shared.flush()   // clips that arrived while unpaired
    }
}
