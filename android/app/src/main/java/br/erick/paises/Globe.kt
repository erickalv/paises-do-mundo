package br.erick.paises

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.opengl.GLSurfaceView
import android.util.LruCache
import android.view.Choreographer
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.widget.FrameLayout
import javax.microedition.khronos.egl.EGL10
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.egl.EGLDisplay
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

const val MAX_ZOOM = 80.0

/** Orthographic camera looking at (lon0, lat0). */
class Camera {
    var lon0 = -40.0
    var lat0 = 10.0
    var zoom = 1.0
    var baseR = 300.0
    var cx = 0.0
    var cy = 0.0
    var w = 1
    var h = 1
    val r get() = baseR * zoom

    private var m = DoubleArray(9)
    fun update() {
        val l = Math.toRadians(lon0); val p = Math.toRadians(lat0)
        val cl = cos(l); val sl = sin(l); val cp = cos(p); val sp = sin(p)
        // rows of the rotation: world (x right, y up, z towards viewer at lon=lat=0) -> view
        m = doubleArrayOf(
            cl, 0.0, -sl,
            -sl * sp, cp, -cl * sp,
            sl * cp, sp, cl * cp,
        )
    }

    /** column-major mat3 for GLSL */
    fun glRot() = floatArrayOf(
        m[0].toFloat(), m[3].toFloat(), m[6].toFloat(),
        m[1].toFloat(), m[4].toFloat(), m[7].toFloat(),
        m[2].toFloat(), m[5].toFloat(), m[8].toFloat(),
    )

    /** out = screen x, screen y, view z (z < 0: far side) */
    fun project(lon: Double, lat: Double, out: DoubleArray) {
        val l = Math.toRadians(lon); val p = Math.toRadians(lat)
        val x = cos(p) * sin(l); val y = sin(p); val z = cos(p) * cos(l)
        val vx = m[0] * x + m[1] * y + m[2] * z
        val vy = m[3] * x + m[4] * y + m[5] * z
        val vz = m[6] * x + m[7] * y + m[8] * z
        out[0] = cx + vx * r; out[1] = cy - vy * r; out[2] = vz
    }

    /** screen point -> world xyz on the unit sphere, or null outside the globe */
    fun unprojectXYZ(sx: Double, sy: Double): DoubleArray? {
        val vx = (sx - cx) / r; val vy = (cy - sy) / r
        val d = vx * vx + vy * vy
        if (d > 1) return null
        val vz = sqrt(1 - d)
        return doubleArrayOf(
            m[0] * vx + m[3] * vy + m[6] * vz,
            m[1] * vx + m[4] * vy + m[7] * vz,
            m[2] * vx + m[5] * vy + m[8] * vz,
        )
    }

    fun unproject(sx: Double, sy: Double): DoubleArray? {
        val w = unprojectXYZ(sx, sy) ?: return null
        return doubleArrayOf(Math.toDegrees(atan2(w[0], w[2])), Math.toDegrees(asin(w[1].coerceIn(-1.0, 1.0))))
    }
}

fun angularDistance(lon1: Double, lat1: Double, lon2: Double, lat2: Double): Double {
    val a = Math.toRadians(lat1); val b = Math.toRadians(lat2); val dl = Math.toRadians(lon2 - lon1)
    val c = sin(a) * sin(b) + cos(a) * cos(b) * cos(dl)
    return acos(c.coerceIn(-1.0, 1.0))
}

/** One label to draw over the globe. */
class LabelItem(
    val key: String, val name: String, val flag: String, val lon: Double, val lat: Double,
    val sr: Double, val dot: Boolean, val top: Boolean, val missed: Boolean,
    val sub: String? = null,      // second line (History: who the place belongs to)
    val info: List<Pair<String, String>>? = null,   // History: rows shown when the label's arrow is opened
)

interface GlobeListener {
    fun labels(): List<LabelItem>
    fun labelMode(): Int                    // 0 game, 1 revealed (practice), 2 history
    fun onTap(lon: Double, lat: Double, sx: Float, sy: Float)
    fun onInfo(item: LabelItem) {}
}

