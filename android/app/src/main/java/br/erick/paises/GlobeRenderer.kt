package br.erick.paises

import android.content.Context
import android.opengl.GLES30.*
import android.opengl.GLSurfaceView
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.IntBuffer
import java.util.concurrent.atomic.AtomicReference
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.math.cos
import kotlin.math.sin

/** What the renderer needs to know about the camera for one frame. */
class View3D(
    val rot: FloatArray, val r: Float, val cx: Float, val cy: Float,
    val w: Int, val h: Int, val density: Float, val zoom: Float,
)

/** Colours and border rules, rebuilt by the UI whenever the game state changes. */
class Style(
    val palette: ByteArray,        // RGBA per piece
    val units: ByteArray,          // RGBA-encoded unit code per piece (borders are drawn between different units)
    val faintToday: Boolean,       // History tab: draw today's borders faintly underneath
    val dotColors: FloatArray,     // RGBA per dot
    val snap: Int = -1,            // before 1946: index of the historical map whose borders are drawn
    val snapUnits: ByteArray? = null, // RGBA-encoded unit code per unit of that map
    val pickUnits: Set<Int> = emptySet(), // before 1946: units of the historical map painted yellow (the tapped one)
)

class GlobeRenderer(private val ctx: Context, private val data: GeoData) : GLSurfaceView.Renderer {
    val view = AtomicReference<View3D?>(null)
    val style = AtomicReference<Style?>(null)
    private var styleUploaded: Style? = null

    private var progBg = 0; private var progLand = 0; private var progLine = 0; private var progDot = 0; private var progFill = 0
    private var fillSnap = -1; private var fillVao = 0; private var fillCount = 0; private val fillBufs = IntArray(2)
    private var vaoLand = 0; private var landCount = 0
    private var vaoBorder = 0; private var borderCount = 0
    private var vaoGrat = 0; private var gratCount = 0
    private var vaoDot = 0; private var dotCount = 0
    private var vaoQuad = 0
    private var texPal = 0; private var texUnit = 0; private var texOwner = 0; private var texSnap = 0
    private val snapVaos = HashMap<Int, IntArray>()   // snap index -> (vao, index count)
    private var dotColorBuf = 0
    private val nPieces = data.pieceIds.size

