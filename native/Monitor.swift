import SwiftUI
import AppKit

struct GPU: Decodable, Identifiable {
    var index: String; var name: String; var uuid: String
    var util: Double?; var used: Double?; var total: Double?; var temp: Double?; var power: Double?; var power_limit: Double?
    var id: String { uuid }
}
struct Job: Decodable { var uuid: String; var pid: String; var name: String; var memory: Double?; var user: String? }
struct Metrics: Decodable {
    var cpu_cores: [CoreUsage]?
    var hostname: String; var cpu_percent: Double; var cpu_count: Int; var load: [Double]
    var memory_total: Double; var memory_used: Double; var memory_percent: Double
    var gpus: [GPU]; var processes: [Job]; var gpu_error: String?
}
struct Point { var cpu: Double; var gpu: Double? }
struct Host: Identifiable {
    var id: String; var data: Metrics?; var error: String?; var updated: Date?
    var busy = false; var history: [Point] = []
    var online: Bool { data != nil && error == nil }
}


final class SSHRunner {
    private let lock = NSLock()
    private var processes: [UUID: Process] = [:]
    private var stopped = false
    func stop() {
        lock.lock(); stopped = true; let all = Array(processes.values); lock.unlock()
        all.forEach { if $0.isRunning { $0.terminate() } }
    }
    func read(_ alias: String) throws -> Metrics {
        let p = Process(), input = Pipe(), output = Pipe(), errors = Pipe(), id = UUID()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/ssh")
        p.arguments = ["-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=5", "-o", "ServerAliveInterval=5", "-o", "ServerAliveCountMax=1", alias, "python3 -"]
        p.standardInput = input; p.standardOutput = output; p.standardError = errors
        let script = try Data(contentsOf: Bundle.main.url(forResource: "collector", withExtension: "py")!)
        lock.lock()
        if stopped { lock.unlock(); throw NSError(domain: "Monitor", code: 1, userInfo: [NSLocalizedDescriptionKey: "采集已停止"]) }
        do { try p.run(); processes[id] = p; lock.unlock() } catch { lock.unlock(); throw error }
        defer { lock.lock(); processes.removeValue(forKey: id); lock.unlock() }
        let timeout = DispatchWorkItem { if p.isRunning { p.terminate() } }
        DispatchQueue.global().asyncAfter(deadline: .now()+18, execute: timeout)
        input.fileHandleForWriting.write(script); try? input.fileHandleForWriting.close()
        let errTask = DispatchGroup()
        var stderr = Data()
        errTask.enter()
        DispatchQueue.global().async { stderr = errors.fileHandleForReading.readDataToEndOfFile(); errTask.leave() }
        let stdout = output.fileHandleForReading.readDataToEndOfFile()
        p.waitUntilExit(); errTask.wait(); timeout.cancel()
        guard p.terminationStatus == 0 else {
            let message = String(data: stderr, encoding: .utf8) ?? ""
            throw NSError(domain: "SSH", code: Int(p.terminationStatus), userInfo: [NSLocalizedDescriptionKey: message.isEmpty ? "连接超时或采集被中断" : String(message.prefix(500))])
        }
        return try JSONDecoder().decode(Metrics.self, from: stdout)
    }
}

