import Foundation

struct ServerColumn: Codable, Identifiable, Equatable {
    var id: String = UUID().uuidString
    var name: String
    var members: [String]
}
struct Config: Codable {
    var servers: [String]
    var columns: [ServerColumn]? = nil
}
// Every configured server appears exactly once; missing/new servers become columns.
func normalizedColumns(_ columns: [ServerColumn], servers: [String]) -> [ServerColumn] {
    let valid = Set(servers)
    var seen = Set<String>(), ids = Set<String>()
    var result: [ServerColumn] = []
    for var column in columns {
        column.members = column.members.filter { valid.contains($0) && seen.insert($0).inserted }
        guard !column.members.isEmpty else { continue }
        if !ids.insert(column.id).inserted { column.id = UUID().uuidString; ids.insert(column.id) }
        if column.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { column.name = column.members.joined(separator: " + ") }
        result.append(column)
    }
    for server in servers where seen.insert(server).inserted {
        result.append(ServerColumn(name: server, members: [server]))
    }
    return result
}