    /** dot index -> entity index */
    val dotEntities: IntArray = data.entities.filter { it.dot }.map { it.index }.toIntArray()

    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        progBg = program(VS_QUAD, FS_BG)
        progLand = program(VS_LAND, FS_LAND)
        progLine = program(VS_LINE, FS_LINE)
        progDot = program(VS_DOT, FS_DOT)
        progFill = program(VS_FILL, FS_FILL)
        fillSnap = -1; fillVao = 0
        loadGlobe()
        buildGraticule()
        buildDots()
        buildQuad()
        texPal = makeTex(); texUnit = makeTex(); texOwner = makeTex(); texSnap = makeTex()
        snapVaos.clear()
        // static owner mapping (today's borders)
        val own = ByteArray(nPieces * 4)
        for (p in 0 until nPieces) putCode(own, p, if (data.pieceOwner[p] >= 0) data.pieceOwner[p] else 100000 + p)
        uploadTex(texOwner, own)
        styleUploaded = null
        glEnable(GL_BLEND)
        glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA)
        glDisable(GL_DEPTH_TEST)
        glDisable(GL_CULL_FACE)
    }

    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        glViewport(0, 0, width, height)
    }

    override fun onDrawFrame(gl: GL10?) {
        glClearColor(0f, 0f, 0f, 1f)
        glClearStencil(0)
        glClear(GL_COLOR_BUFFER_BIT or GL_STENCIL_BUFFER_BIT)
        val v = view.get() ?: return
        val st = style.get()
        if (st != null && st !== styleUploaded) {
            uploadTex(texPal, st.palette)
            uploadTex(texUnit, st.units)
            st.snapUnits?.let { uploadTex(texSnap, it) }
            glBindBuffer(GL_ARRAY_BUFFER, dotColorBuf)
            glBufferSubData(GL_ARRAY_BUFFER, 0, st.dotColors.size * 4, floatBuf(st.dotColors))
            styleUploaded = st
        }
        if (st == null) return

        // ocean + atmosphere
        drawQuad(v, 0)
        // graticule
        lines(v, vaoGrat, gratCount, texOwner, 1, floatArrayOf(1f, 1f, 1f, 0.05f), 1f)
        // land
        glUseProgram(progLand)
        common(progLand, v)
        glActiveTexture(GL_TEXTURE0); glBindTexture(GL_TEXTURE_2D, texPal)
        glUniform1i(glGetUniformLocation(progLand, "uPal"), 0)
        glBindVertexArray(vaoLand)
        // land marks the stencil, so the yellow fill of a tapped historical unit stays on land
        glEnable(GL_STENCIL_TEST)
        glStencilFunc(GL_ALWAYS, 1, 0xFF); glStencilOp(GL_KEEP, GL_KEEP, GL_REPLACE)
        glDrawElements(GL_TRIANGLES, landCount, GL_UNSIGNED_INT, 0)
        if (st.snap >= 0 && st.pickUnits.isNotEmpty()) {
            glStencilFunc(GL_EQUAL, 1, 0xFF); glStencilOp(GL_KEEP, GL_KEEP, GL_KEEP)
            drawFill(v, st.snap, st.pickUnits)
        }
        glDisable(GL_STENCIL_TEST)
        // borders
        val bc = floatArrayOf(98 / 255f, 94 / 255f, 84 / 255f, 0.8f)
        if (st.faintToday) lines(v, vaoBorder, borderCount, texOwner, 0, floatArrayOf(98 / 255f, 94 / 255f, 84 / 255f, 0.25f), 0.5f * v.density)
        if (st.snap >= 0 && st.snapUnits != null) {
            val sv = snapLines(st.snap)
            lines(v, sv[0], sv[1], texSnap, 0, bc, 0.75f * v.density)
        } else {
            lines(v, vaoBorder, borderCount, texUnit, 0, bc, 0.75f * v.density)
        }
        // dots for tiny places
        glUseProgram(progDot)
        common(progDot, v)
        glUniform1f(glGetUniformLocation(progDot, "uSize"), (2f * (3.2f + minOf(3f, v.zoom * 0.12f)) + 2f) * v.density)
        glUniform1f(glGetUniformLocation(progDot, "uHide"), 600f * v.density * v.density)
        glBindVertexArray(vaoDot)
        glDrawArrays(GL_POINTS, 0, dotCount)
        // shading and rim
        drawQuad(v, 1)
        glBindVertexArray(0)
    }

    /** Yellow fill of the tapped unit of a historical map: only the chunks of that unit are drawn. */
    private fun drawFill(v: View3D, snap: Int, units: Set<Int>) {
        val m = data.fill(snap)
        if (fillSnap != snap) {
            if (fillVao != 0) { glDeleteVertexArrays(1, intArrayOf(fillVao), 0); glDeleteBuffers(2, fillBufs, 0); fillVao = 0 }
            fillVao = genVao()
            glBindVertexArray(fillVao)
            val vb = ByteBuffer.allocateDirect(m.lonLat.size * 2).order(ByteOrder.nativeOrder())
            vb.asShortBuffer().put(m.lonLat); vb.position(0)
            fillBufs[0] = vbo(vb, m.lonLat.size * 2)
            glEnableVertexAttribArray(0)
            val ib = ByteBuffer.allocateDirect(m.idx.size * 2).order(ByteOrder.nativeOrder())
            ib.asShortBuffer().put(m.idx); ib.position(0)
            val a = IntArray(1); glGenBuffers(1, a, 0); fillBufs[1] = a[0]
            glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, a[0]); glBufferData(GL_ELEMENT_ARRAY_BUFFER, m.idx.size * 2, ib, GL_STATIC_DRAW)
            fillSnap = snap
        }
        glUseProgram(progFill)
        common(progFill, v)
        glBindVertexArray(fillVao)
        glBindBuffer(GL_ARRAY_BUFFER, fillBufs[0])
        for (c in m.chunkUnit.indices) {
            if (m.chunkUnit[c] !in units) continue
            glVertexAttribPointer(0, 2, GL_SHORT, false, 4, m.chunkVBase[c] * 4)
            glDrawElements(GL_TRIANGLES, m.chunkCount[c], GL_UNSIGNED_SHORT, m.chunkIBase[c] * 2)
        }
    }

    private fun common(p: Int, v: View3D) {
        glUniformMatrix3fv(glGetUniformLocation(p, "uRot"), 1, false, v.rot, 0)
        glUniform1f(glGetUniformLocation(p, "uR"), v.r)
        glUniform2f(glGetUniformLocation(p, "uCenter"), v.cx, v.cy)
        glUniform2f(glGetUniformLocation(p, "uViewport"), v.w.toFloat(), v.h.toFloat())
    }

    private fun lines(v: View3D, vao: Int, count: Int, unitTex: Int, always: Int, color: FloatArray, widthPx: Float) {
        glUseProgram(progLine)
        common(progLine, v)
        glUniform1f(glGetUniformLocation(progLine, "uWidth"), maxOf(1f, widthPx))
        glUniform1i(glGetUniformLocation(progLine, "uAlways"), always)
        glUniform4fv(glGetUniformLocation(progLine, "uColor"), 1, color, 0)
        glActiveTexture(GL_TEXTURE1); glBindTexture(GL_TEXTURE_2D, unitTex)
        glUniform1i(glGetUniformLocation(progLine, "uUnit"), 1)
        glBindVertexArray(vao)
        glDrawElements(GL_TRIANGLES, count, GL_UNSIGNED_INT, 0)
    }

    private fun drawQuad(v: View3D, mode: Int) {
        glUseProgram(progBg)
        glUniform1f(glGetUniformLocation(progBg, "uR"), v.r)
        glUniform2f(glGetUniformLocation(progBg, "uCenter"), v.cx, v.cy)
        glUniform2f(glGetUniformLocation(progBg, "uViewport"), v.w.toFloat(), v.h.toFloat())
        glUniform1i(glGetUniformLocation(progBg, "uMode"), mode)
        glUniform1f(glGetUniformLocation(progBg, "uPx"), v.density)
        glBindVertexArray(vaoQuad)
        glDrawArrays(GL_TRIANGLE_STRIP, 0, 4)
    }

    // ---------- geometry ----------
    private fun loadGlobe() {
        val bytes = ctx.assets.open("globe.bin").use { it.readBytes() }
        val bb = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        bb.position(4)
        val nv = bb.int; val ni = bb.int; val ns = bb.int
        var off = 16
        val posBuf = slice(bytes, off, nv * 12); off += nv * 12
        val pidBytes = ByteArray(nv * 2); System.arraycopy(bytes, off, pidBytes, 0, nv * 2); off += nv * 2
        if (nv % 2 == 1) off += 2
        val idxBuf = slice(bytes, off, ni * 4); off += ni * 4
        // piece ids -> floats
        val pid = ByteBuffer.wrap(pidBytes).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
        val pidF = FloatArray(nv) { (pid.get(it).toInt() and 0xFFFF).toFloat() }
        hit = HitData(bytes, 16, nv, off - ni * 4, ni, pidF)

        vaoLand = genVao()
        glBindVertexArray(vaoLand)
        vbo(posBuf, nv * 12); attrib(0, 3, 12, 0)
        vbo(floatBuf(pidF), nv * 4); attrib(1, 1, 4, 0)
        ebo(idxBuf, ni * 4)
        landCount = ni

        val q = segmentQuads(ByteBuffer.wrap(bytes, off, ns * 28).order(ByteOrder.LITTLE_ENDIAN), ns)
        vaoBorder = lineVao(q.first, q.second)
        borderCount = q.second.size
    }

    /** Border segments of a historical map, loaded the first time that map is shown. */
    private fun snapLines(si: Int): IntArray = snapVaos.getOrPut(si) {
        val bytes = ctx.assets.open("hist/s${data.snapYears[si]}.bin").use { it.readBytes() }
        val bb = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        bb.position(4)
        val ns = bb.int
        val q = segmentQuads(ByteBuffer.wrap(bytes, 8, ns * 28).order(ByteOrder.LITTLE_ENDIAN), ns)
        intArrayOf(lineVao(q.first, q.second), q.second.size)
    }

    /** Each segment becomes a quad (4 vertices) widened on screen by the line shader. */
    private fun segmentQuads(segs: ByteBuffer, ns: Int): Pair<FloatArray, IntArray> {
        val verts = FloatArray(ns * 4 * 10)
        val idx = IntArray(ns * 6)
        for (s in 0 until ns) {
            val ax = segs.float; val ay = segs.float; val az = segs.float
            val bx = segs.float; val by = segs.float; val bz = segs.float
            val pa = (segs.short.toInt() and 0xFFFF).toFloat(); val pb = (segs.short.toInt() and 0xFFFF).toFloat()
            for (k in 0 until 4) {
                val o = (s * 4 + k) * 10
                verts[o] = ax; verts[o + 1] = ay; verts[o + 2] = az
                verts[o + 3] = bx; verts[o + 4] = by; verts[o + 5] = bz
                verts[o + 6] = if (k < 2) 0f else 1f
                verts[o + 7] = if (k % 2 == 0) -1f else 1f
                verts[o + 8] = pa; verts[o + 9] = pb
            }
            val b = s * 4; val i = s * 6
            idx[i] = b; idx[i + 1] = b + 1; idx[i + 2] = b + 2; idx[i + 3] = b + 1; idx[i + 4] = b + 3; idx[i + 5] = b + 2
        }
        return verts to idx
    }

    private fun buildGraticule() {
        val segs = ArrayList<FloatArray>()
        fun xyz(lon: Double, lat: Double): FloatArray {
            val l = Math.toRadians(lon); val p = Math.toRadians(lat)
            return floatArrayOf((cos(p) * sin(l)).toFloat(), sin(p).toFloat(), (cos(p) * cos(l)).toFloat())
        }
        for (lon in -180 until 180 step 10) for (lat in -80 until 80 step 2) segs += xyz(lon.toDouble(), lat.toDouble()) + xyz(lon.toDouble(), lat + 2.0)
        for (lat in -80..80 step 10) for (lon in -180 until 180 step 2) segs += xyz(lon.toDouble(), lat.toDouble()) + xyz(lon + 2.0, lat.toDouble())
        val verts = FloatArray(segs.size * 40)
        val idx = IntArray(segs.size * 6)
        segs.forEachIndexed { s, a ->
            for (k in 0 until 4) {
                val o = (s * 4 + k) * 10
                System.arraycopy(a, 0, verts, o, 6)
                verts[o + 6] = if (k < 2) 0f else 1f
                verts[o + 7] = if (k % 2 == 0) -1f else 1f
            }
            val b = s * 4; val i = s * 6
            idx[i] = b; idx[i + 1] = b + 1; idx[i + 2] = b + 2; idx[i + 3] = b + 1; idx[i + 4] = b + 3; idx[i + 5] = b + 2
        }
        vaoGrat = lineVao(verts, idx)
        gratCount = idx.size
    }

    private fun buildDots() {
        val n = dotEntities.size
        val pos = FloatArray(n * 4)
        for ((k, ei) in dotEntities.withIndex()) {
            val e = data.entities[ei]
            val l = Math.toRadians(e.lon); val p = Math.toRadians(e.lat)
            pos[k * 4] = (cos(p) * sin(l)).toFloat(); pos[k * 4 + 1] = sin(p).toFloat(); pos[k * 4 + 2] = (cos(p) * cos(l)).toFloat()
            pos[k * 4 + 3] = e.sr.toFloat()
        }
        vaoDot = genVao()
        glBindVertexArray(vaoDot)
        vbo(floatBuf(pos), pos.size * 4); attrib(0, 3, 16, 0); attrib(1, 1, 16, 12)
        dotColorBuf = vbo(floatBuf(FloatArray(n * 4)), n * 16, GL_DYNAMIC_DRAW); attrib(2, 4, 16, 0)
        dotCount = n
    }

    private fun buildQuad() {
        vaoQuad = genVao()
        glBindVertexArray(vaoQuad)
        vbo(floatBuf(floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f)), 32); attrib(0, 2, 8, 0)
    }

    private fun lineVao(verts: FloatArray, idx: IntArray): Int {
        val vao = genVao()
        glBindVertexArray(vao)
        vbo(floatBuf(verts), verts.size * 4)
        attrib(0, 3, 40, 0); attrib(1, 3, 40, 12); attrib(2, 1, 40, 24); attrib(3, 1, 40, 28); attrib(4, 2, 40, 32)
        ebo(intBuf(idx), idx.size * 4)
        return vao
    }

    // ---------- CPU copy for hit testing (tap on a country) ----------
    class HitData(val bytes: ByteArray, val posOff: Int, val nv: Int, val idxOff: Int, val ni: Int, val piece: FloatArray) {
        private val pos = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        fun pieceAt(x: Double, y: Double, z: Double, allowed: (Int) -> Boolean): Int {
            val ib = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
            var t = 0
            while (t < ni) {
                val a = ib.getInt(idxOff + t * 4); val b = ib.getInt(idxOff + t * 4 + 4); val c = ib.getInt(idxOff + t * 4 + 8)
                t += 3
                val p = piece[a].toInt()
                if (!allowed(p)) continue
                if (inside(a, b, c, x, y, z)) return p
            }
            return -1
        }
        private fun v(i: Int, k: Int) = pos.getFloat(posOff + i * 12 + k * 4).toDouble()
        private fun inside(a: Int, b: Int, c: Int, x: Double, y: Double, z: Double): Boolean {
            val ax = v(a, 0); val ay = v(a, 1); val az = v(a, 2)
            val bx = v(b, 0); val by = v(b, 1); val bz = v(b, 2)
            val cx = v(c, 0); val cy = v(c, 1); val cz = v(c, 2)
            if (ax * x + ay * y + az * z < 0.9) return false
            fun side(px: Double, py: Double, pz: Double, qx: Double, qy: Double, qz: Double): Double {
                // sign of (p × q) · point
                val nx = py * qz - pz * qy; val ny = pz * qx - px * qz; val nz = px * qy - py * qx
                return nx * x + ny * y + nz * z
            }
            val s1 = side(ax, ay, az, bx, by, bz); val s2 = side(bx, by, bz, cx, cy, cz); val s3 = side(cx, cy, cz, ax, ay, az)
            return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)
        }
    }
    @Volatile var hit: HitData? = null

    // ---------- GL helpers ----------
    private fun slice(bytes: ByteArray, off: Int, len: Int): ByteBuffer {
        val b = ByteBuffer.allocateDirect(len).order(ByteOrder.nativeOrder())
        // data is little endian; Android devices are little endian too
        b.put(bytes, off, len); b.position(0); return b
    }
    private fun floatBuf(a: FloatArray): FloatBuffer {
        val b = ByteBuffer.allocateDirect(a.size * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()
        b.put(a); b.position(0); return b
    }
    private fun intBuf(a: IntArray): IntBuffer {
        val b = ByteBuffer.allocateDirect(a.size * 4).order(ByteOrder.nativeOrder()).asIntBuffer()
        b.put(a); b.position(0); return b
    }
    private fun genVao(): Int { val a = IntArray(1); glGenVertexArrays(1, a, 0); return a[0] }
    private fun vbo(buf: java.nio.Buffer, bytes: Int, usage: Int = GL_STATIC_DRAW): Int {
        val a = IntArray(1); glGenBuffers(1, a, 0)
        glBindBuffer(GL_ARRAY_BUFFER, a[0]); glBufferData(GL_ARRAY_BUFFER, bytes, buf, usage)
        return a[0]
    }
    private fun ebo(buf: java.nio.Buffer, bytes: Int) {
        val a = IntArray(1); glGenBuffers(1, a, 0)
        glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, a[0]); glBufferData(GL_ELEMENT_ARRAY_BUFFER, bytes, buf, GL_STATIC_DRAW)
    }
    private fun attrib(loc: Int, size: Int, stride: Int, offset: Int) {
        glEnableVertexAttribArray(loc)
        glVertexAttribPointer(loc, size, GL_FLOAT, false, stride, offset)
    }
    private fun makeTex(): Int {
        val a = IntArray(1); glGenTextures(1, a, 0)
        glBindTexture(GL_TEXTURE_2D, a[0])
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST)
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST)
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE)
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE)
        return a[0]
    }
    private fun uploadTex(tex: Int, rgba: ByteArray) {
        glBindTexture(GL_TEXTURE_2D, tex)
        glPixelStorei(GL_UNPACK_ALIGNMENT, 1)
        val b = ByteBuffer.allocateDirect(rgba.size).order(ByteOrder.nativeOrder()); b.put(rgba); b.position(0)
        glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, rgba.size / 4, 1, 0, GL_RGBA, GL_UNSIGNED_BYTE, b)
    }
    private fun program(vs: String, fs: String): Int {
        fun shader(type: Int, src: String): Int {
            val s = glCreateShader(type); glShaderSource(s, src); glCompileShader(s)
            val ok = IntArray(1); glGetShaderiv(s, GL_COMPILE_STATUS, ok, 0)
            if (ok[0] == 0) throw RuntimeException("shader: " + glGetShaderInfoLog(s))
            return s
        }
        val p = glCreateProgram()
        glAttachShader(p, shader(GL_VERTEX_SHADER, vs)); glAttachShader(p, shader(GL_FRAGMENT_SHADER, fs))
        glLinkProgram(p)
        val ok = IntArray(1); glGetProgramiv(p, GL_LINK_STATUS, ok, 0)
        if (ok[0] == 0) throw RuntimeException("link: " + glGetProgramInfoLog(p))
        return p
    }

    companion object {
        /** Encodes an integer code into 3 bytes of an RGBA texel. */
        fun putCode(a: ByteArray, p: Int, code: Int) {
            a[p * 4] = (code and 0xFF).toByte(); a[p * 4 + 1] = ((code shr 8) and 0xFF).toByte()
            a[p * 4 + 2] = ((code shr 16) and 0xFF).toByte(); a[p * 4 + 3] = 0xFF.toByte()
        }

        private const val PROJ = """
uniform mat3 uRot; uniform float uR; uniform vec2 uCenter; uniform vec2 uViewport;
vec2 toScreen(vec3 p) { return vec2(uCenter.x + p.x * uR, uCenter.y - p.y * uR); }
vec4 toClip(vec2 s) { return vec4(s.x / uViewport.x * 2.0 - 1.0, 1.0 - s.y / uViewport.y * 2.0, 0.0, 1.0); }
"""
        const val VS_LAND = "#version 300 es\n" + PROJ + """
layout(location = 0) in vec3 aPos;
layout(location = 1) in float aPiece;
uniform sampler2D uPal;
out vec4 vColor; out float vZ;
void main() {
    vec3 p = uRot * aPos;
    vZ = p.z;
    vColor = texelFetch(uPal, ivec2(int(aPiece + 0.5), 0), 0);
    gl_Position = toClip(toScreen(p));
}"""
        const val FS_LAND = """#version 300 es
precision mediump float;
in vec4 vColor; in float vZ; out vec4 o;
void main() { if (vZ < 0.0) discard; o = vColor; }"""

        const val VS_LINE = "#version 300 es\n" + PROJ + """
layout(location = 0) in vec3 aA;
layout(location = 1) in vec3 aB;
layout(location = 2) in float aEnd;
layout(location = 3) in float aSide;
layout(location = 4) in vec2 aPieces;
uniform sampler2D uUnit; uniform float uWidth; uniform int uAlways;
out float vZ;
void main() {
    vec3 A = uRot * aA; vec3 B = uRot * aB;
    vZ = min(A.z, B.z);
    if (uAlways == 0) {
        vec4 ua = texelFetch(uUnit, ivec2(int(aPieces.x + 0.5), 0), 0);
        vec4 ub = texelFetch(uUnit, ivec2(int(aPieces.y + 0.5), 0), 0);
        if (all(lessThan(abs(ua - ub), vec4(0.001)))) { gl_Position = vec4(3.0, 3.0, 0.0, 1.0); return; }
    }
    vec2 sa = toScreen(A); vec2 sb = toScreen(B);
    vec2 d = sb - sa; float len = length(d);
    vec2 dir = len > 0.0001 ? d / len : vec2(1.0, 0.0);
    vec2 n = vec2(-dir.y, dir.x);
    vec2 p = mix(sa, sb, aEnd) + n * aSide * uWidth * 0.5 + dir * (aEnd * 2.0 - 1.0) * uWidth * 0.5;
    gl_Position = toClip(p);
}"""
        const val FS_LINE = """#version 300 es
precision mediump float;
uniform vec4 uColor; in float vZ; out vec4 o;
void main() { if (vZ < 0.0) discard; o = uColor; }"""

        const val VS_FILL = "#version 300 es\n" + PROJ + """
layout(location = 0) in vec2 aLL;   // lon/lat in 1/100 degree
out float vZ;
void main() {
    float lon = radians(aLL.x * 0.01); float lat = radians(aLL.y * 0.01);
    vec3 p = uRot * vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));
    vZ = p.z;
    gl_Position = toClip(toScreen(p));
}"""
        const val FS_FILL = """#version 300 es
precision mediump float;
in float vZ; out vec4 o;
void main() { if (vZ < 0.0) discard; o = vec4(230.0 / 255.0, 198.0 / 255.0, 110.0 / 255.0, 1.0); }"""

        const val VS_DOT = "#version 300 es\n" + PROJ + """
layout(location = 0) in vec3 aPos;
layout(location = 1) in float aSr;
layout(location = 2) in vec4 aColor;
uniform float uSize; uniform float uHide;
out vec4 vColor;
void main() {
    vec3 p = uRot * aPos;
    vColor = aColor;
    if (p.z < 0.02 || aSr * uR * uR > uHide || aColor.a == 0.0) { gl_Position = vec4(3.0, 3.0, 0.0, 1.0); gl_PointSize = 1.0; return; }
    gl_Position = toClip(toScreen(p));
    gl_PointSize = uSize;
}"""
        const val FS_DOT = """#version 300 es
precision mediump float;
in vec4 vColor; out vec4 o;
void main() {
    float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (r > 1.0) discard;
    o = r > 0.72 ? vec4(0.043, 0.063, 0.125, 1.0) : vec4(vColor.rgb, 1.0);
}"""

        const val VS_QUAD = """#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }"""
        const val FS_BG = """#version 300 es
precision highp float;
uniform float uR; uniform vec2 uCenter; uniform vec2 uViewport; uniform int uMode; uniform float uPx;
out vec4 o;
vec3 hex(float r, float g, float b) { return vec3(r, g, b) / 255.0; }
void main() {
    vec2 p = vec2(gl_FragCoord.x, uViewport.y - gl_FragCoord.y);
    vec2 q = (p - uCenter) / uR;
    float d = length(q);
    if (uMode == 0) {
        if (d < 1.0) {
            float t = clamp(length(q - vec2(-0.16, -0.2)) / 1.05, 0.0, 1.0);
            vec3 c = t < 0.55 ? mix(hex(38.0, 50.0, 76.0), hex(18.0, 27.0, 46.0), t / 0.55)
                              : mix(hex(18.0, 27.0, 46.0), hex(6.0, 10.0, 20.0), (t - 0.55) / 0.45);
            o = vec4(c, 1.0);
        } else if (d < 1.1) {
            float a = 0.38 * pow(1.0 - (d - 1.0) / 0.1, 2.0);
            o = vec4(80.0 / 255.0, 120.0 / 255.0, 1.0, a);
        } else discard;
    } else {
        float edge = uPx * 1.2 / uR;
        if (d < 1.0 - edge) {
            float t = clamp(length(q - vec2(-0.24, -0.3)) / 1.0, 0.0, 1.0);
            vec4 c;
            if (t < 0.5) c = vec4(1.0, 1.0, 1.0, 0.10 * (1.0 - t / 0.5));
            else if (t < 0.85) c = vec4(0.0, 0.0, 0.0, 0.22 * (t - 0.5) / 0.35);
            else c = vec4(0.0, 0.0, 0.0, 0.22 + 0.28 * (t - 0.85) / 0.15);
            o = c;
        } else if (d < 1.0 + edge) {
            float s = clamp(((q.x) - (q.y)) / 2.8 + 0.5, 0.0, 1.0);
            vec3 c = s < 0.6 ? mix(hex(91.0, 140.0, 255.0), hex(58.0, 79.0, 184.0), s / 0.6)
                             : mix(hex(58.0, 79.0, 184.0), hex(200.0, 65.0, 79.0), (s - 0.6) / 0.4);
            o = vec4(c, 0.9);
        } else discard;
    }
}"""
    }
}