final class Monitor: ObservableObject {
    @Published var hosts: [Host] = []
    @Published var columns: [ServerColumn] = []
    @Published var paused = false
    @Published var message = ""
    let runner = SSHRunner()
    private var timer: Timer?
    private var generations: [String: UUID] = [:]
    let configURL: URL
    init() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("ServerResourceMonitor")
        configURL = dir.appendingPathComponent("servers.json")
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let source = FileManager.default.fileExists(atPath: configURL.path) ? configURL : Bundle.main.url(forResource: "servers", withExtension: "json")!
            let config = try JSONDecoder().decode(Config.self, from: Data(contentsOf: source))
            var seen = Set<String>()
            hosts = config.servers.filter { seen.insert($0).inserted }.map { Host(id: $0) }
            columns = normalizedColumns(config.columns ?? [], servers: hosts.map(\.id))
        } catch { hosts = []; message = "配置读取失败，请检查配置文件或添加 SSH 别名：\(error.localizedDescription)" }
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.refresh() }
    }
    func save(_ aliases: [String]) throws {
        try JSONEncoder().encode(Config(servers: aliases, columns: normalizedColumns(columns, servers: aliases))).write(to: configURL, options: .atomic)
    }
    func add(_ text: String) {
        let alias = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard alias.range(of: "^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$", options: .regularExpression) != nil else { message = "请输入有效的 SSH Host 别名"; return }
        guard !hosts.contains(where: {$0.id == alias}) else { message = "该服务器已在列表中"; return }
        guard hosts.count < 16 else { message = "当前最多支持 16 台服务器"; return }
        do { try save(hosts.map(\.id)+[alias]); hosts.append(Host(id: alias)); columns = normalizedColumns(columns, servers: hosts.map(\.id)); message = ""; refresh() }
        catch { message = "无法保存配置：\(error.localizedDescription)" }
    }
    func remove(_ alias: String) {
        do { try save(hosts.map(\.id).filter {$0 != alias}); hosts.removeAll {$0.id == alias}; columns = normalizedColumns(columns, servers: hosts.map(\.id)); generations.removeValue(forKey: alias); message = "" }
        catch { message = "无法保存配置：\(error.localizedDescription)" }
    }
    @discardableResult func setColumns(_ proposed: [ServerColumn]) -> Bool {
        let next = normalizedColumns(proposed, servers: hosts.map(\.id))
        do {
            try JSONEncoder().encode(Config(servers: hosts.map(\.id), columns: next)).write(to: configURL, options: .atomic)
            columns = next; message = ""; return true
        } catch { message = "无法保存分组：\(error.localizedDescription)"; return false }
    }
    func moveColumn(_ id: String, step: Int) {
        guard let i = columns.firstIndex(where: { $0.id == id }), columns.indices.contains(i + step) else { return }
        var next = columns; next.swapAt(i, i + step); setColumns(next)
    }
    @discardableResult func editColumn(_ id: String?, name: String, members: [String]) -> Bool {
        guard !members.isEmpty else { message = "请至少选择一台服务器"; return false }
        let title = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { message = "请输入分组名称"; return false }
        var next = columns
        let index = id.flatMap { target in next.firstIndex(where: { $0.id == target }) } ?? next.count
        let previousMembers = id.flatMap { target in next.first(where: { $0.id == target })?.members } ?? []
        next = next.filter { $0.id != id }.map { column in
            var c = column; c.members.removeAll { members.contains($0) }; return c
        }
        next.insert(ServerColumn(id: id ?? UUID().uuidString, name: title, members: members), at: min(index, next.count))
        let removed = previousMembers.filter { !members.contains($0) }
        next.insert(contentsOf: removed.map { ServerColumn(name: $0, members: [$0]) }, at: min(index + 1, next.count))
        return setColumns(next)
    }
    func dissolveColumn(_ id: String) {
        guard let i = columns.firstIndex(where: { $0.id == id }) else { return }
        var next = columns
        let singles = next.remove(at: i).members.map { ServerColumn(name: $0, members: [$0]) }
        next.insert(contentsOf: singles, at: i); setColumns(next)
    }
    func refresh() {
        guard !paused else { return }
        for i in hosts.indices where !hosts[i].busy {
            hosts[i].busy = true
            let alias = hosts[i].id, generation = UUID()
            generations[alias] = generation
            DispatchQueue.global(qos: .utility).async { [weak self] in
                guard let self = self else { return }
                let result = Result { try self.runner.read(alias) }
                DispatchQueue.main.async {
                    guard self.generations[alias] == generation, let index = self.hosts.firstIndex(where: {$0.id == alias}) else { return }
                    var updated = self.hosts[index]
                    updated.busy = false
                    switch result {
                    case .success(let data):
                        updated.data = data; updated.error = nil; updated.updated = Date()
                        let utils = data.gpus.compactMap(\.util)
                        updated.history.append(Point(cpu: data.cpu_percent, gpu: utils.isEmpty ? nil : utils.reduce(0,+)/Double(utils.count)))
                        updated.history = Array(updated.history.suffix(120))
                    case .failure(let error): updated.error = error.localizedDescription
                    }
                    self.hosts[index] = updated
                }
            }
        }
    }
    func shutdown() { timer?.invalidate(); runner.stop() }
}

