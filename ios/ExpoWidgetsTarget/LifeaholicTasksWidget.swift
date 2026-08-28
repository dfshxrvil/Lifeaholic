import AppIntents
import Charts
import SwiftUI
import WidgetKit

private enum LifeaholicWidgetConstants {
  static let appGroup = resolvedAppGroup()
  static let snapshotName = "LifeaholicSharedData"
  static let timelineKey = "__expo_widgets_\(snapshotName)_timeline"
  static let deepZinc = Color(red: 0.035, green: 0.035, blue: 0.043)
  static let elevated = Color.white.opacity(0.075)
  static let border = Color.white.opacity(0.12)
  static let primary = Color.white.opacity(0.96)
  static let secondary = Color.white.opacity(0.62)
  static let yellow = Color(red: 0.98, green: 0.80, blue: 0.08)
  static let purple = Color(red: 0.55, green: 0.42, blue: 0.96)

  /// Sideloading tools may provision a replacement App Group. Read the group
  /// granted to this extension instead of assuming the IPA's original value.
  private static func resolvedAppGroup() -> String? {
    let provisionedGroups = provisioningProfileEntitlements()["com.apple.security.application-groups"] as? [String] ?? []
    let configuredGroup = Bundle.main.object(forInfoDictionaryKey: "ExpoWidgetsAppGroupIdentifier") as? String
    return (provisionedGroups + [configuredGroup].compactMap { $0 }).first(where: {
      !$0.contains("*") && FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: $0) != nil
    })
  }

  private static func provisioningProfileEntitlements() -> [String: Any] {
    guard
      let profileURL = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
      let profileData = try? Data(contentsOf: profileURL),
      let plistStart = profileData.range(of: Data("<plist".utf8)),
      let plistEnd = profileData.range(of: Data("</plist>".utf8), options: [], in: plistStart.lowerBound..<profileData.endIndex)
    else { return [:] }

    let plistData = profileData[plistStart.lowerBound..<plistEnd.upperBound]
    guard
      let profile = try? PropertyListSerialization.propertyList(from: plistData, options: [], format: nil) as? [String: Any],
      let entitlements = profile["Entitlements"] as? [String: Any]
    else { return [:] }
    return entitlements
  }
}

private struct WidgetTask: Codable, Identifiable, Hashable {
  var id: String
  var title: String
  var priority: String
  var isCompleted: Bool
}

private struct WidgetDDay: Codable {
  var title: String
  var eventDate: String
  var daysRemaining: Int
}

private struct WidgetEvent: Codable, Identifiable {
  var id: String
  var title: String
  var startAt: Double
  var endAt: Double
}

private struct WidgetSubject: Codable, Identifiable {
  var id: String
  var name: String
  var todaySeconds: Int
}

private struct WidgetFocusState: Codable {
  var mode: String
  var subjectId: String?
  var subjectName: String?
  var startedAt: Double?
  var accumulatedSeconds: Int
}

private struct WidgetAnalyticsItem: Codable, Identifiable {
  var id: String
  var name: String
  var seconds: Int
  var colorHex: String
}

private struct WidgetAction: Codable, Identifiable {
  var id: String
  var type: String
  var taskId: String?
  var subjectId: String?
  var startedAt: Double?
  var endedAt: Double?
  var createdAt: Double
}

private struct LifeaholicSnapshot: Codable {
  var version: Int = 1
  var updatedAt: Double = Date().timeIntervalSince1970
  var tasks: [WidgetTask] = []
  var dDay: WidgetDDay?
  var events: [WidgetEvent] = []
  var subjects: [WidgetSubject] = []
  var focus: WidgetFocusState = .init(mode: "idle", accumulatedSeconds: 0)
  var analytics: [WidgetAnalyticsItem] = []
  var pendingActions: [WidgetAction] = []

  init() {}

