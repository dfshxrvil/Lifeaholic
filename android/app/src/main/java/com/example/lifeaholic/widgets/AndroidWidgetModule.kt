package com.example.lifeaholic.widgets

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONObject
import org.json.JSONArray

class AndroidWidgetModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "AndroidWidgetModule"

  @ReactMethod
  fun readSnapshot(promise: Promise) {
    try {
      promise.resolve(LifeaholicWidgetStore.read(reactContext).toString())
    } catch (error: Exception) {
      promise.reject("WIDGET_READ_FAILED", "Unable to read Android widget state.", error)
    }
  }

  @ReactMethod
  fun writeSnapshot(snapshotJson: String, promise: Promise) {
    try {
      val snapshot = JSONObject(snapshotJson)
      if (!LifeaholicWidgetStore.mergeFromReactNative(reactContext, snapshot)) {
        promise.reject("WIDGET_WRITE_FAILED", "Unable to commit Android widget state.")
        return
      }
      Handler(Looper.getMainLooper()).post { LifeaholicWidgetRenderer.updateAll(reactContext) }
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("WIDGET_INVALID_JSON", "Android widget snapshot was invalid.", error)
    }
  }

  @ReactMethod
  fun acknowledgeActions(actionIdsJson: String, promise: Promise) {
    try {
      val actionIds = JSONArray(actionIdsJson)
      val ids = buildSet {
        for (index in 0 until actionIds.length()) actionIds.optString(index).takeIf(String::isNotBlank)?.let(::add)
      }
      if (!LifeaholicWidgetStore.acknowledgeActions(reactContext, ids)) {
        promise.reject("WIDGET_ACK_FAILED", "Unable to acknowledge Android widget actions.")
        return
      }
      Handler(Looper.getMainLooper()).post { LifeaholicWidgetRenderer.updateAll(reactContext) }
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("WIDGET_ACK_INVALID", "Android widget action identifiers were invalid.", error)
    }
  }

  @ReactMethod
  fun reloadAllWidgets() {
    Handler(Looper.getMainLooper()).post { LifeaholicWidgetRenderer.updateAll(reactContext) }
  }
}