let bg = Color(red: 0.04, green: 0.065, blue: 0.105)
let panel = Color(red: 0.075, green: 0.115, blue: 0.17)
let mint = Color(red: 0.36, green: 0.88, blue: 0.70)
func n(_ value: Double?, _ decimals: Int = 0) -> String { value.map { String(format: "%.*f", decimals, $0) } ?? "—" }
struct Meter: View {
    var value: Double?; var tint = mint
    var body: some View { GeometryReader { g in
        ZStack(alignment: .leading) { Capsule().fill(Color.white.opacity(0.08)); Capsule().fill(tint).frame(width: g.size.width * CGFloat(min(100,max(0,value ?? 0)))/100) }
    }.frame(height: 5) }
}
struct Trend: View {
    var values: [Point]
    var body: some View { Canvas { context, size in
        guard values.count > 1 else { return }
        for gpu in [false, true] {
            var path = Path(); var connected = false
            for (i,v) in values.enumerated() {
                guard let y = gpu ? v.gpu : v.cpu else { connected = false; continue }
                let x: CGFloat = CGFloat(i) / CGFloat(values.count - 1) * size.width
                let fraction: CGFloat = CGFloat(min(100.0, max(0.0, y))) / 100.0
                let vertical: CGFloat = (1.0 - fraction) * (size.height - 8.0) + 4.0
                let p = CGPoint(x: x, y: vertical)
                if connected { path.addLine(to:p) } else { path.move(to:p); connected = true }
            }
            context.stroke(path, with: .color(gpu ? .blue : mint), lineWidth: 2)
        }
    }.frame(height:60).background(bg).cornerRadius(8) }
}
struct GPUCard: View {
    var gpu: GPU
    var memoryPercent: Double? {
        gpu.total.flatMap { total in gpu.used.map { total > 0 ? $0 / total * 100 : 0 } }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Text("#\(gpu.index)  \(shortGPUName(gpu.name))").font(.system(size:13,weight:.semibold)).lineLimit(1).minimumScaleFactor(0.85).truncationMode(.middle)
                Spacer(minLength: 4)
                Text("\(n(gpu.total.map {$0/1024},1)) GiB").font(.system(size:12,weight:.semibold)).fixedSize()
            }
            .help(gpu.name)
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment:.leading, spacing:7) {
                    Text("GPU 利用率").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    Text("\(n(gpu.util))%").font(.title2.bold())
                    Meter(value:gpu.util)
                }.frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment:.leading, spacing:7) {
                    Text("显存占用").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    Text("\(n(memoryPercent,1))%").font(.title2.bold())
                    Meter(value:memoryPercent,tint:.blue)
                }.frame(maxWidth: .infinity, alignment: .leading)
            }
            Text("\(n(gpu.temp))°C · \(n(gpu.power)) W").foregroundStyle(.secondary).font(.caption).lineLimit(1)
        }.padding(14).background(bg).cornerRadius(10)
    }
}
struct GlassArtwork: View {
    var tint: Color
    var body: some View {
        ZStack {
            // Recessed metal bezel and the rounded glass lens.
            Circle().fill(LinearGradient(colors: [.black, Color.white.opacity(0.24)], startPoint: .top, endPoint: .bottom))
            Circle().fill(tint).padding(1.5)
            Circle().fill(RadialGradient(colors: [.clear, .black.opacity(0.55)], center: .init(x: 0.42, y: 0.32), startRadius: 1, endRadius: 11)).padding(1.5)
            Circle().fill(LinearGradient(colors: [.white.opacity(0.34), .clear, .black.opacity(0.15)], startPoint: .topLeading, endPoint: .bottomTrailing)).padding(1.5)
            Ellipse().fill(LinearGradient(colors: [.white.opacity(0.92), .white.opacity(0.08)], startPoint: .top, endPoint: .bottom))
                .frame(width: 10, height: 6).offset(x: -1, y: -4)
            Ellipse().fill(tint.opacity(0.70)).frame(width: 7, height: 2).blur(radius: 0.6).offset(y: 5)
            Circle().strokeBorder(.white.opacity(0.16), lineWidth: 0.5).padding(1.5)
        }
        .frame(width: 19, height: 19)
        .shadow(color: tint.opacity(0.22), radius: 3)
        .shadow(color: .black.opacity(0.65), radius: 1, x: 0, y: 1)
        .accessibilityHidden(true)
    }
}