  private enum CodingKeys: String, CodingKey {
    case version, updatedAt, tasks, dDay, events, subjects, focus, analytics, pendingActions
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    version = try values.decodeIfPresent(Int.self, forKey: .version) ?? 1
    updatedAt = try values.decodeIfPresent(Double.self, forKey: .updatedAt) ?? 0
    tasks = try values.decodeIfPresent([WidgetTask].self, forKey: .tasks) ?? []
    dDay = try values.decodeIfPresent(WidgetDDay.self, forKey: .dDay)
    events = try values.decodeIfPresent([WidgetEvent].self, forKey: .events) ?? []
    subjects = try values.decodeIfPresent([WidgetSubject].self, forKey: .subjects) ?? []
    focus = try values.decodeIfPresent(WidgetFocusState.self, forKey: .focus) ?? .init(mode: "idle", accumulatedSeconds: 0)
    analytics = try values.decodeIfPresent([WidgetAnalyticsItem].self, forKey: .analytics) ?? []
    pendingActions = try values.decodeIfPresent([WidgetAction].self, forKey: .pendingActions) ?? []
  }
}

private enum LifeaholicSharedStore {
  static func load() -> LifeaholicSnapshot {
    guard
      let appGroup = LifeaholicWidgetConstants.appGroup,
      let defaults = UserDefaults(suiteName: appGroup),
      let timeline = defaults.array(forKey: LifeaholicWidgetConstants.timelineKey) as? [[String: Any]],
      let props = timeline.last?["props"] as? [String: Any],
      JSONSerialization.isValidJSONObject(props),
      let data = try? JSONSerialization.data(withJSONObject: props),
      let snapshot = try? JSONDecoder().decode(LifeaholicSnapshot.self, from: data)
    else { return LifeaholicSnapshot() }
    return snapshot
  }

  static func save(_ snapshot: LifeaholicSnapshot) {
    guard
      let appGroup = LifeaholicWidgetConstants.appGroup,
      let defaults = UserDefaults(suiteName: appGroup),
      let data = try? JSONEncoder().encode(snapshot),
      let props = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return }
    let timestamp = Int(Date().timeIntervalSince1970 * 1000)
    defaults.set([["timestamp": timestamp, "props": props]], forKey: LifeaholicWidgetConstants.timelineKey)
  }

  static func mutate(_ mutation: (inout LifeaholicSnapshot) -> Void) {
    var snapshot = load()
    mutation(&snapshot)
    snapshot.updatedAt = Date().timeIntervalSince1970
    // Bound extension-owned queues and collections to stay well below WidgetKit memory limits.
    snapshot.pendingActions = Array(snapshot.pendingActions.suffix(64))
    snapshot.tasks = Array(snapshot.tasks.prefix(32))
    snapshot.events = Array(snapshot.events.prefix(16))
    snapshot.subjects = Array(snapshot.subjects.prefix(12))
    save(snapshot)
    WidgetCenter.shared.reloadAllTimelines()
  }
}

private struct LifeaholicEntry: TimelineEntry {
  let date: Date
  let snapshot: LifeaholicSnapshot
}

private struct LifeaholicProvider: TimelineProvider {
  func placeholder(in context: Context) -> LifeaholicEntry { .init(date: .now, snapshot: LifeaholicSnapshot()) }

  private func visibleSnapshot() -> LifeaholicSnapshot {
    var snapshot = LifeaholicSharedStore.load()
    snapshot.tasks = snapshot.tasks.filter { $0.isCompleted == false }
    return snapshot
  }

  func getSnapshot(in context: Context, completion: @escaping (LifeaholicEntry) -> Void) {
    completion(.init(date: .now, snapshot: visibleSnapshot()))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<LifeaholicEntry>) -> Void) {
    let now = Date()
    let entry = LifeaholicEntry(date: now, snapshot: visibleSnapshot())
    completion(Timeline(entries: [entry], policy: .after(now.addingTimeInterval(60))))
  }
}

