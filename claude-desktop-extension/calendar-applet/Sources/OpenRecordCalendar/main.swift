// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

// OpenRecord Calendar — the menu-bar shell around the calendar sync worker.
//
// All the sync logic is TypeScript: `openrecord-calendar-sync`, compiled with
// `bun build --compile` from claude-desktop-extension/src/google-calendar/worker.ts
// and shipped beside this executable. This app only draws the status item,
// decides when a sync is due, and runs the worker. See ../../README.md.

import AppKit

let syncInterval: TimeInterval = 4 * 60 * 60
let workerTimeout: TimeInterval = 10 * 60
let agentLabel = "com.fanpierlabs.openrecord.calendar"

let home = FileManager.default.homeDirectoryForCurrentUser
let stateURL = home.appendingPathComponent(".openrecord-mcpb/google-calendar.json")
let logURL = home.appendingPathComponent("Library/Logs/OpenRecord Calendar.log")
let agentPlistURL = home.appendingPathComponent("Library/LaunchAgents/\(agentLabel).plist")

struct AccountResult: Decodable {
    let account: String
    let synced: Int
    let removed: Int
    let error: String?
}

struct LastSync: Decodable {
    let at: String
    let ok: Bool
    let synced: Int
    let accounts: [AccountResult]
}

/// The worker writes this file; the app only reads it.
struct SyncState: Decodable {
    let calendarId: String?
    let connectedAt: String?
    let lastSync: LastSync?
}

func readState() -> SyncState? {
    guard let data = try? Data(contentsOf: stateURL) else { return nil }
    return try? JSONDecoder().decode(SyncState.self, from: data)
}

func parseDate(_ s: String) -> Date? {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f.date(from: s) ?? ISO8601DateFormatter().date(from: s)
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private var statusItem: NSStatusItem!
    private var checkTimer: Timer?
    private var syncing = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        let menu = NSMenu()
        menu.delegate = self
        statusItem.menu = menu
        updateIcon()

        // Check often rather than arming one 4-hour timer: a timer's clock
        // stops while the Mac sleeps, so a laptop opened in the morning would
        // otherwise wait out the rest of the interval before syncing.
        checkTimer = Timer.scheduledTimer(withTimeInterval: 15 * 60, repeats: true) { [weak self] _ in
            self?.syncIfDue()
        }
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didWakeNotification, object: nil, queue: .main
        ) { [weak self] _ in self?.syncIfDue() }
        syncIfDue()
    }

    // MARK: Sync

    private func syncIfDue() {
        guard !syncing, readState()?.connectedAt != nil else { return }
        if let at = readState()?.lastSync.flatMap({ parseDate($0.at) }), Date().timeIntervalSince(at) < syncInterval {
            return
        }
        syncNow()
    }

    @objc private func syncNow() {
        guard !syncing else { return }
        syncing = true
        updateIcon()
        runWorker(["sync"]) { [weak self] _ in
            self?.syncing = false
            self?.updateIcon()
        }
    }

    /// Run the TypeScript worker off the main thread; its result lands in the state file.
    private func runWorker(_ args: [String], completion: @escaping (Int32) -> Void) {
        guard let worker = Bundle.main.url(forAuxiliaryExecutable: "openrecord-calendar-sync") else {
            completion(127)
            return
        }
        DispatchQueue.global(qos: .utility).async {
            let process = Process()
            process.executableURL = worker
            process.arguments = args
            process.standardOutput = FileHandle.nullDevice
            // One run's log at a time, local only.
            FileManager.default.createFile(atPath: logURL.path, contents: nil)
            process.standardError = try? FileHandle(forWritingTo: logURL)

            var status: Int32 = 1
            do {
                try process.run()
                let deadline = DispatchTime.now() + workerTimeout
                DispatchQueue.global().asyncAfter(deadline: deadline) {
                    if process.isRunning { process.terminate() }
                }
                process.waitUntilExit()
                status = process.terminationStatus
            } catch {
                status = 126
            }
            DispatchQueue.main.async { completion(status) }
        }
    }

    // MARK: Menu

    private func updateIcon() {
        let failed = readState()?.lastSync?.ok == false
        let symbol = syncing ? "arrow.triangle.2.circlepath" : failed ? "calendar.badge.exclamationmark" : "calendar"
        let image = NSImage(systemSymbolName: symbol, accessibilityDescription: "OpenRecord Calendar")
        image?.isTemplate = true
        statusItem.button?.image = image
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        let state = readState()

        menu.addItem(disabled("MyChart → Google Calendar"))
        if syncing {
            menu.addItem(disabled("Syncing…"))
        } else if state?.connectedAt == nil {
            menu.addItem(disabled("Not connected. Ask Claude to connect Google Calendar."))
        } else if let last = state?.lastSync {
            let when = parseDate(last.at).map { DateFormatter.localizedString(from: $0, dateStyle: .short, timeStyle: .short) } ?? last.at
            let count = last.synced == 1 ? "1 appointment" : "\(last.synced) appointments"
            menu.addItem(disabled("Last synced \(when) · \(count)"))
            for account in last.accounts where account.error != nil {
                menu.addItem(disabled("⚠︎ \(account.account): \(account.error!)"))
            }
        } else {
            menu.addItem(disabled("Not synced yet"))
        }

        menu.addItem(.separator())
        let sync = NSMenuItem(title: "Sync Now", action: #selector(syncNow), keyEquivalent: "r")
        sync.target = self
        sync.isEnabled = !syncing && state?.connectedAt != nil
        menu.addItem(sync)
        menu.addItem(action("Open Google Calendar", #selector(openCalendar)))
        menu.addItem(.separator())
        menu.addItem(action("Turn Off Calendar Sync…", #selector(turnOff)))
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
    }

    private func disabled(_ title: String) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.isEnabled = false
        return item
    }

    private func action(_ title: String, _ selector: Selector) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: selector, keyEquivalent: "")
        item.target = self
        return item
    }

    @objc private func openCalendar() {
        NSWorkspace.shared.open(URL(string: "https://calendar.google.com")!)
    }

    /// Revoke Google access, stop starting at login, and quit. The calendar and
    /// its events stay in Google Calendar for the user to keep or delete.
    @objc private func turnOff() {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Turn off calendar sync?"
        alert.informativeText = "OpenRecord stops updating your “MyChart Appointments” calendar and removes its access to your Google account. Events already on the calendar stay there."
        alert.addButton(withTitle: "Turn Off")
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }

        runWorker(["disconnect"]) { _ in
            try? FileManager.default.removeItem(at: agentPlistURL)
            // Unloading our own launchd job also ends this process.
            let launchctl = Process()
            launchctl.executableURL = URL(fileURLWithPath: "/bin/launchctl")
            launchctl.arguments = ["bootout", "gui/\(getuid())/\(agentLabel)"]
            try? launchctl.run()
            launchctl.waitUntilExit()
            NSApp.terminate(nil)
        }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