// Only 102 tiny images can be cached, regardless of server count or uptime.
@MainActor final class LampCache {
    static let shared = LampCache()
    private var images: [Int: NSImage] = [:]
    func image(level: Int) -> NSImage {
        if let image = images[level] { return image }
        let tint: Color = level < 0 ? .gray : Color(hue: (1 - Double(level) / 100) / 3, saturation: 0.78, brightness: 0.88)
        let renderer = ImageRenderer(content: GlassArtwork(tint: tint).padding(4))
        renderer.scale = 2
        let image = renderer.nsImage ?? NSImage(size: NSSize(width: 27, height: 27))
        images[level] = image
        return image
    }
}
struct CoreCell: View, Equatable {
    var core: CoreGroup
    var body: some View {
        let level = core.percent.map { Int(min(100, max(0, $0)).rounded()) } ?? -1
        VStack(spacing: 2) {
            Image(nsImage: LampCache.shared.image(level: level)).resizable().frame(width: 27, height: 27).frame(width: 19, height: 19).accessibilityHidden(true)
            Text(core.label).font(.system(size: 8, weight: .medium, design: .monospaced)).lineLimit(1).minimumScaleFactor(0.65).foregroundStyle(.secondary)
            Text(core.percent.map { "\(Int($0.rounded()))%" } ?? "—").font(.system(size: 8, weight: .semibold, design: .monospaced)).foregroundStyle(Color.white.opacity(0.85))
        }
        .frame(maxWidth: .infinity).frame(height: 43)
        .help("逻辑核心 \(core.detail)\n\(core.ids.count) 核心平均占用：\(n(core.percent, 1))%")
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("逻辑核心 \(core.label)，\(core.ids.count) 核心平均占用 \(n(core.percent, 1)) 百分比")
    }
}
struct CoreGrid: View, Equatable {
    var cores: [CoreUsage]
    var groupSize: Int
    var select: (Int) -> Void
    static func == (lhs: CoreGrid, rhs: CoreGrid) -> Bool { lhs.cores == rhs.cores && lhs.groupSize == rhs.groupSize }
    var groups: [CoreGroup] { groupCores(cores, size: groupSize) }
    var columns: Int { min(16, max(1, groups.count)) }
    func color(_ value: Double?) -> Color {
        guard let value = value else { return .gray }
        return Color(hue: (1 - min(100, max(0, value)) / 100) / 3, saturation: 0.78, brightness: 0.88)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("CPU 核心占用 · \(cores.count) 个逻辑核心").font(.caption)
                Spacer()
                Menu {
                    ForEach([1, 2, 4, 8, 16], id: \.self) { size in
                        Button { select(size) } label: {
                            if groupSize == size { Label(size == 1 ? "单个逻辑核心" : "\(size) 核心合并", systemImage: "checkmark") }
                            else { Text(size == 1 ? "单个逻辑核心" : "\(size) 核心合并") }
                        }
                    }
                } label: {
                    Text(groupSize == 1 ? "单个逻辑核心" : "\(groupSize) 核心合并")
                }.menuStyle(.borderlessButton).fixedSize().help("选择 CPU 核心显示粒度")
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 3), count: columns), spacing: 5) {
                ForEach(groups) { core in
                    CoreCell(core: core).equatable()
                }
            }
            Text("\(groups.count) 盏灯 · \((groups.count + columns - 1) / columns) 行 × \(columns) 列 · 每灯最多 \(groupSize) 个核心的平均值").font(.caption2).foregroundStyle(.secondary)
            HStack(spacing: 6) {
                Text("低 0%").foregroundStyle(.secondary)
                LinearGradient(colors: [color(0), color(50), color(100)], startPoint: .leading, endPoint: .trailing).frame(width: 100, height: 6).cornerRadius(3)
                Text("50% → 高 100%").foregroundStyle(.secondary)
                Spacer()
                Text("悬停查看精确值").foregroundStyle(.secondary)
            }.font(.caption2)
        }.padding(12).background(bg).cornerRadius(10)
    }
}