private struct LiquidWidgetBackground: View {
  var body: some View {
    ZStack {
      LifeaholicWidgetConstants.deepZinc
      LinearGradient(
        colors: [LifeaholicWidgetConstants.purple.opacity(0.18), .clear, LifeaholicWidgetConstants.yellow.opacity(0.08)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
    }
  }
}

private extension View {
  func liquidWidgetContainer() -> some View {
    containerBackground(for: .widget) { LiquidWidgetBackground() }
  }

  func liquidTile(cornerRadius: CGFloat = 16) -> some View {
    background(LifeaholicWidgetConstants.elevated, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous).stroke(LifeaholicWidgetConstants.border, lineWidth: 0.5))
  }
}

private extension Color {
  init(hex: String) {
    let clean = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
    var value: UInt64 = 0
    Scanner(string: clean).scanHexInt64(&value)
    let red, green, blue: UInt64
    if clean.count == 6 { red = value >> 16; green = value >> 8 & 0xFF; blue = value & 0xFF }
    else { red = 99; green = 102; blue = 241 }
    self.init(.sRGB, red: Double(red) / 255, green: Double(green) / 255, blue: Double(blue) / 255, opacity: 1)
  }
}

private func appURL(_ route: String) -> URL {
  URL(string: "lifeaholic://\(route)")!
}

// MARK: - iOS 17 App Intents

@available(iOS 17.0, *)
private struct CompleteLifeaholicTaskIntent: AppIntent {
  static var title: LocalizedStringResource = "Complete Lifeaholic task"
  static var isDiscoverable = false
  @Parameter(title: "Task ID") var taskId: String

  init() { taskId = "" }
  init(taskId: String) { self.taskId = taskId }

  func perform() async throws -> some IntentResult {
    guard !taskId.isEmpty else { return .result() }
    var didCompleteTask = false
    LifeaholicSharedStore.mutate { snapshot in
      guard let taskIndex = snapshot.tasks.firstIndex(where: { $0.id == taskId }),
            snapshot.tasks[taskIndex].isCompleted == false else { return }
      snapshot.tasks[taskIndex].isCompleted = true
      snapshot.pendingActions.append(.init(
        id: UUID().uuidString, type: "completeTask", taskId: taskId,
        createdAt: Date().timeIntervalSince1970
      ))
      didCompleteTask = true
    }
    if didCompleteTask {
      WidgetCenter.shared.reloadTimelines(ofKind: "LifeaholicTasksWidget")
      WidgetCenter.shared.reloadTimelines(ofKind: "LifeaholicMatrixWidget")
    }
    return .result()
  }
}

@available(iOS 17.0, *)
private struct StartLifeaholicFocusIntent: AppIntent {
  static var title: LocalizedStringResource = "Start Lifeaholic focus"
  static var isDiscoverable = false
  @Parameter(title: "Subject ID") var subjectId: String
  @Parameter(title: "Subject Name") var subjectName: String

  init() { subjectId = ""; subjectName = "" }
  init(subjectId: String, subjectName: String) { self.subjectId = subjectId; self.subjectName = subjectName }

  func perform() async throws -> some IntentResult {
    guard !subjectId.isEmpty else { return .result() }
    LifeaholicSharedStore.mutate { snapshot in
      snapshot.focus = .init(
        mode: "focus", subjectId: subjectId, subjectName: subjectName,
        startedAt: Date().timeIntervalSince1970, accumulatedSeconds: 0
      )
    }
    return .result()
  }
}

@available(iOS 17.0, *)
private struct PauseLifeaholicFocusIntent: AppIntent {
  static var title: LocalizedStringResource = "Pause Lifeaholic focus"
  static var isDiscoverable = false

  func perform() async throws -> some IntentResult {
    LifeaholicSharedStore.mutate { snapshot in
      guard snapshot.focus.mode == "focus", let subjectId = snapshot.focus.subjectId,
            let startedAt = snapshot.focus.startedAt else { return }
      let endedAt = Date().timeIntervalSince1970
      snapshot.pendingActions.append(.init(
        id: UUID().uuidString, type: "saveFocusSession", subjectId: subjectId,
        startedAt: startedAt, endedAt: endedAt, createdAt: endedAt
      ))
      snapshot.focus.mode = "paused"
      snapshot.focus.accumulatedSeconds += max(0, Int(endedAt - startedAt))
      snapshot.focus.startedAt = nil
    }
    return .result()
  }
}

@available(iOS 17.0, *)
private struct ResumeLifeaholicFocusIntent: AppIntent {
  static var title: LocalizedStringResource = "Resume Lifeaholic focus"
  static var isDiscoverable = false

