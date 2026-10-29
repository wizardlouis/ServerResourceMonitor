import Foundation
let cores = (0..<256).map { CoreUsage(id: $0, percent: Double($0 % 101)) }
for k in [1, 2, 4, 8, 16] {
    let groups = groupCores(cores, size: k)
    assert(groups.count == 256 / k)
    assert(groups.flatMap(\.ids) == Array(0..<256))
    assert(abs(groups[0].percent! - Double(k - 1) / 2) < 0.00001)
}
let tail = groupCores([CoreUsage(id: 7, percent: 100), CoreUsage(id: 2, percent: 0), CoreUsage(id: 12, percent: 60)], size: 2)
assert(tail[0].ids == [2, 7] && tail[0].percent == 50)
assert(tail[1].ids == [12] && tail[1].percent == 60)
assert(groupCores([], size: 16).isEmpty)
assert(groupCores([CoreUsage(id: 0, percent: nil), CoreUsage(id: 1, percent: 100)], size: 2)[0].percent == nil)
print("PASS: 5 granularities, averages, complete membership, partial final group, unknown metrics")
