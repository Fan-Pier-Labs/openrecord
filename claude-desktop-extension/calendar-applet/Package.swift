// swift-tools-version:5.9
// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import PackageDescription

let package = Package(
    name: "OpenRecordCalendar",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "OpenRecordCalendar", path: "Sources/OpenRecordCalendar"),
    ]
)