  func perform() async throws -> some IntentResult {
    LifeaholicSharedStore.mutate { snapshot in
      guard snapshot.focus.mode == "paused", snapshot.focus.subjectId != nil else { return }
      snapshot.focus.mode = "focus"
      snapshot.focus.startedAt = Date().timeIntervalSince1970
    }
    return .result()
  }
}

@available(iOS 17.0, *)
private struct EndLifeaholicFocusIntent: AppIntent {
  static var title: LocalizedStringResource = "End Lifeaholic focus"
  static var isDiscoverable = false

  func perform() async throws -> some IntentResult {
    LifeaholicSharedStore.mutate { snapshot in
      let now = Date().timeIntervalSince1970
      if snapshot.focus.mode == "focus", let subjectId = snapshot.focus.subjectId,
         let startedAt = snapshot.focus.startedAt {
        snapshot.pendingActions.append(.init(
          id: UUID().uuidString, type: "saveFocusSession", subjectId: subjectId,
          startedAt: startedAt, endedAt: now, createdAt: now
        ))
      }
      snapshot.focus = .init(mode: "idle", accumulatedSeconds: 0)
    }
    return .result()
  }
}

@available(iOS 17.0, *)
private struct BreakLifeaholicFocusIntent: AppIntent {
  static var title: LocalizedStringResource = "Take a Lifeaholic break"
  static var isDiscoverable = false

  func perform() async throws -> some IntentResult {
    LifeaholicSharedStore.mutate { snapshot in
      let now = Date().timeIntervalSince1970
      if snapshot.focus.mode == "focus", let subjectId = snapshot.focus.subjectId,
         let startedAt = snapshot.focus.startedAt {
        snapshot.pendingActions.append(.init(
          id: UUID().uuidString, type: "saveFocusSession", subjectId: subjectId,
          startedAt: startedAt, endedAt: now, createdAt: now
        ))
      }
      snapshot.focus = .init(mode: "break", startedAt: now, accumulatedSeconds: 0)
    }
    return .result()
  }
}

@available(iOS 17.0, *)
private struct EndLifeaholicBreakIntent: AppIntent {
  static var title: LocalizedStringResource = "End Lifeaholic break"
  static var isDiscoverable = false

