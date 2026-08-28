import SwiftUI
import WidgetKit

@main
struct LifeaholicWidgetBundle: WidgetBundle {
  var body: some Widget {
    LifeaholicDDayWidget()
    LifeaholicTasksWidget()
    LifeaholicMatrixWidget()
    LifeaholicWhatsNextWidget()
    LifeaholicAddExpenseWidget()
    LifeaholicFocusControllerWidget()
    LifeaholicFocusAnalyticsWidget()
  }
}