@SuppressLint("ViewConstructor")
class GlobeHost(context: Context, val data: GeoData) : FrameLayout(context) {
    val cam = Camera()
    val renderer = GlobeRenderer(context, data)
    private val gl = GLSurfaceView(context)
    private val labelsView = LabelsView(context, this)
    var listener: GlobeListener? = null
    private val density = resources.displayMetrics.density

    var autoRotate = true
    private var autoResumeAt = 0L
    private var topInset = 0f
    private var bottomInset = 0f
    private var cyTarget = 0.0

    init {
        gl.setEGLContextClientVersion(3)
        gl.setEGLConfigChooser(MsaaChooser())
        gl.preserveEGLContextOnPause = true
        gl.setRenderer(renderer)
        gl.renderMode = GLSurfaceView.RENDERMODE_WHEN_DIRTY
        addView(gl, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        addView(labelsView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        cam.update()
    }

    fun onResume() = gl.onResume()
    fun onPause() = gl.onPause()

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        cam.w = w; cam.h = h
        relayout(true)
    }

    /** Space taken by the UI above and below the globe, in pixels. */
    fun setInsets(top: Float, bottom: Float) {
        if (top == topInset && bottom == bottomInset) return
        topInset = top; bottomInset = bottom
        relayout(false)
    }

    private fun relayout(snap: Boolean) {
        if (cam.w <= 1) return
        val bottom = if (bottomInset > topInset + 160 * density) bottomInset else cam.h.toFloat()
        val avail = max(120f * density, bottom - topInset)
        cam.baseR = min(cam.w * 0.47, avail * 0.47.toDouble())
        cam.cx = cam.w / 2.0
        cyTarget = topInset + avail / 2.0
        if (snap) cam.cy = cyTarget
        kick()
    }

    fun applyStyle(s: Style) {
        renderer.style.set(s)
        redraw()
    }

    fun redraw() {
        cam.update()
        renderer.view.set(View3D(cam.glRot(), cam.r.toFloat(), cam.cx.toFloat(), cam.cy.toFloat(), cam.w, cam.h, density, cam.zoom.toFloat()))
        gl.requestRender()
        labelsView.invalidate()
    }

    // ---------- animation ----------
    private var fly: Fly? = null
    private var inertiaVx = 0.0
    private var inertiaVy = 0.0
    private var running = false
    private var lastFrame = 0L
    private var touching = false

    private class Fly(val t0: Long, val dur: Long, val lon0: Double, val lat0: Double, val lon1: Double, val lat1: Double, val z0: Double, val z1: Double, val bump: Double)

    private val frameCb = object : Choreographer.FrameCallback {
        override fun doFrame(nanos: Long) {
            val now = nanos / 1_000_000
            val dt = if (lastFrame == 0L) 16.0 else min(64.0, (now - lastFrame).toDouble())
            lastFrame = now
            var anim = false
            if (abs(cam.cy - cyTarget) > 0.5) { cam.cy += (cyTarget - cam.cy) * min(1.0, dt / 120.0); anim = true } else cam.cy = cyTarget
            val f = fly
            if (f != null) {
                val k = min(1.0, (now - f.t0).toDouble() / f.dur)
                val e = if (k < 0.5) 4 * k * k * k else 1 - (-2 * k + 2).pow(3) / 2
                val c = slerp(f.lon0, f.lat0, f.lon1, f.lat1, e)
                cam.lon0 = c[0]; cam.lat0 = c[1]
                cam.zoom = exp(ln(f.z0) + (ln(f.z1) - ln(f.z0)) * e) * (1 - f.bump * sin(PI * e))
                if (k >= 1) fly = null
                anim = true
            } else if (hypot(inertiaVx, inertiaVy) > 0.01 && !touching) {
                rotateBy(inertiaVx * dt, inertiaVy * dt)
                val decay = 0.94.pow(dt / 16)
                inertiaVx *= decay; inertiaVy *= decay
                anim = true
            } else if (autoRotate && !touching && System.currentTimeMillis() > autoResumeAt) {
                cam.lon0 -= dt * 0.006
                anim = true
            }
            redraw()
            if (anim || touching) Choreographer.getInstance().postFrameCallback(this) else { running = false; lastFrame = 0 }
        }
    }

    fun kick() {
        if (!running) { running = true; lastFrame = 0; Choreographer.getInstance().postFrameCallback(frameCb) }
    }

    fun pauseAutoRotate(ms: Long) { autoResumeAt = System.currentTimeMillis() + ms }

    fun flyTo(lon: Double, lat: Double, zoom: Double, durMs: Long? = null) {
        val dist = angularDistance(cam.lon0, cam.lat0, lon, lat)
        val t0 = System.nanoTime() / 1_000_000
        fly = Fly(t0, durMs ?: min(1500.0, 600 + dist * 420).toLong(), cam.lon0, cam.lat0, lon, lat, cam.zoom, zoom, min(0.45, dist / PI * 0.7))
        inertiaVx = 0.0; inertiaVy = 0.0
        pauseAutoRotate(5000)
        kick()
    }

    /** Zoom that frames an entity, like the web version. */
    fun zoomFor(e: Entity): Double {
        val minDim = min(cam.w.toDouble(), cyTarget * 2)
        var theta = 0.03
        e.bounds?.let { b ->
            val dLon = if (b[2] >= b[0]) b[2] - b[0] else b[2] + 360 - b[0]
            val midLat = Math.toRadians((b[1] + b[3]) / 2)
            theta = Math.toRadians(max(dLon * cos(midLat), b[3] - b[1]))
        }
        theta = max(theta, 0.004)
        val z = (0.28 * minDim / theta) / cam.baseR
        // small places get more zoom so islands are visible as shapes
        return z.coerceIn(1.0, if (e.area < 30000) 12.0 else 4.0)
    }

    private fun slerp(lon0: Double, lat0: Double, lon1: Double, lat1: Double, t: Double): DoubleArray {
        fun xyz(lon: Double, lat: Double): DoubleArray {
            val l = Math.toRadians(lon); val p = Math.toRadians(lat)
            return doubleArrayOf(cos(p) * sin(l), sin(p), cos(p) * cos(l))
        }
        val a = xyz(lon0, lat0); val b = xyz(lon1, lat1)
        val d = acos((a[0] * b[0] + a[1] * b[1] + a[2] * b[2]).coerceIn(-1.0, 1.0))
        if (d < 1e-6) return doubleArrayOf(lon1, lat1)
        val s = sin(d)
        val ka = sin((1 - t) * d) / s; val kb = sin(t * d) / s
        val x = a[0] * ka + b[0] * kb; val y = a[1] * ka + b[1] * kb; val z = a[2] * ka + b[2] * kb
        return doubleArrayOf(Math.toDegrees(atan2(x, z)), Math.toDegrees(asin(y.coerceIn(-1.0, 1.0))))
    }

    private fun rotateBy(dx: Double, dy: Double) {
        val k = 180 / PI / cam.r
        cam.lon0 -= dx * k
        cam.lat0 = (cam.lat0 + dy * k).coerceIn(-89.0, 89.0)
    }

    // ---------- gestures ----------
    private val scale = ScaleGestureDetector(context, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
        override fun onScale(d: ScaleGestureDetector): Boolean {
            cam.zoom = (cam.zoom * d.scaleFactor).coerceIn(0.8, MAX_ZOOM)
            return true
        }
    })
    private val gestures = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
        override fun onDown(e: MotionEvent): Boolean {
            fly = null; inertiaVx = 0.0; inertiaVy = 0.0
            return true
        }
        override fun onScroll(e1: MotionEvent?, e2: MotionEvent, dx: Float, dy: Float): Boolean {
            rotateBy(-dx.toDouble(), -dy.toDouble())
            return true
        }
        override fun onFling(e1: MotionEvent?, e2: MotionEvent, vx: Float, vy: Float): Boolean {
            if (e2.pointerCount > 1) return false
            inertiaVx = vx / 1000.0; inertiaVy = vy / 1000.0
            return true
        }
        override fun onSingleTapConfirmed(e: MotionEvent): Boolean {
            labelsView.infoAt(e.x, e.y)?.let { labelsView.toggle(it); return true }
            if (labelsView.inPanel(e.x, e.y)) return true
            val ll = cam.unproject(e.x.toDouble(), e.y.toDouble())
            if (ll != null) listener?.onTap(ll[0], ll[1], e.x, e.y)
            return true
        }
        override fun onDoubleTap(e: MotionEvent): Boolean {
            val ll = cam.unproject(e.x.toDouble(), e.y.toDouble()) ?: return true
            flyTo(ll[0], ll[1], (cam.zoom * 1.8).coerceIn(0.8, MAX_ZOOM), 450)
            return true
        }
    })

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(ev: MotionEvent): Boolean {
        when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN -> { touching = true; autoResumeAt = Long.MAX_VALUE }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> { touching = false; autoResumeAt = System.currentTimeMillis() + 4000 }
        }
        scale.onTouchEvent(ev)
        gestures.onTouchEvent(ev)
        kick()
        return true
    }

    /** MSAA 4x when available, so borders and coasts look smooth; a stencil buffer keeps highlights on land. */
    private class MsaaChooser : GLSurfaceView.EGLConfigChooser {
        override fun chooseConfig(egl: EGL10, display: EGLDisplay): EGLConfig {
            val EGL_OPENGL_ES3_BIT = 0x40
            fun pick(samples: Int, stencil: Boolean = true): EGLConfig? {
                val attrs = mutableListOf(
                    EGL10.EGL_RED_SIZE, 8, EGL10.EGL_GREEN_SIZE, 8, EGL10.EGL_BLUE_SIZE, 8,
                    EGL10.EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT,
                )
                if (stencil) attrs += listOf(EGL10.EGL_STENCIL_SIZE, 8)
                if (samples > 0) attrs += listOf(EGL10.EGL_SAMPLE_BUFFERS, 1, EGL10.EGL_SAMPLES, samples)
                attrs += EGL10.EGL_NONE
                val n = IntArray(1)
                val cfgs = arrayOfNulls<EGLConfig>(1)
                return if (egl.eglChooseConfig(display, attrs.toIntArray(), cfgs, 1, n) && n[0] > 0) cfgs[0] else null
            }
            return pick(4) ?: pick(0) ?: pick(4, false) ?: pick(0, false) ?: throw IllegalStateException("No EGL config")
        }
    }
}

