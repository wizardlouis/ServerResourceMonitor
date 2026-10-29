import Foundation

// Only remove known presentation metadata; preserve unfamiliar model identifiers.
func shortGPUName(_ raw: String) -> String {
    var name = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    for prefix in ["NVIDIA ", "GeForce ", "Tesla "] {
        if name.hasPrefix(prefix) { name.removeFirst(prefix.count) }
    }
    name = name.replacingOccurrences(of: " Ada Generation", with: " Ada")
    // These accelerator families encode interface and memory in nvidia-smi names.
    let pattern = #"^(A100|H100|H200|V100)(?:(?:[- ](?:SXM[0-9]*|PCIE|PCIe|[0-9]+GB|HBM[0-9]*)))*$"#
    if let match = name.range(of: pattern, options: .regularExpression) {
        let model = String(name[match]).components(separatedBy: CharacterSet(charactersIn: "- "))[0]
        return model
    }
    return name.isEmpty ? raw : name
}