  func perform() async throws -> some IntentResult {
    LifeaholicSharedStore.mutate { snapshot in
      guard snapshot.focus.mode == "break" else { return }
      snapshot.focus = .init(mode: "idle", accumulatedSeconds: 0)
    }
    return .result()
  }
}

// MARK: - Shared views

private struct EmptyWidgetState: View {
  let title: String
  let subtitle: String
  var body: some View {
    VStack(spacing: 5) {
      Text(title).font(.system(.headline, design: .rounded, weight: .bold)).foregroundStyle(LifeaholicWidgetConstants.primary)
      Text(subtitle).font(.caption2).multilineTextAlignment(.center).foregroundStyle(LifeaholicWidgetConstants.secondary)
    }.frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

private struct PriorityDot: View {
  let priority: String
  private var color: Color {
    switch priority { case "red": .red; case "yellow": .yellow; case "blue": .blue; default: .green }
  }
  var body: some View { Circle().fill(color.opacity(0.9)).frame(width: 6, height: 6) }
}

// MARK: - D-Day

private struct DDayWidgetView: View {
  let entry: LifeaholicEntry
  var body: some View {
    Group {
      if let dDay = entry.snapshot.dDay {
        VStack(spacing: 5) {
          Spacer(minLength: 0)
          Text("\(dDay.daysRemaining)")
            .font(.system(size: 58, weight: .black, design: .rounded))
            .minimumScaleFactor(0.55)
            .foregroundStyle(LifeaholicWidgetConstants.primary)
          Text(dDay.daysRemaining == 1 ? "DAY REMAINING" : "DAYS REMAINING")
            .font(.system(size: 9, weight: .bold)).tracking(1.2)
            .foregroundStyle(LifeaholicWidgetConstants.yellow)
          Text(dDay.title).font(.caption.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.72)
            .foregroundStyle(LifeaholicWidgetConstants.secondary)
          Spacer(minLength: 0)
        }.padding(10)
      } else {
        EmptyWidgetState(title: "D-Day", subtitle: "Set an event in Lifeaholic")
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .widgetURL(appURL("home?compose=d-day"))
    .liquidWidgetContainer()
  }
}

struct LifeaholicDDayWidget: Widget {
  let kind = "LifeaholicDDayWidget"
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: LifeaholicProvider()) { DDayWidgetView(entry: $0) }
      .configurationDisplayName("Lifeaholic D-Day")
      .description("Your closest milestone at a glance.")
      .supportedFamilies([.systemSmall])
      .contentMarginsDisabled()
  }
}

// MARK: - Tasks

private struct TasksWidgetView: View {
  let entry: LifeaholicEntry
  @Environment(\.widgetFamily) private var family
  private var limit: Int { family == .systemLarge ? 8 : 4 }
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text("Today’s Tasks").font(.system(.headline, design: .rounded, weight: .bold)).foregroundStyle(LifeaholicWidgetConstants.primary)
        Spacer()
        Text("\(entry.snapshot.tasks.count)").font(.caption.bold()).foregroundStyle(LifeaholicWidgetConstants.yellow)
      }
      if entry.snapshot.tasks.isEmpty {
        EmptyWidgetState(title: "You’re all clear", subtitle: "No unfinished tasks")
      } else {
        ForEach(Array(entry.snapshot.tasks.prefix(limit).enumerated()), id: \.element.id) { index, task in
          HStack(spacing: 8) {
            Text("\(index + 1).").font(.system(size: 12, weight: .bold, design: .rounded))
              .foregroundStyle(LifeaholicWidgetConstants.yellow).frame(width: 19, alignment: .trailing)
            PriorityDot(priority: task.priority)
            Link(destination: appURL("home?taskId=\(task.id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? task.id)")) {
              Text(task.title).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                .foregroundStyle(LifeaholicWidgetConstants.primary)
            }
            Spacer(minLength: 0)
          }
          .padding(.horizontal, 9).frame(maxWidth: .infinity, minHeight: 31, alignment: .leading)
          .liquidTile(cornerRadius: 11)
        }
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .widgetURL(appURL("home"))
    .liquidWidgetContainer()
  }
}

struct LifeaholicTasksWidget: Widget {
  let kind = "LifeaholicTasksWidget"
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: LifeaholicProvider()) { TasksWidgetView(entry: $0) }
      .configurationDisplayName("Lifeaholic Tasks")
      .description("Complete today’s tasks without opening the app.")
      .supportedFamilies([.systemMedium, .systemLarge])
      .contentMarginsDisabled()
  }
}

// MARK: - Eisenhower Matrix

private struct MatrixQuadrant: View {
  let title: String
  let color: Color
  let tasks: [WidgetTask]
  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      HStack(spacing: 5) {
        Circle().fill(color).frame(width: 7, height: 7)
        Text(title).font(.system(size: 10, weight: .bold)).lineLimit(1).foregroundStyle(LifeaholicWidgetConstants.primary)
        Spacer(minLength: 0)
        Text("\(tasks.count)").font(.caption2.bold()).foregroundStyle(LifeaholicWidgetConstants.secondary)
      }
      ForEach(Array(tasks.prefix(3).enumerated()), id: \.element.id) { index, task in
        HStack(spacing: 5) {
          Text("\(index + 1).").font(.system(size: 9, weight: .bold, design: .rounded))
            .foregroundStyle(color).frame(width: 14, alignment: .trailing)
          Link(destination: appURL("matrix?taskId=\(task.id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? task.id)")) {
            Text(task.title).font(.system(size: 10, weight: .medium)).lineLimit(1)
              .foregroundStyle(LifeaholicWidgetConstants.primary).frame(maxWidth: .infinity, alignment: .leading)
          }
        }
      }
      if tasks.isEmpty { Spacer(minLength: 0) }
    }
    .padding(9).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .liquidTile(cornerRadius: 15)
  }
}