/** Draws the country labels (flag + name) on top of the globe. */
@SuppressLint("ViewConstructor")
class LabelsView(context: Context, private val host: GlobeHost) : View(context) {
    private val d = resources.displayMetrics.density
    private val bg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#EE15181F") }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = d; color = Color.parseColor("#2C313C") }
    private val strokeMissed = Paint(stroke).apply { color = Color.parseColor("#99E58F7E") }
    private val strokeTop = Paint(stroke).apply { color = Color.parseColor("#88E6C66E") }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#F2EEE4"); textSize = 13.5f * d; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    private val subText = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#C9C2B0"); textSize = 12f * d; typeface = Typeface.DEFAULT
    }
    private val blank = Paint().apply { color = Color.parseColor("#F4F4F2") }
    private val flagBorder = Paint().apply { color = Color.parseColor("#2A2F3A") }
    private val bmpPaint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val cache = LruCache<String, Bitmap>(160)
    private val tmp = DoubleArray(3)
    private val rect = RectF()
    private val arrow = Path()
    private val infoRing = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 1.3f * d; color = Color.parseColor("#8F96A6") }
    private val infoText = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#AEB4C2"); textSize = 11f * d; textAlign = Paint.Align.CENTER
        typeface = Typeface.create(Typeface.SERIF, Typeface.BOLD_ITALIC)
    }
    /** where the (i) buttons were drawn in the last frame */
    private val infoHits = ArrayList<Pair<RectF, LabelItem>>()

    fun infoAt(x: Float, y: Float): LabelItem? = infoHits.lastOrNull { it.first.contains(x, y) }?.second
    /** key of the label whose info rows are open (it stays open while the globe turns or the year changes) */
    private var openKey: String? = null
    private val panelHits = ArrayList<RectF>()
    fun toggle(item: LabelItem) { openKey = if (openKey == item.key) null else item.key; invalidate() }
    fun inPanel(x: Float, y: Float) = panelHits.any { it.contains(x, y) }
    private val rowKey = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#8F96A6"); textSize = 11f * d; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD) }
    private val rowVal = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#E2E6EE"); textSize = 13f * d }
    private val sep = Paint().apply { color = Color.parseColor("#2C313C") }
    private val chevron = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#AEB4C2") }
    private val chevPath = Path()

    private fun wrap(t: String, p: Paint, maxW: Float): List<String> {
        val out = ArrayList<String>()
        for (para in t.split('\n')) {
            var line = ""
            for (word in para.split(' ')) {
                val tryL = if (line.isEmpty()) word else "$line $word"
                if (line.isNotEmpty() && p.measureText(tryL) > maxW) { out += line; line = word } else line = tryL
            }
            out += line
        }
        return out
    }

    private fun flag(ref: String): Bitmap? {
        if (ref == "blank") return null
        cache.get(ref)?.let { return it }
        val file = if (ref.startsWith("x:")) "flags/x_${ref.substring(2)}.png" else "flags/h_${ref.substring(2)}.png"
        val b = try { context.assets.open(file).use { BitmapFactory.decodeStream(it) } } catch (_: Exception) { null } ?: return null
        cache.put(ref, b)
        return b
    }

    override fun onDraw(canvas: Canvas) {
        val l = host.listener ?: return
        val cam = host.cam
        infoHits.clear(); panelHits.clear()
        val items = l.labels()
        if (items.isEmpty()) return
        val mode = l.labelMode()
        if (mode != 2) openKey = null
        val R = cam.r
        val d2 = d * d
        val placed = ArrayList<FloatArray>()
        val fw = 24 * d; val fh = 18 * d; val pad = 6 * d; val gap = 7 * d
        for (it in items) {
            cam.project(it.lon, it.lat, tmp)
            if (tmp[2] <= 0.02) continue
            if (mode == 2 && angularDistance(it.lon, it.lat, cam.lon0, cam.lat0) > 1.2) continue
            val px = it.sr * R * R
            if (!it.top) {
                val min = 120 * d2
                val dotOk = it.dot && cam.zoom > 2.0
                if (px < min && !dotOk && !(mode == 2 && it.missed && px > 25 * d2)) continue
            }
            val sub = it.sub
            val subs = sub?.split('\n') ?: emptyList()   // the second line may hold several lines
            val bmp = flag(it.flag)
            val fwE = if (bmp != null) fw + gap else 0f   // no flag: only the name
            val h = if (sub != null) fh + 2 * pad + subs.size * (subText.textSize + 3 * d) else fh + 2 * pad
            val iw = if (it.info.isNullOrEmpty()) 0f else 22 * d   // room for the (i) button
            val nameW = text.measureText(it.name) + iw
            var w = pad + fwE + max(nameW, subs.maxOfOrNull { l -> subText.measureText(l) } ?: 0f) + pad * 1.4f
            val open = !it.info.isNullOrEmpty() && it.key == openKey
            // open label: the info rows hang below the name, inside the same shape
            val maxW = min(280 * d, width - 24 * d)
            val rows = if (!open) emptyList() else it.info!!.map { (k, v) -> k to wrap(v, rowVal, maxW - 2 * pad) }
            if (open) w = max(w, min(maxW, rows.maxOf { (k, ls) -> max(rowKey.measureText(k), ls.maxOf { l -> rowVal.measureText(l) }) } + 2 * pad))
            val lineV = rowVal.textSize + 3 * d; val lineK = rowKey.textSize + 4 * d
            val extra = if (!open) 0f else 6 * d + rows.sumOf { (_, ls) -> (lineK + ls.size * lineV + 8 * d).toDouble() }.toFloat()
            val rpx = sqrt(it.sr / PI) * R
            // a label wider than its country sits above it, with a pointer to the right place
            val above = it.dot || rpx * 2.2 < w
            var x = (tmp[0] - w / 2).toFloat()
            if (open) x = x.coerceIn(6 * d, max(6 * d, width - w - 6 * d))
            val y = if (above) (tmp[1] - h - max(12.0 * d, if (it.dot) 12.0 * d else rpx * 0.9 + 8 * d)).toFloat() else (tmp[1] - h / 2).toFloat()
            val box = floatArrayOf(x - 3 * d, y - 3 * d, x + w + 3 * d, y + h + extra + 3 * d)
            if (!it.top && placed.any { b -> box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1] }) continue
            placed += box
            rect.set(x, y, x + w, y + h + extra)
            canvas.drawRoundRect(rect, 10 * d, 10 * d, bg)
            if (open) panelHits += RectF(rect)
            if (above && !open) {
                arrow.reset()
                arrow.moveTo(tmp[0].toFloat() - 6 * d, y + h - 0.5f)
                arrow.lineTo(tmp[0].toFloat() + 6 * d, y + h - 0.5f)
                arrow.lineTo(tmp[0].toFloat(), y + h + 6 * d)
                arrow.close()
                canvas.drawPath(arrow, bg)
            }
            canvas.drawRoundRect(rect, 10 * d, 10 * d, if (it.missed && mode == 1) strokeMissed else if (it.top && mode != 1) strokeTop else stroke)
            if (bmp != null) {
                rect.set(x + pad, y + pad, x + pad + fw, y + pad + fh)
                canvas.drawBitmap(bmp, null, rect, bmpPaint)
            }
            val tx = x + pad + fwE
            if (sub == null) canvas.drawText(it.name, tx, y + h / 2 - (text.descent() + text.ascent()) / 2, text)
            else {
                canvas.drawText(it.name, tx, y + pad + fh / 2 - (text.descent() + text.ascent()) / 2, text)
                subs.forEachIndexed { k, l -> canvas.drawText(l, tx, y + pad + fh + 3 * d + k * (subText.textSize + 3 * d) - subText.ascent(), subText) }
            }
            if (iw > 0) {
                // small arrow: pointing left when closed, down when open
                val cx = x + w - pad * 0.9f - 8 * d
                val cy = if (sub == null) y + h / 2 else y + pad + fh / 2
                val a = 4.5f * d
                chevPath.reset()
                if (open) { chevPath.moveTo(cx - a, cy - a * 0.6f); chevPath.lineTo(cx + a, cy - a * 0.6f); chevPath.lineTo(cx, cy + a * 0.7f) }
                else { chevPath.moveTo(cx + a * 0.6f, cy - a); chevPath.lineTo(cx + a * 0.6f, cy + a); chevPath.lineTo(cx - a * 0.7f, cy) }
                chevPath.close()
                canvas.drawPath(chevPath, chevron)
                infoHits += RectF(cx - 20 * d, cy - 20 * d, cx + 20 * d, cy + 20 * d) to it
            }
            if (open) {
                var yy = y + h
                canvas.drawRect(x + pad, yy, x + w - pad, yy + d, sep)
                yy += 6 * d
                for ((k, ls) in rows) {
                    canvas.drawText(k, x + pad, yy - rowKey.ascent(), rowKey); yy += lineK
                    for (ln in ls) { canvas.drawText(ln, x + pad, yy - rowVal.ascent(), rowVal); yy += lineV }
                    yy += 8 * d
                }
            }
        }
    }
}
