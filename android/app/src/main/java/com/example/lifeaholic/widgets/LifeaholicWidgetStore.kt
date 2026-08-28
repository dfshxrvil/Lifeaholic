package com.example.lifeaholic.widgets

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

object LifeaholicWidgetStore {
  const val PREFERENCES_NAME = "lifeaholic_widgets"
  const val SNAPSHOT_KEY = "snapshot_json"

  private fun emptySnapshot() = JSONObject().apply {
    put("version", 1)
    put("updatedAt", System.currentTimeMillis() / 1000.0)
    put("tasks", JSONArray())
    put("events", JSONArray())
    put("subjects", JSONArray())
    put("focus", JSONObject().put("mode", "idle").put("accumulatedSeconds", 0))
    put("analytics", JSONArray())
    put("pendingActions", JSONArray())
  }

  fun read(context: Context): JSONObject {
    val raw = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
      .getString(SNAPSHOT_KEY, null) ?: return emptySnapshot()
    return try { JSONObject(raw) } catch (_: Exception) { emptySnapshot() }
  }

  @Synchronized
  fun write(context: Context, snapshot: JSONObject): Boolean {
    snapshot.put("version", 1)
    snapshot.put("updatedAt", System.currentTimeMillis() / 1000.0)
    return context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
      .edit().putString(SNAPSHOT_KEY, snapshot.toString()).commit()
  }

  @Synchronized
  fun mergeFromReactNative(context: Context, incoming: JSONObject): Boolean {
    val currentActions = read(context).optJSONArray("pendingActions") ?: JSONArray()
    val incomingActions = incoming.optJSONArray("pendingActions") ?: JSONArray()
    val actionIds = mutableSetOf<String>()
    val mergedActions = JSONArray()
    for (source in listOf(incomingActions, currentActions)) {
      for (index in 0 until source.length()) {
        val action = source.optJSONObject(index) ?: continue
        val actionId = action.optString("id")
        if (actionId.isNotBlank() && actionIds.add(actionId)) mergedActions.put(action)
      }
    }
    val boundedActions = JSONArray()
    val first = maxOf(0, mergedActions.length() - 64)
    for (index in first until mergedActions.length()) boundedActions.put(mergedActions.get(index))
    incoming.put("pendingActions", boundedActions)

    val pendingCompletions = buildSet {
      for (index in 0 until boundedActions.length()) {
        val action = boundedActions.optJSONObject(index) ?: continue
        if (action.optString("type") == "completeTask") action.optString("taskId").takeIf(String::isNotBlank)?.let(::add)
      }
    }
    val tasks = incoming.optJSONArray("tasks") ?: JSONArray()
    for (index in 0 until tasks.length()) {
      val task = tasks.optJSONObject(index) ?: continue
      if (task.optString("id") in pendingCompletions) task.put("isCompleted", true)
    }
    return write(context, incoming)
  }

  @Synchronized
  fun acknowledgeActions(context: Context, actionIds: Set<String>): Boolean {
    if (actionIds.isEmpty()) return true
    val snapshot = read(context)
    val current = snapshot.optJSONArray("pendingActions") ?: JSONArray()
    val remaining = JSONArray()
    for (index in 0 until current.length()) {
      val action = current.optJSONObject(index) ?: continue
      if (action.optString("id") !in actionIds) remaining.put(action)
    }
    snapshot.put("pendingActions", remaining)
    return write(context, snapshot)
  }

  @Synchronized
  fun completeTask(context: Context, taskId: String): String? {
    if (taskId.isBlank() || taskId.length > 128) return null
    val snapshot = read(context)
    val tasks = snapshot.optJSONArray("tasks") ?: return null
    var found = false
    for (index in 0 until tasks.length()) {
      val task = tasks.optJSONObject(index) ?: continue
      if (task.optString("id") == taskId && !task.optBoolean("isCompleted", false)) {
        task.put("isCompleted", true)
        found = true
        break
      }
    }
    if (!found) return null

    val actionId = UUID.randomUUID().toString()
    val actions = snapshot.optJSONArray("pendingActions") ?: JSONArray()
    actions.put(JSONObject().apply {
      put("id", actionId)
      put("type", "completeTask")
      put("taskId", taskId)
      put("createdAt", System.currentTimeMillis() / 1000.0)
    })
    val boundedActions = JSONArray()
    val first = maxOf(0, actions.length() - 64)
    for (index in first until actions.length()) boundedActions.put(actions.get(index))
    snapshot.put("pendingActions", boundedActions)
    return if (write(context, snapshot)) actionId else null
  }
}