private struct MatrixWidgetView: View {
  let entry: LifeaholicEntry
  private func tasks(_ priority: String) -> [WidgetTask] { entry.snapshot.tasks.filter { $0.priority == priority } }
  var body: some View {
    VStack(spacing: 7) {
      HStack {
        Text("Eisenhower Matrix").font(.system(.headline, design: .rounded, weight: .bold)).foregroundStyle(LifeaholicWidgetConstants.primary)
        Spacer()
        Image(systemName: "square.grid.2x2").foregroundStyle(LifeaholicWidgetConstants.yellow)
      }
      HStack(spacing: 7) {
        MatrixQuadrant(title: "Urgent · Important", color: .red, tasks: tasks("red"))
        MatrixQuadrant(title: "Important", color: .yellow, tasks: tasks("yellow"))
      }
      HStack(spacing: 7) {
        MatrixQuadrant(title: "Urgent", color: .blue, tasks: tasks("blue"))
        MatrixQuadrant(title: "Later", color: .green, tasks: tasks("green"))
      }
    }
    .padding(11).frame(maxWidth: .infinity, maxHeight: .infinity)
    .widgetURL(appURL("matrix"))
    .liquidWidgetContainer()
  }
}

struct LifeaholicMatrixWidget: Widget {
  let kind = "LifeaholicMatrixWidget"
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: LifeaholicProvider()) { MatrixWidgetView(entry: $0) }
      .configurationDisplayName("Lifeaholic Matrix")
      .description("Act on all four Eisenhower quadrants.")
      .supportedFamilies([.systemLarge, .systemExtraLarge])
      .contentMarginsDisabled()
  }
}

// MARK: - What's Next

private struct WhatsNextWidgetView: View {
  let entry: LifeaholicEntry
  private var next: WidgetEvent? {
    entry.snapshot.events.filter { $0.startAt > entry.date.timeIntervalSince1970 }.sorted { $0.startAt < $1.startAt }.first
  }
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text("What’s Next").font(.system(.headline, design: .rounded, weight: .bold)).foregroundStyle(LifeaholicWidgetConstants.primary)
        Spacer()
        Image(systemName: "calendar.badge.clock").foregroundStyle(LifeaholicWidgetConstants.yellow)
      }
      if let event = next {
        VStack(alignment: .leading, spacing: 5) {
          Text(event.title).font(.system(size: 16, weight: .bold)).lineLimit(2).minimumScaleFactor(0.75)
            .foregroundStyle(LifeaholicWidgetConstants.primary)
          Text(Date(timeIntervalSince1970: event.startAt), style: .time)
            .font(.caption.weight(.semibold)).foregroundStyle(LifeaholicWidgetConstants.yellow)
        }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
      } else {
        EmptyWidgetState(title: "Schedule clear", subtitle: "No more upcoming events today")
      }
    }
    .padding(13).widgetURL(appURL("calendar")).liquidWidgetContainer()
  }
}

struct LifeaholicWhatsNextWidget: Widget {
  let kind = "LifeaholicWhatsNextWidget"
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: LifeaholicProvider()) { WhatsNextWidgetView(entry: $0) }
      .configurationDisplayName("Lifeaholic What’s Next")
      .description("Your single closest upcoming event.")
      .supportedFamilies([.systemSmall, .systemMedium])
      .contentMarginsDisabled()
  }
}

// MARK: - Add Expense

private struct AddExpenseWidgetView: View {
  var body: some View {
    Link(destination: appURL("finance/add-expense")) {
      VStack(spacing: 10) {
        ZStack {
          Circle().fill(LifeaholicWidgetConstants.yellow)
          Image(systemName: "plus").font(.system(size: 25, weight: .bold)).foregroundStyle(LifeaholicWidgetConstants.deepZinc)
        }.frame(width: 52, height: 52)
        Text("Add Expense").font(.system(.headline, design: .rounded, weight: .bold)).foregroundStyle(LifeaholicWidgetConstants.primary)
        Text("Log it while it’s fresh").font(.caption2).foregroundStyle(LifeaholicWidgetConstants.secondary)
      }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .liquidWidgetContainer()
  }
}

struct LifeaholicAddExpenseWidget: Widget {
  let kind = "LifeaholicAddExpenseWidget"
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: LifeaholicProvider()) { _ in AddExpenseWidgetView() }
      .configurationDisplayName("Lifeaholic Add Expense")
      .description("Jump directly into expense entry.")
      .supportedFamilies([.systemSmall, .systemMedium])
      .contentMarginsDisabled()
  }
}

