import CoreLocation
import MapKit
import UIKit

/// Turns "grocery store", "home" or "Priya's office" into spots on the map, on this phone only.
/// Places you've pinned ("I'm here now") win; anything else is looked up with Apple Maps near you,
/// and the results are kept so background syncs (which get no location) can reuse them.
@MainActor
final class Places: NSObject, ObservableObject, CLLocationManagerDelegate {
    static let shared = Places()

    /// Places some reminder needs that Maps couldn't find nearby: "Priya's office", or "home" before it's pinned.
    @Published private(set) var missing: [String] = []

    private let manager = CLLocationManager()
    private var waiting: [CheckedContinuation<CLLocation?, Never>] = []
    private let pinnedKey = "pinnedPlaces", foundKey = "foundPlaces"

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    private static func key(_ place: String) -> String { place.lowercased().trimmingCharacters(in: .whitespaces) }

    private func load(_ k: String) -> [String: [[Double]]] { UserDefaults.standard.dictionary(forKey: k) as? [String: [[Double]]] ?? [:] }
    private func store(_ k: String, _ place: String, _ spots: [CLLocationCoordinate2D]) {
        var all = load(k)
        all[Self.key(place)] = spots.map { [$0.latitude, $0.longitude] }
        UserDefaults.standard.set(all, forKey: k)
    }

    func spots(for place: String) async -> [CLLocationCoordinate2D] {
        let k = Self.key(place)
        let toCoords = { (xs: [[Double]]) in xs.map { CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) } }
        if let pinned = load(pinnedKey)[k] { return toCoords(pinned) }
        if k == "home" || k == "work" { return [] }   // only ever pinned, never guessed
        guard let here = await location() else { return toCoords(load(foundKey)[k] ?? []) }
        let req = MKLocalSearch.Request()
        req.naturalLanguageQuery = place
        req.region = MKCoordinateRegion(center: here.coordinate, latitudinalMeters: 20_000, longitudinalMeters: 20_000)
        let items = (try? await MKLocalSearch(request: req).start().mapItems) ?? []
        let near = items.map(\.placemark.coordinate)
            .filter { CLLocation(latitude: $0.latitude, longitude: $0.longitude).distance(from: here) < 20_000 }
            .sorted { CLLocation(latitude: $0.latitude, longitude: $0.longitude).distance(from: here) < CLLocation(latitude: $1.latitude, longitude: $1.longitude).distance(from: here) }
        let spots = Array(near.prefix(3))
        store(foundKey, place, spots)
        return spots
    }

    func noteMissing(_ places: [String]) async {
        var out: [String] = []
        for p in places where !out.contains(where: { Self.key($0) == Self.key(p) }) {
            if load(pinnedKey)[Self.key(p)] == nil && (load(foundKey)[Self.key(p)] ?? []).isEmpty { out.append(p) }
        }
        missing = out
    }

    /// "I'm here now": this spot is `place` from now on.
    func pinHere(_ place: String) async {
        guard let here = await location() else { return }
        store(pinnedKey, place, [here.coordinate])
        await Reminders.sync()
    }

    /// One fix, asking for When In Use permission the first time (which needs the app on screen).
    private func location() async -> CLLocation? {
        let status = manager.authorizationStatus
        if status == .denied || status == .restricted { return nil }
        // the permission prompt only shows with the app on screen; a background sync would wait forever
        if status == .notDetermined && UIApplication.shared.applicationState != .active { return nil }
        return await withCheckedContinuation { c in
            waiting.append(c)
            guard waiting.count == 1 else { return }
            if status == .notDetermined { manager.requestWhenInUseAuthorization() } else { manager.requestLocation() }
        }
    }

    private func finish(_ loc: CLLocation?) {
        let w = waiting
        waiting = []
        w.forEach { $0.resume(returning: loc) }
    }

    nonisolated func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        Task { @MainActor in self.finish(locs.last) }
    }
    nonisolated func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in self.finish(nil) }
    }
    nonisolated func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        Task { @MainActor in
            switch m.authorizationStatus {
            case .denied, .restricted: self.finish(nil)
            case .authorizedWhenInUse, .authorizedAlways: if !self.waiting.isEmpty { m.requestLocation() }
            default: break
            }
        }
    }
}
