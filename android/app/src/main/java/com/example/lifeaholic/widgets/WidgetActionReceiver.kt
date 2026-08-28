package com.example.lifeaholic.widgets

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.facebook.react.HeadlessJsTaskService

class WidgetActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION_COMPLETE_TASK) return
    val taskId = intent.getStringExtra(EXTRA_TASK_ID) ?: return
    val actionId = LifeaholicWidgetStore.completeTask(context, taskId) ?: return

    // SharedPreferences is committed before rendering, so the completed task
    // disappears even when React Native or the network is unavailable.
    LifeaholicWidgetRenderer.updateAll(context)

    // The durable pending action remains in SharedPreferences until JS confirms
    // the Supabase update. Headless execution is a best-effort fast path.
    val service = Intent(context, WidgetHeadlessTaskService::class.java).apply {
      putExtra(EXTRA_TASK_ID, taskId)
      putExtra(EXTRA_ACTION_ID, actionId)
    }
    try {
      context.startService(service)
      HeadlessJsTaskService.acquireWakeLockNow(context)
    } catch (_: IllegalStateException) {
      // Android may restrict background service starts. Foreground sync retries
      // the durable action; the local widget UI has already been updated.
    }
  }

  companion object {
    const val ACTION_COMPLETE_TASK = "com.example.lifeaholic.widgets.COMPLETE_TASK"
    const val EXTRA_TASK_ID = "taskId"
    const val EXTRA_ACTION_ID = "actionId"
  }
}
