import Foundation
struct CoreUsage: Decodable, Identifiable, Equatable { var id: Int; var percent: Double? }
struct CoreGroup: Identifiable, Equatable {
    var ids: [Int]
    var percent: Double?
    var id: Int { ids.first ?? 0 }
    var label: String { ids.count == 1 ? "\(id)" : "\(id)–\(ids.last ?? id)" }
    var detail: String { ids.map(String.init).joined(separator: ", ") }
}
func groupCores(_ cores: [CoreUsage], size: Int) -> [CoreGroup] {
    let k = [1, 2, 4, 8, 16].contains(size) ? size : 1
    let sorted = cores.sorted { $0.id < $1.id }
    return stride(from: 0, to: sorted.count, by: k).map { start in
        let chunk = Array(sorted[start..<min(start + k, sorted.count)])
        let values = chunk.compactMap(\.percent)
        let average = values.count == chunk.count ? values.reduce(0, +) / Double(values.count) : nil
        return CoreGroup(ids: chunk.map(\.id), percent: average)
    }
}