struct HostCard: View {
    var host: Host; var remove: () -> Void
    @State private var showJobs = false
    @State private var groupSize = 1
    var body: some View {
        VStack(alignment:.leading,spacing:16) {
            HStack {
                VStack(alignment:.leading,spacing:4) { Text(host.id).font(.title2.bold()); Text(host.data?.hostname ?? "等待采集").font(.caption).foregroundStyle(.secondary) }
                Spacer()
                if host.busy { ProgressView().controlSize(.small) }
                Text(host.error != nil ? "● 连接中断" : host.online ? "● 在线" : "连接中").font(.caption).foregroundStyle(host.error != nil ? .orange : mint)
                Button(action:remove) { Image(systemName:"xmark") }.buttonStyle(.borderless).help("移除此服务器监控")
            }
            if let error = host.error { Text("数据已过期 / 暂不可用\n\(error)").font(.caption).foregroundStyle(.orange).textSelection(.enabled) }
            if let d = host.data {
                HStack(spacing:24) {
                    VStack(alignment:.leading,spacing:8) { Text("CPU 使用率").foregroundStyle(.secondary); Text("\(n(d.cpu_percent,1))%").font(.title.bold()); Meter(value:d.cpu_percent); Text("\(d.cpu_count) 逻辑核心 · 负载 \(n(d.load.first,2))").font(.caption).foregroundStyle(.secondary) }
                    VStack(alignment:.leading,spacing:8) { Text("内存使用率").foregroundStyle(.secondary); Text("\(n(d.memory_percent,1))%").font(.title.bold()); Meter(value:d.memory_percent,tint:.blue); Text("\(n(d.memory_used/1073741824,1)) / \(n(d.memory_total/1073741824,1)) GiB").font(.caption).foregroundStyle(.secondary) }
                }
                if let cores = d.cpu_cores, !cores.isEmpty { CoreGrid(cores: cores, groupSize: groupSize) { size in
                    groupSize = size
                    UserDefaults.standard.set(size, forKey: "coreGrouping." + host.id)
                }.equatable() }
                Text("GPU · \(d.gpus.count) 张显卡").font(.caption).foregroundStyle(.secondary)
                if let error = d.gpu_error { Text("GPU 指标不可用：\(error)").font(.caption).foregroundStyle(.orange) }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                    ForEach(d.gpus) { GPUCard(gpu:$0) }
                }
                HStack { Text("近期趋势"); Text("CPU").foregroundStyle(mint); Text("GPU 均值").foregroundStyle(.blue) }.font(.caption)
                Trend(values:host.history)
                DisclosureGroup("GPU 计算进程 · \(d.processes.count)",isExpanded:$showJobs) {
                    VStack(alignment:.leading,spacing:8) {
                        if d.processes.isEmpty { Text("暂无可见计算进程").foregroundStyle(.secondary) }
                        if !d.processes.isEmpty {
                            HStack(spacing: 8) {
                                Text("GPU").frame(width: 28, alignment: .leading)
                                Text("PID").frame(width: 58, alignment: .leading)
                                Text("用户").frame(width: 70, alignment: .leading)
                                Text("进程").frame(maxWidth: .infinity, alignment: .leading)
                                Text("显存 MiB").frame(width: 68, alignment: .trailing)
                            }.font(.caption2).foregroundStyle(.secondary)
                            Divider()
                        }
                        ForEach(Array(d.processes.enumerated()),id:\.offset) { _,job in
                            HStack(spacing: 8) {
                                Text(d.gpus.first(where: {$0.uuid == job.uuid})?.index ?? "—").frame(width: 28, alignment: .leading)
                                Text(job.pid).frame(width: 58, alignment: .leading)
                                Text(job.user ?? "未知").foregroundStyle(job.user == nil ? Color.secondary : mint)
                                    .lineLimit(1).truncationMode(.middle).frame(width: 70, alignment: .leading)
                                    .help(job.user ?? "无法读取所属用户：进程可能已结束或访问权限不足")
                                Text(URL(fileURLWithPath:job.name).lastPathComponent).lineLimit(1).help(job.name).frame(maxWidth: .infinity, alignment: .leading)
                                Text(n(job.memory)).frame(width: 68, alignment: .trailing)
                            }.font(.caption).textSelection(.enabled)
                        }
                    }.padding(.top,8)
                }.font(.caption)
                if let date = host.updated { Text("最后成功采集 \(date.formatted(date:.omitted,time:.standard))").font(.caption2).foregroundStyle(.secondary) }
            }
        }.onAppear {
            let saved = UserDefaults.standard.integer(forKey: "coreGrouping." + host.id)
            groupSize = [1, 2, 4, 8, 16].contains(saved) ? saved : 1
        }.padding(20).background(panel).cornerRadius(14).overlay(RoundedRectangle(cornerRadius:14).stroke(host.error == nil ? Color.white.opacity(0.08) : Color.orange.opacity(0.6)))
    }
}
// Handles plain arrow keys only while a server badge is selected in this window.
struct ServerOrderInput: NSViewRepresentable {
    var clearSelection: () -> Void
    var moveSelection: (Int) -> Bool
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        context.coordinator.view = view
        context.coordinator.install()
        return view
    }
    func updateNSView(_ view: NSView, context: Context) {
        context.coordinator.clearSelection = clearSelection
        context.coordinator.moveSelection = moveSelection
    }
    static func dismantleNSView(_ view: NSView, coordinator: Coordinator) { coordinator.stop() }
    final class Coordinator {
        weak var view: NSView?
        var clearSelection: (() -> Void)?
        var moveSelection: ((Int) -> Bool)?
        var events: Any?
        func install() {
            events = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .keyDown]) { [weak self] event in
                guard let self else { return event }
                if event.type == .leftMouseDown {
                    // A badge's button action selects it after this mouse-down reset.
                    self.clearSelection?()
                } else if let window = self.view?.window, window.isKeyWindow,
                          event.window === window,
                          event.modifierFlags.intersection([.command, .control, .option, .shift]).isEmpty,
                          [123, 124, 125, 126].contains(event.keyCode) {
                    if self.moveSelection?([123: -1, 124: 1, 125: 2, 126: -2][Int(event.keyCode)]!) == true { return nil }
                }
                return event
            }
        }
        func stop() {
            if let events { NSEvent.removeMonitor(events) }
            events = nil
        }
        deinit { stop() }
    }
}
struct ColumnEditor: View {
    @ObservedObject var monitor: Monitor
    var column: ServerColumn
    var isNew: Bool
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var members: [String] = []
    @State private var selected: String?
    func moveMember(_ step: Int) -> Bool {
        guard abs(step) == 2, let selected, let i = members.firstIndex(of: selected) else { return false }
        let target = i + step / 2
        if members.indices.contains(target) { members.swapAt(i, target) }
        return true
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(isNew ? "创建服务器分组" : "编辑服务器分组").font(.title2.bold())
            TextField("分组名称", text: $name).textFieldStyle(.roundedBorder)
            Text("勾选成员；已有分组中的服务器将移入此组。").font(.caption).foregroundStyle(.secondary)
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(monitor.hosts) { host in
                        Toggle(host.id, isOn: Binding(get: { members.contains(host.id) }, set: { on in
                            if on { members.append(host.id) } else { members.removeAll { $0 == host.id } }
                        }))
                    }
                    Divider()
                    Text("组内从上到下排列 · 点击成员，再按 ↑ / ↓").font(.caption)
                    ForEach(members, id: \.self) { id in
                        Button { selected = id } label: {
                            Text(id).frame(maxWidth: .infinity, alignment: .leading).padding(8)
                                .background(selected == id ? mint.opacity(0.25) : panel).cornerRadius(6)
                        }.buttonStyle(.plain).accessibilityValue(selected == id ? "已选中" : "未选中")
                    }
                }
            }.frame(maxHeight: 340)
            if !monitor.message.isEmpty { Text(monitor.message).foregroundStyle(.orange).font(.caption) }
            HStack {
                Button("取消") { dismiss() }
                Spacer()
                Button("保存") {
                    if monitor.editColumn(isNew ? nil : column.id, name: name, members: members) { dismiss() }
                }.disabled(members.isEmpty || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }.padding(24).frame(width: 400)
        .background(ServerOrderInput(clearSelection: { selected = nil }, moveSelection: moveMember))
        .onAppear { name = column.name; members = column.members }
    }
}
struct ServerOrderPicker: View {
    @ObservedObject var monitor: Monitor
    @State private var selectedID: String?
    @State private var editing: ServerColumn?
    @State private var creating = false
    func moveSelection(_ step: Int) -> Bool {
        guard abs(step) == 1, let selectedID, monitor.columns.contains(where: { $0.id == selectedID }) else { return false }
        monitor.moveColumn(selectedID, step: step); return true
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("点击列标牌，再按 ← / → 调整顺序").font(.headline)
                Spacer()
                Button("创建分组") { creating = true; editing = ServerColumn(name: "新分组", members: []) }
            }
            Text("每列可包含多台服务器；编辑分组可改名、选择成员和调整上下顺序。").font(.caption).foregroundStyle(.secondary)
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: true) {
                    HStack(spacing: 10) {
                        ForEach(monitor.columns) { column in
                            VStack(spacing: 8) {
                                Button { selectedID = column.id } label: {
                                    Text("\(column.name) · \(column.members.count) 台")
                                        .font(.system(size: 13, weight: .semibold))
                                        .padding(10).background(selectedID == column.id ? mint.opacity(0.18) : panel)
                                        .cornerRadius(8)
                                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(selectedID == column.id ? mint : Color.white.opacity(0.12)))
                                }.buttonStyle(.plain).accessibilityValue(selectedID == column.id ? "已选中" : "未选中")
                                HStack {
                                    Button("编辑分组") { creating = false; editing = column }.accessibilityLabel("编辑分组 \(column.name)")
                                    if column.members.count > 1 {
                                        Button("解散") { monitor.dissolveColumn(column.id) }
                                    }
                                }.font(.caption)
                            }.id(column.id)
                        }
                    }.padding(2)
                }
                .onChange(of: monitor.columns.map(\.id)) { _ in if let selectedID { proxy.scrollTo(selectedID) } }
            }
            if !monitor.message.isEmpty { Text(monitor.message).font(.caption).foregroundStyle(.orange) }
        }.padding(12)
        .background(ServerOrderInput(clearSelection: { selectedID = nil }, moveSelection: moveSelection))
        .sheet(item: $editing) { column in ColumnEditor(monitor: monitor, column: column, isNew: creating) }
        .onDisappear { selectedID = nil }
    }
}
struct Dashboard: View {
    @ObservedObject var monitor: Monitor
    @State private var alias = ""
    @State private var showServerOrder = false
    @AppStorage("overviewCollapsed") private var overviewCollapsed = false
    var online: [Host] { monitor.hosts.filter(\.online) }
    var gpus: [GPU] { online.flatMap {$0.data?.gpus ?? []} }
    func tile(_ title:String,_ value:String) -> some View {
        VStack(alignment:.leading,spacing:10) { Text(title).foregroundStyle(.secondary); Text(value).font(.system(size:26,weight:.semibold)).monospacedDigit() }.frame(maxWidth:.infinity,alignment:.leading).padding(18).background(panel).cornerRadius(12)
    }
    var body: some View {
        GeometryReader { geometry in
            VStack(alignment:.leading,spacing:18) {
                HStack {
                    if overviewCollapsed {
                        Text("服务器资源监控器").font(.headline)
                        Text("\(online.count)/\(monitor.hosts.count) 台在线").font(.caption).foregroundStyle(.secondary)
                    } else {
                        VStack(alignment:.leading,spacing:8) { Text("COMPUTE OBSERVATORY").font(.caption).tracking(3).foregroundStyle(mint); Text("服务器资源监控器").font(.largeTitle.bold()); Text("本地客户端 · 多服务器实时资源总览").foregroundStyle(.secondary) }
                    }
                    Spacer()
                    Button(monitor.paused ? "继续采集" : "暂停采集") { monitor.paused.toggle(); monitor.refresh() }
                    Button { monitor.refresh() } label: { Image(systemName:"arrow.clockwise") }.help("立即刷新").disabled(monitor.paused)
                    Button { overviewCollapsed.toggle() } label: { Image(systemName: "ellipsis.circle") }
                        .help(overviewCollapsed ? "显示顶部总览" : "隐藏顶部总览")
                        .accessibilityLabel(overviewCollapsed ? "显示顶部总览" : "隐藏顶部总览")
                }
                if !overviewCollapsed {
                HStack { TextField("SSH 别名，例如 my-server",text:$alias).textFieldStyle(.roundedBorder).frame(width:220).onSubmit { monitor.add(alias) }; Button("添加服务器") { monitor.add(alias); if monitor.message.isEmpty {alias = ""} }; Spacer(); Text(monitor.paused ? "已暂停 · 显示最后采样数据" : "每 5 秒自动采集").font(.caption).foregroundStyle(monitor.paused ? .orange : .secondary) }
                if !monitor.message.isEmpty { Text(monitor.message).foregroundStyle(.orange).font(.callout) }
                HStack(spacing:14) { tile("在线服务器","\(online.count) / \(monitor.hosts.count)"); tile("在线 GPU","\(gpus.count) 张"); tile("可用显存合计","\(n(gpus.reduce(0) { $0 + max(0,($1.total ?? 0)-($1.used ?? 0)) }/1024,1)) GiB"); tile("逻辑 CPU 核心","\(online.reduce(0) {$0+($1.data?.cpu_count ?? 0)})") }
                }
                HStack {
                    Text("服务器 · \(monitor.hosts.count) 台").font(.caption).foregroundStyle(.secondary)
                    Button {
                        showServerOrder.toggle()
                    } label: {
                        Label("分组与顺序", systemImage: "arrow.left.arrow.right")
                    }
                    .buttonStyle(.borderless)
                    .font(.caption)
                    .help("创建分组、编辑成员和调整列顺序")
                    Spacer()
                    Text("左右滚动切换列 · 上下滚动查看详情").font(.caption).foregroundStyle(.secondary)
                }
                if showServerOrder {
                    ServerOrderPicker(monitor: monitor)
                }
                ScrollView([.horizontal, .vertical], showsIndicators: true) {
                    HStack(alignment: .top, spacing: 18) {
                        ForEach(monitor.columns) { column in
                            VStack(alignment: .leading, spacing: 14) {
                                Text("\(column.name) · \(column.members.count) 台").font(.headline).padding(.horizontal, 4)
                                ForEach(column.members, id: \.self) { alias in
                                    if let host = monitor.hosts.first(where: { $0.id == alias }) {
                                        HostCard(host: host) { monitor.remove(host.id) }
                                    }
                                }
                            }.frame(width: max(440, (geometry.size.width - 74) / 2), alignment: .topLeading)
                        }
                    }.padding(.bottom, 14).padding(.trailing, 4)
                }.frame(maxWidth: .infinity, maxHeight: .infinity)
                .accessibilityLabel("服务器横向浏览区域")
                if monitor.hosts.isEmpty { Text("添加 SSH 别名，开始监控服务器。").padding(30) }
                Text("SSH 只读采集 · 趋势保留最近 120 次成功采样 · 退出应用即停止采集").font(.caption).foregroundStyle(.secondary)
            }.padding(28)
        }.background(bg).preferredColorScheme(.dark).frame(minWidth:760,minHeight:560)
    }
}
final class AppDelegate: NSObject, NSApplicationDelegate {
    var monitor: Monitor?
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification:Notification) { monitor?.shutdown() }
}
@main struct ResourceApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @StateObject var monitor = Monitor()
    var body: some Scene {
        WindowGroup("服务器资源监控器") { Dashboard(monitor:monitor).onAppear {delegate.monitor = monitor; NSApp.activate(ignoringOtherApps:true)} }.defaultSize(width:1180,height:850)
        .commands { CommandGroup(replacing:.newItem) {} }
    }
}
