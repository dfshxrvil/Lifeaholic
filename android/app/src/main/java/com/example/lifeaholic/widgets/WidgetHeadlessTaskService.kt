package com.example.lifeaholic.widgets

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class WidgetHeadlessTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val taskId = intent?.getStringExtra(WidgetActionReceiver.EXTRA_TASK_ID) ?: return null
    val actionId = intent.getStringExtra(WidgetActionReceiver.EXTRA_ACTION_ID) ?: return null
    return HeadlessJsTaskConfig(
      TASK_NAME,
      Arguments.createMap().apply {
        putString("taskId", taskId)
        putString("actionId", actionId)
      },
      20_000,
      true,
    )
  }

  companion object { const val TASK_NAME = "LifeaholicWidgetTaskSync" }
}