// MARK: - Focus Controller

private struct FocusControllerWidgetView: View {
  let entry: LifeaholicEntry
  private var focus: WidgetFocusState { entry.snapshot.focus }
  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      HStack {
        VStack(alignment: .leading, spacing: 2) {
          Text("Focus Session").font(.system(.headline, design: .rounded, weight: .bold)).foregroundStyle(LifeaholicWidgetConstants.primary)
          Text(focus.subjectName ?? (focus.mode == "break" ? "Taking a break" : "Choose a subject"))
            .font(.caption).foregroundStyle(LifeaholicWidgetConstants.secondary)
        }
        Spacer()
        if focus.mode == "focus", let startedAt = focus.startedAt {
          Text(timerInterval: Date(timeIntervalSince1970: startedAt)...Date.distantFuture, countsDown: false)
            .font(.system(size: 19, weight: .bold, design: .monospaced)).foregroundStyle(LifeaholicWidgetConstants.yellow)
        } else if focus.mode == "paused" {
          Text(Duration.seconds(focus.accumulatedSeconds), format: .time(pattern: .minuteSecond))
            .font(.system(size: 19, weight: .bold, design: .monospaced)).foregroundStyle(LifeaholicWidgetConstants.yellow)
        }
      }
      if focus.mode == "focus" {
        HStack(spacing: 8) {
          if #available(iOS 17.0, *) {
            Button(intent: PauseLifeaholicFocusIntent()) { Label("Pause", systemImage: "pause.fill") }
              .buttonStyle(.borderedProminent).tint(LifeaholicWidgetConstants.yellow).foregroundStyle(LifeaholicWidgetConstants.deepZinc)
            Button(intent: BreakLifeaholicFocusIntent()) { Label("Break", systemImage: "cup.and.saucer.fill") }
              .buttonStyle(.bordered).tint(LifeaholicWidgetConstants.primary)
          }
        }
      } else if focus.mode == "paused" {
        HStack(spacing: 8) {
          if #available(iOS 17.0, *) {
            Button(intent: ResumeLifeaholicFocusIntent()) { Label("Resume", systemImage: "play.fill") }
              .buttonStyle(.borderedProminent).tint(LifeaholicWidgetConstants.yellow).foregroundStyle(LifeaholicWidgetConstants.deepZinc)
            Button(intent: EndLifeaholicFocusIntent()) { Label("End", systemImage: "stop.fill") }
              .buttonStyle(.bordered).tint(LifeaholicWidgetConstants.primary)
          }
        }
      } else if focus.mode == "break" {
        if #available(iOS 17.0, *) {
          Button(intent: EndLifeaholicBreakIntent()) { Label("End Break", systemImage: "stop.fill") }
            .buttonStyle(.borderedProminent).tint(LifeaholicWidgetConstants.yellow).foregroundStyle(LifeaholicWidgetConstants.deepZinc)
        }
      } else {
        ForEach(Array(entry.snapshot.subjects.prefix(5))) { subject in
          HStack {
            VStack(alignment: .leading, spacing: 2) {
              Text(subject.name).font(.system(size: 13, weight: .semibold)).lineLimit(1).foregroundStyle(LifeaholicWidgetConstants.primary)
              Text("\(subject.todaySeconds / 60) min today").font(.caption2).foregroundStyle(LifeaholicWidgetConstants.secondary)
            }
            Spacer()
            if #available(iOS 17.0, *) {
              Button(intent: StartLifeaholicFocusIntent(subjectId: subject.id, subjectName: subject.name)) {
                Image(systemName: "play.fill").frame(width: 22, height: 22)
              }.buttonStyle(.borderedProminent).buttonBorderShape(.circle).tint(LifeaholicWidgetConstants.yellow)
                .foregroundStyle(LifeaholicWidgetConstants.deepZinc)
            }
          }.padding(.horizontal, 9).frame(minHeight: 37).liquidTile(cornerRadius: 11)
        }
      }
      Spacer(minLength: 0)
    }
    .padding(12).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .widgetURL(appURL("focus")).liquidWidgetContainer()
  }
}

