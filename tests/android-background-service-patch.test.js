import test from 'node:test'
import assert from 'node:assert/strict'
import { patchAndroidBackgroundServiceSources } from '../scripts/patch-android-background-service.mjs'

const failureFactory = `        fun failure(code: String, message: String): HeadlessBridgeResult {
            val json = JSONObject().apply {
                put("ok", false)
                put("state", "failed")
                put("code", code)
                put("message", message)
                put("recoverable", true)
            }.toString()
            return HeadlessBridgeResult(false, "failed", message, true, json)
        }`

const fixture = () => ({
  headlessBridge: `data class HeadlessBridgeResult(val ok: Boolean) {
    companion object {
${failureFactory}
    }
}

object HeadlessBridge {
    fun start(context: Context, reason: String): HeadlessBridgeResult {
        ensureLoaded()?.let { return HeadlessBridgeResult.failure("native_library_load_failed", it) }
        return HeadlessBridgeResult.fromJson("{}")
    }

    fun stop(context: Context, reason: String): HeadlessBridgeResult {
        ensureLoaded()?.let { return HeadlessBridgeResult.failure("native_library_load_failed", it) }
        return HeadlessBridgeResult.fromJson("{}")
    }

    private fun ensureLoaded(): String? {
        return null
    }
}
`,
  lifecycleService: '        const val EXTRA_START_REASON = "startReason"\n',
  backgroundServicePlugin: 'putExtra(LifecycleService.EXTRA_START_REASON, "manual_start")\n',
})

test('Android background-service lifecycle patch accepts live starts without JNI and remains idempotent', () => {
  const original = fixture()
  const patched = patchAndroidBackgroundServiceSources(original)
  assert.equal(patched.changed, true)
  assert.match(patched.headlessBridge, /LifecycleService\.START_REASON_MANUAL/)
  assert.match(patched.headlessBridge, /HeadlessBridgeResult\.lifecycleOnly\("Native core/)
  assert.match(patched.headlessBridge, /native_library_load_failed/)
  assert.match(patched.lifecycleService, /START_REASON_MANUAL = "manual_start"/)
  assert.match(patched.backgroundServicePlugin, /LifecycleService\.START_REASON_MANUAL/)

  const twice = patchAndroidBackgroundServiceSources(patched)
  assert.equal(twice.changed, false)
  assert.equal(twice.headlessBridge, patched.headlessBridge)
  assert.equal(twice.lifecycleService, patched.lifecycleService)
  assert.equal(twice.backgroundServicePlugin, patched.backgroundServicePlugin)
})

test('Android background-service patch fails closed when the pinned source drifts', () => {
  const original = fixture()
  original.backgroundServicePlugin = 'putExtra(LifecycleService.EXTRA_START_REASON, dynamicReason)'
  assert.throws(() => patchAndroidBackgroundServiceSources(original), /manual start-reason use/)
})
