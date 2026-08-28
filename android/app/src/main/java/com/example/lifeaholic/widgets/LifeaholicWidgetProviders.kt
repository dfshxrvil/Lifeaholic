package com.example.lifeaholic.widgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import com.example.lifeaholic.R
import org.json.JSONArray
import org.json.JSONObject
import java.text.DateFormat
import java.util.Date
import kotlin.math.min

open class LifeaholicWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
    LifeaholicWidgetRenderer.updateAll(context)
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
    LifeaholicWidgetRenderer.updateAll(context)
  }
}

class TasksWidgetProvider : LifeaholicWidgetProvider()
class MatrixWidgetProvider : LifeaholicWidgetProvider()
class DDayWidgetProvider : LifeaholicWidgetProvider()
class WhatsNextWidgetProvider : LifeaholicWidgetProvider()
class AddExpenseWidgetProvider : LifeaholicWidgetProvider()
class FocusControllerWidgetProvider : LifeaholicWidgetProvider()
class FocusAnalyticsWidgetProvider : LifeaholicWidgetProvider()

object LifeaholicWidgetRenderer {
  private val providers = listOf(
    TasksWidgetProvider::class.java,
    MatrixWidgetProvider::class.java,
    DDayWidgetProvider::class.java,
    WhatsNextWidgetProvider::class.java,
    AddExpenseWidgetProvider::class.java,
    FocusControllerWidgetProvider::class.java,
    FocusAnalyticsWidgetProvider::class.java,
  )

  fun updateAll(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    val snapshot = LifeaholicWidgetStore.read(context)
    providers.forEach { provider ->
      val component = ComponentName(context, provider)
      manager.getAppWidgetIds(component).forEach { id ->
        manager.updateAppWidget(id, render(context, manager, id, provider, snapshot))
      }
    }
  }