struct LifeaholicFocusControllerWidget: Widget {
  let kind = "LifeaholicFocusControllerWidget"
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: LifeaholicProvider()) { FocusControllerWidgetView(entry: $0) }
      .configurationDisplayName("Lifeaholic Focus")
      .description("Start, pause, and break without leaving the Home Screen.")
      .supportedFamilies([.systemLarge])
      .contentMarginsDisabled()
  }
}

// MARK: - Focus Analytics

private struct FocusAnalyticsWidgetView: View {
  let entry: LifeaholicEntry
  @Environment(\.widgetFamily) private var family
  private var total: Int { entry.snapshot.analytics.reduce(0) { $0 + $1.seconds } }
  private var formattedTotal: String { "\(total / 3600)h \((total % 3600) / 60)m" }
  private var chartItems: [WidgetAnalyticsItem] { Array(entry.snapshot.analytics.filter { $0.seconds > 0 }.prefix(6)) }
  var body: some View {
    Group {
      if family == .systemMedium {
        HStack(spacing: 14) {
          VStack(spacing: 5) {
            Text(formattedTotal).font(.system(size: 22, weight: .black, design: .rounded))
              .lineLimit(1).minimumScaleFactor(0.7).foregroundStyle(LifeaholicWidgetConstants.primary)
            pieChart.frame(width: 102, height: 102)
          }.frame(width: 126).frame(maxHeight: .infinity)
          VStack(alignment: .leading, spacing: 7) {
            Text("FOCUS SPLIT").font(.system(size: 9, weight: .bold)).tracking(1.1)
              .foregroundStyle(LifeaholicWidgetConstants.yellow)
            ForEach(chartItems) { item in
              HStack(spacing: 6) {
                Circle().fill(Color(hex: item.colorHex)).frame(width: 8, height: 8)
                Text(item.name).font(.system(size: 11, weight: .semibold)).lineLimit(1)
                  .minimumScaleFactor(0.75).foregroundStyle(LifeaholicWidgetConstants.primary)
                Spacer(minLength: 0)
                Text("\(item.seconds / 60)m").font(.system(size: 9, weight: .bold, design: .monospaced))
                  .foregroundStyle(LifeaholicWidgetConstants.secondary)
              }
            }
          }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
      } else {
        VStack(spacing: 8) {
          Text(formattedTotal).font(.system(size: 27, weight: .black, design: .rounded))
            .lineLimit(1).minimumScaleFactor(0.68).foregroundStyle(LifeaholicWidgetConstants.primary)
          pieChart.frame(width: 88, height: 88)
        }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
      }
    }
    .padding(12).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    .widgetURL(appURL("focus")).liquidWidgetContainer()
  }

  @ViewBuilder private var pieChart: some View {
    if chartItems.isEmpty {
      Circle().stroke(LifeaholicWidgetConstants.secondary.opacity(0.22), lineWidth: 15)
    } else {
      Chart(chartItems) { item in
        SectorMark(angle: .value("Seconds", item.seconds), innerRadius: .ratio(0.56), angularInset: 1.5)
          .cornerRadius(3).foregroundStyle(Color(hex: item.colorHex))
      }.chartLegend(.hidden)
    }
  }
}

struct LifeaholicFocusAnalyticsWidget: Widget {
  let kind = "LifeaholicFocusAnalyticsWidget"
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: LifeaholicProvider()) { FocusAnalyticsWidgetView(entry: $0) }
      .configurationDisplayName("Lifeaholic Focus Analytics")
      .description("Today’s focus time and subject breakdown.")
      .supportedFamilies([.systemSmall, .systemMedium])
      .contentMarginsDisabled()
  }
}