  private fun render(context: Context, manager: AppWidgetManager, appWidgetId: Int, provider: Class<*>, snapshot: JSONObject): RemoteViews = when (provider) {
    TasksWidgetProvider::class.java -> tasks(context, snapshot)
    MatrixWidgetProvider::class.java -> matrix(context, snapshot)
    DDayWidgetProvider::class.java -> dDay(context, snapshot)
    WhatsNextWidgetProvider::class.java -> whatsNext(context, snapshot)
    AddExpenseWidgetProvider::class.java -> addExpense(context)
    FocusControllerWidgetProvider::class.java -> focusController(context, snapshot)
    else -> focusAnalytics(context, snapshot, manager.getAppWidgetOptions(appWidgetId).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH) < 200)
  }

  private fun tasks(context: Context, snapshot: JSONObject): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_tasks)
    views.removeAllViews(R.id.task_container)
    visibleTasks(snapshot).take(7).forEach { task ->
      views.addView(R.id.task_container, taskRow(context, task, false, "home"))
    }
    views.setOnClickPendingIntent(R.id.widget_root, deepLink(context, "lifeaholic://home"))
    return views
  }

  private fun matrix(context: Context, snapshot: JSONObject): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_matrix)
    val containers = mapOf(
      "red" to R.id.matrix_red, "yellow" to R.id.matrix_yellow,
      "blue" to R.id.matrix_blue, "green" to R.id.matrix_green,
    )
    containers.values.forEach(views::removeAllViews)
    containers.forEach { (priority, container) ->
      visibleTasks(snapshot).filter { it.optString("priority") == priority }.take(3).forEach { task ->
        views.addView(container, taskRow(context, task, true, "matrix"))
      }
    }
    views.setOnClickPendingIntent(R.id.widget_root, deepLink(context, "lifeaholic://matrix"))
    return views
  }

  private fun taskRow(context: Context, task: JSONObject, compact: Boolean, route: String): RemoteViews {
    val row = RemoteViews(context.packageName, if (compact) R.layout.widget_matrix_task_row else R.layout.widget_task_row)
    val taskId = task.optString("id")
    row.setTextViewText(R.id.task_title, task.optString("title", "Untitled task"))
    row.setOnClickPendingIntent(R.id.task_checkbox, completeTask(context, taskId))
    row.setOnClickPendingIntent(R.id.task_title, deepLink(context, "lifeaholic://$route?taskId=${Uri.encode(taskId)}"))
    return row
  }

  private fun dDay(context: Context, snapshot: JSONObject): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_d_day)
    val item = snapshot.optJSONObject("dDay")
    views.setTextViewText(R.id.d_day_number, item?.optInt("daysRemaining")?.toString() ?: "—")
    views.setTextViewText(R.id.d_day_title, item?.optString("title") ?: "Set a D-Day")
    views.setOnClickPendingIntent(R.id.widget_root, deepLink(context, "lifeaholic://home?compose=d-day"))
    return views
  }

  private fun whatsNext(context: Context, snapshot: JSONObject): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_whats_next)
    val now = System.currentTimeMillis() / 1000.0
    val events = snapshot.optJSONArray("events") ?: JSONArray()
    var next: JSONObject? = null
    for (index in 0 until events.length()) {
      val event = events.optJSONObject(index) ?: continue
      if (event.optDouble("startAt") > now && (next == null || event.optDouble("startAt") < next!!.optDouble("startAt"))) next = event
    }
    views.setTextViewText(R.id.event_title, next?.optString("title") ?: "")
    views.setTextViewText(R.id.event_time, next?.let { DateFormat.getTimeInstance(DateFormat.SHORT).format(Date((it.optDouble("startAt") * 1000).toLong())) } ?: "")
    views.setViewVisibility(R.id.event_content, if (next == null) View.INVISIBLE else View.VISIBLE)
    views.setOnClickPendingIntent(R.id.widget_root, deepLink(context, "lifeaholic://calendar"))
    return views
  }

  private fun addExpense(context: Context) = RemoteViews(context.packageName, R.layout.widget_add_expense).apply {
    setOnClickPendingIntent(R.id.widget_root, deepLink(context, "lifeaholic://finance/add-expense"))
  }

  private fun focusController(context: Context, snapshot: JSONObject): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_focus_controller)
    val focus = snapshot.optJSONObject("focus") ?: JSONObject()
    val mode = focus.optString("mode", "idle")
    views.setTextViewText(R.id.focus_status, when (mode) {
      "focus" -> "Focusing · ${focus.optString("subjectName", "Subject")}"; "paused" -> "Paused"
      "break" -> "Taking a break"; else -> "Choose a subject to begin"
    })
    views.removeAllViews(R.id.subject_container)
    val subjects = snapshot.optJSONArray("subjects") ?: JSONArray()
    for (index in 0 until min(5, subjects.length())) {
      val subject = subjects.optJSONObject(index) ?: continue
      val row = RemoteViews(context.packageName, R.layout.widget_subject_row)
      row.setTextViewText(R.id.subject_name, subject.optString("name", "Subject"))
      row.setTextViewText(R.id.subject_time, "${subject.optInt("todaySeconds") / 60}m")
      row.setOnClickPendingIntent(R.id.subject_name, deepLink(context, "lifeaholic://focus?startSubjectId=${Uri.encode(subject.optString("id"))}"))
      row.setOnClickPendingIntent(R.id.subject_time, deepLink(context, "lifeaholic://focus?startSubjectId=${Uri.encode(subject.optString("id"))}"))
      views.addView(R.id.subject_container, row)
    }
    views.setOnClickPendingIntent(R.id.widget_root, deepLink(context, "lifeaholic://focus"))
    return views
  }

  private fun focusAnalytics(context: Context, snapshot: JSONObject, small: Boolean): RemoteViews {
    val views = RemoteViews(context.packageName, if (small) R.layout.widget_focus_analytics_small else R.layout.widget_focus_analytics)
    val analytics = snapshot.optJSONArray("analytics") ?: JSONArray()
    var total = 0
    for (index in 0 until analytics.length()) total += analytics.optJSONObject(index)?.optInt("seconds") ?: 0
    views.setTextViewText(R.id.focus_total, "${total / 3600}h ${(total % 3600) / 60}m")
    views.setImageViewBitmap(R.id.focus_pie, pieBitmap(analytics, 192))
    if (!small) {
      views.removeAllViews(R.id.focus_legend)
      for (index in 0 until min(5, analytics.length())) {
        val item = analytics.optJSONObject(index) ?: continue
        val row = RemoteViews(context.packageName, R.layout.widget_legend_row)
        val color = parseColor(item.optString("colorHex", "#6366F1"))
        row.setTextColor(R.id.legend_dot, color)
        row.setTextViewText(R.id.legend_name, item.optString("name", "Subject"))
        row.setTextViewText(R.id.legend_time, "${item.optInt("seconds") / 60}m")
        views.addView(R.id.focus_legend, row)
      }
    }
    views.setOnClickPendingIntent(R.id.widget_root, deepLink(context, "lifeaholic://focus"))
    return views
  }

  private fun visibleTasks(snapshot: JSONObject): List<JSONObject> {
    val tasks = snapshot.optJSONArray("tasks") ?: JSONArray()
    return buildList {
      for (index in 0 until tasks.length()) tasks.optJSONObject(index)?.takeUnless { it.optBoolean("isCompleted", false) }?.let(::add)
    }
  }

  private fun pieBitmap(items: JSONArray, size: Int): Bitmap {
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = size * 0.24f; strokeCap = Paint.Cap.BUTT }
    var total = 0
    for (index in 0 until items.length()) total += items.optJSONObject(index)?.optInt("seconds") ?: 0
    if (total <= 0) {
      paint.color = Color.argb(55, 255, 255, 255)
      canvas.drawCircle(size / 2f, size / 2f, size * 0.36f, paint)
      return bitmap
    }
    var start = -90f
    val inset = size * 0.14f
    for (index in 0 until items.length()) {
      val item = items.optJSONObject(index) ?: continue
      val sweep = item.optInt("seconds").toFloat() / total * 360f
      paint.color = parseColor(item.optString("colorHex", "#6366F1"))
      canvas.drawArc(inset, inset, size - inset, size - inset, start, maxOf(0f, sweep - 1.5f), false, paint)
      start += sweep
    }
    return bitmap
  }

  private fun parseColor(raw: String) = try { Color.parseColor(raw) } catch (_: IllegalArgumentException) { Color.rgb(99, 102, 241) }

  private fun deepLink(context: Context, url: String): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).setPackage(context.packageName)
    return PendingIntent.getActivity(context, url.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun completeTask(context: Context, taskId: String): PendingIntent {
    val intent = Intent(context, WidgetActionReceiver::class.java).apply {
      action = WidgetActionReceiver.ACTION_COMPLETE_TASK
      setPackage(context.packageName)
      putExtra(WidgetActionReceiver.EXTRA_TASK_ID, taskId)
    }
    return PendingIntent.getBroadcast(context, taskId.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
}
