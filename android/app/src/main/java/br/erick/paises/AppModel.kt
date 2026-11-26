package br.erick.paises

import android.content.SharedPreferences
import android.os.SystemClock
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.hypot

enum class Mode { START, GAME, HISTORY }
enum class ToastKind { OK, WARN, ERR }
class ToastMsg(val text: String, val kind: ToastKind, val id: Long = SystemClock.elapsedRealtime())
sealed class DialogKind {
    data object ConfirmQuit : DialogKind()
    data class Finished(val total: Int, val timeMs: Long?) : DialogKind()
}

private const val LAND = 0xFFE4DED0.toInt()
private const val DIM = 0xFF6E6C66.toInt()
private const val FOUND = 0xFFE6C66E.toInt()
private const val MISSED = 0xFFE58F7E.toInt()

class AppModel(val data: GeoData, private val prefs: SharedPreferences) {
    var mode by mutableStateOf(Mode.START)
    var selected by mutableStateOf(REGIONS.map { it.first }.toSet())
    val found = mutableStateListOf<String>()
    private val foundSet = HashSet<String>()
    var practice by mutableStateOf(false)
    var revealed by mutableStateOf(false)
    var finished by mutableStateOf(false)
    var year by mutableIntStateOf(data.histTo)
    var toast by mutableStateOf<ToastMsg?>(null)
    var dialog by mutableStateOf<DialogKind?>(null)
    /** bumped whenever the globe's colours or borders must be rebuilt */
    var styleVersion by mutableIntStateOf(0)

    /** History tab: the points the user tapped (lon, lat, piece); the units there (in the chosen year) are painted yellow */
    private val picks = ArrayList<DoubleArray>()
    private var picksVersion = 0
    fun clearPicks() { picks.clear(); picksVersion++ }

    /** Game: a country not found yet that the user tapped; its outline is drawn strong */
    var outlineId: String? = null
    private var outline: FloatArray? = null

    var pinned: String? = null
    var pinnedUntil = 0L
    /** the label of a country just found shows only for a moment */
    private var recentUntil = 0L

    private var elapsedBase = 0L
    private var runStart = 0L
    private var running = false

    fun elapsed(): Long = elapsedBase + if (running) SystemClock.elapsedRealtime() - runStart else 0L
    fun selectedTotal() = data.entities.count { it.region in selected }
    fun isFound(id: String) = id in foundSet

    // ---------- start / game flow ----------
    fun toggleRegion(r: String) { selected = if (r in selected) selected - r else selected + r }
    fun toggleAll() { selected = if (selected.size == REGIONS.size) emptySet() else REGIONS.map { it.first }.toSet() }

    fun start(isPractice: Boolean) {
        practice = isPractice; revealed = false; finished = false
        found.clear(); foundSet.clear(); pinned = null; outlineId = null; outline = null
        elapsedBase = 0; runStart = SystemClock.elapsedRealtime(); running = !isPractice
        mode = Mode.GAME
        styleVersion++
        save()
    }

    fun endGame() {
        running = false; finished = false; practice = false; revealed = false
        found.clear(); foundSet.clear(); pinned = null; outlineId = null; outline = null
        mode = Mode.START
        styleVersion++
        prefs.edit().remove("game").apply()
    }

    /** Returns the entity to fly to, if any. */
    fun submit(text: String): Entity? {
        if (revealed) return null
        val t = text.trim()
        if (t.isEmpty()) return null
        val e = data.resolve(t)
        if (e == null) { toast = ToastMsg("Não encontrei “$t”", ToastKind.ERR); return null }
        if (e.region !in selected) { toast = ToastMsg("${e.name} não está nas regiões escolhidas", ToastKind.WARN); return null }
        if (e.id in foundSet) {
            toast = ToastMsg("Você já encontrou ${e.name}", ToastKind.WARN)
            pinned = e.id; pinnedUntil = SystemClock.elapsedRealtime() + 3500
            return e
        }
        found += e.id; foundSet += e.id
        if (outlineId == e.id) { outlineId = null; outline = null }
        recentUntil = SystemClock.elapsedRealtime() + 2500
        toast = ToastMsg(e.name, ToastKind.OK)
        styleVersion++
        if (found.size == selectedTotal()) {
            elapsedBase = elapsed(); running = false; finished = true
            dialog = DialogKind.Finished(found.size, if (practice) null else elapsedBase)
        }
        save()
        return e
    }

    fun toggleReveal() {
        if (!revealed) {
            revealed = true; pinned = null; outlineId = null; outline = null
            val miss = selectedTotal() - found.size
            toast = if (miss > 0) ToastMsg("Faltaram $miss", ToastKind.WARN) else ToastMsg("Você acertou todos!", ToastKind.OK)
        } else {
            revealed = false; found.clear(); foundSet.clear(); finished = false; pinned = null
            toast = null
        }
        styleVersion++
        save()
    }

    fun requestQuit() {
        if (finished || found.isEmpty()) endGame() else dialog = DialogKind.ConfirmQuit
    }

    fun pause() { if (running) { elapsedBase = elapsed(); running = false; save() } }
    fun resume() { if (mode == Mode.GAME && !finished && !practice && !running) { runStart = SystemClock.elapsedRealtime(); running = true } }

    fun outlineOf(id: String, hit: GlobeRenderer.HitData?) {
        if (id == outlineId) return
        val e = data.byId.getValue(id)
        outlineId = id
        outline = hit?.outline { p -> data.pieceOwner.getOrElse(p) { -1 } == e.index }
        styleVersion++
    }

    fun clearOutline() {
        if (outlineId == null) return
        outlineId = null; outline = null
        styleVersion++
    }

    // ---------- tap on the globe ----------
    fun tapTarget(lon: Double, lat: Double, sx: Float, sy: Float, host: GlobeHost): String? {
        if (mode != Mode.GAME) return null
        // any country of the chosen regions: a found one shows its name, one not found yet gets its outline drawn
        val cand = data.entities.filter { it.region in selected }.map { it.id }.toSet()
        if (cand.isEmpty()) return null
        val d = host.resources.displayMetrics.density
        val tmp = DoubleArray(3)
        var best: String? = null
        var bd = 22.0 * d
        for (id in cand) {
            val e = data.byId.getValue(id)
            if (!e.dot) continue
            host.cam.project(e.lon, e.lat, tmp)
            if (tmp[2] <= 0) continue
            val dist = hypot(tmp[0] - sx, tmp[1] - sy)
            if (dist < bd) { bd = dist; best = id }
        }
        if (best != null) return best
        val xyz = host.cam.unprojectXYZ(sx.toDouble(), sy.toDouble()) ?: return null
        val hit = host.renderer.hit ?: return null
        val p = hit.pieceAt(xyz[0], xyz[1], xyz[2]) { piece ->
            val o = data.pieceOwner.getOrElse(piece) { -1 }
            o >= 0 && data.entities[o].id in cand
        }
        return if (p >= 0) data.entities[data.pieceOwner[p]].id else null
    }

    // ---------- tap in the History tab ----------
    /** What the History map shows at a point in the current year. */
    class Picked(val name: String, val flag: String, val owner: String?, val code: Int, val pieces: Set<Int>)

    private var pickCacheKey: Pair<Int, Int>? = null
    private var pickCache: List<Pair<DoubleArray, Picked>> = emptyList()

    /** The selected units in the current year, one per unit (first tap point wins), with the point where each was tapped. */
    fun picked(): List<Pair<DoubleArray, Picked>> {
        val key = year to picksVersion
        if (key == pickCacheKey) return pickCache
        pickCacheKey = key
        val out = ArrayList<Pair<DoubleArray, Picked>>()
        for (p in picks) {
            val pk = unitAt(p[0], p[1], p[2].toInt()) ?: continue
            if (out.none { it.second.code == pk.code && it.second.name == pk.name }) out += p to pk
        }
        pickCache = out
        return out
    }

    private fun unitAt(lon: Double, lat: Double, piece: Int): Picked? {
        val info = data.yearInfo(year)
        if (info.snap >= 0) {
            val su = data.fill(info.snap).unitAt(lon, lat)
            if (su < 0) return null
            val code = info.snapMap!!.getOrElse(su) { -1 }
            val u = info.units.getOrNull(code)
            return if (u == null || u.name.isEmpty()) Picked("Sem informação neste mapa", "blank", null, code, emptySet())
            else Picked(u.name, u.flag, u.owner, code, emptySet())
        }
        if (piece < 0) return null
        val code = info.unitOfPiece.getOrElse(piece) { -1 }
        val u = info.units.getOrNull(code) ?: return null
        val pieces = info.unitOfPiece.indices.filter { info.unitOfPiece[it] == code }.toSet()
        return Picked(u.name, u.flag, u.owner, code, pieces)
    }

    /** Tap in the History tab: select the land under the finger (or the closest small island), tap again to clear. */
    fun historyTap(sx: Float, sy: Float, host: GlobeHost) {
        val d = host.resources.displayMetrics.density
        val tmp = DoubleArray(3)
        var piece = -1
        var at: DoubleArray? = null
        // small places drawn as dots
        var bd = 22.0 * d
        for (e in data.entities) {
            if (!e.dot) continue
            host.cam.project(e.lon, e.lat, tmp)
            if (tmp[2] <= 0) continue
            val dist = hypot(tmp[0] - sx, tmp[1] - sy)
            if (dist < bd) { bd = dist; piece = data.firstPieceOf[e.index]; at = doubleArrayOf(e.lon, e.lat) }
        }
        if (at == null) {
            val ll = host.cam.unproject(sx.toDouble(), sy.toDouble())
            val xyz = host.cam.unprojectXYZ(sx.toDouble(), sy.toDouble())
            val hit = host.renderer.hit
            if (ll != null && xyz != null && hit != null) {
                piece = hit.pieceAt(xyz[0], xyz[1], xyz[2]) { true }
                if (piece >= 0) at = doubleArrayOf(ll[0], ll[1])
            }
        }
        if (at == null) { picks.clear() }   // tap on the sea: clear every selection
        else {
            val now = unitAt(at[0], at[1], piece)
            // tapping a selected unit again unselects it (every tap that falls on it); otherwise it is added
            val same = picks.filter { p -> unitAt(p[0], p[1], p[2].toInt()).let { it != null && now != null && it.code == now.code && it.name == now.name } }
            if (same.isNotEmpty()) picks.removeAll(same.toSet())
            else picks += doubleArrayOf(at[0], at[1], piece.toDouble())
        }
        picksVersion++
        styleVersion++
    }

    // ---------- globe style ----------
    private fun colorOf(e: Entity): Int = when {
        mode != Mode.GAME -> LAND
        e.id in foundSet -> FOUND
        e.region !in selected -> DIM
        revealed -> MISSED
        else -> LAND
    }

    fun style(dotEntities: IntArray): Style {
        val n = data.pieceIds.size
        val pal = ByteArray(n * 4)
        val units = ByteArray(n * 4)
        val info = if (mode == Mode.HISTORY) data.yearInfo(year) else null
        val pks = if (mode == Mode.HISTORY) picked().map { it.second } else emptyList()
        val pickPieces = HashSet<Int>().also { set -> pks.forEach { set.addAll(it.pieces) } }
        val snapUnits = info?.snapMap?.let { m -> ByteArray(m.size * 4).also { b -> for (i in m.indices) GlobeRenderer.putCode(b, i, m[i]) } }
        for (p in 0 until n) {
            val o = data.pieceOwner[p]
            val c = if (p in pickPieces) FOUND else if (o >= 0) colorOf(data.entities[o]) else LAND
            pal[p * 4] = ((c shr 16) and 0xFF).toByte(); pal[p * 4 + 1] = ((c shr 8) and 0xFF).toByte()
            pal[p * 4 + 2] = (c and 0xFF).toByte(); pal[p * 4 + 3] = 0xFF.toByte()
            val code = info?.unitOfPiece?.getOrNull(p) ?: if (o >= 0) o else 100000 + p
            GlobeRenderer.putCode(units, p, code)
        }
        val dots = FloatArray(dotEntities.size * 4)
        for ((k, ei) in dotEntities.withIndex()) {
            val c = if (data.firstPieceOf[ei] in pickPieces) FOUND else colorOf(data.entities[ei])
            dots[k * 4] = ((c shr 16) and 0xFF) / 255f; dots[k * 4 + 1] = ((c shr 8) and 0xFF) / 255f
            dots[k * 4 + 2] = (c and 0xFF) / 255f
            // alpha 0.5 = draw the dot with a strong ring (tapped, not found yet)
            dots[k * 4 + 3] = if (mode == Mode.GAME && data.entities[ei].id == outlineId) 0.5f else 1f
        }
        val sm = info?.snapMap
        val pickCodes = pks.map { it.code }.filter { it >= 0 }.toSet()
        val pickUnits = if (sm != null && pickCodes.isNotEmpty()) sm.indices.filter { sm[it] in pickCodes }.toSet() else emptySet()
        return Style(pal, units, mode == Mode.HISTORY, dots, info?.snap ?: -1, snapUnits, pickUnits,
            if (mode == Mode.GAME) outline else null)
    }

    // ---------- labels ----------
    fun labelMode() = when {
        mode == Mode.HISTORY -> 2
        mode == Mode.GAME && revealed -> 1
        else -> 0
    }

    fun labels(): List<LabelItem> {
        when (mode) {
            Mode.START -> return emptyList()
            Mode.HISTORY -> {
                val info = data.yearInfo(year)
                val out = ArrayList<LabelItem>()
                val pks = picked()
                // a selected unit's title moves to where it was tapped (and comes back when it is unselected)
                pks.forEachIndexed { i, (p, pk) ->
                    out += LabelItem("pick$i", pk.name, pk.flag, p[0], p[1], 0.0, true, top = true, missed = false,
                        sub = pk.owner?.let { if (it.first().isLowerCase()) it.replaceFirstChar { c -> c.uppercaseChar() } else "pertence a $it" })
                }
                val pickedCodes = pks.map { it.second.code }.toSet()
                info.units.filterIndexed { i, u -> u.name.isNotEmpty() && i !in pickedCodes }
                    .sortedWith(compareByDescending<YearUnit> { it.historical }.thenByDescending { it.sr })
                    .forEach { out += LabelItem(it.key, it.name, it.flag, it.lon, it.lat, it.sr, it.dot, top = false, missed = it.historical) }
                return out
            }
            Mode.GAME -> {
                val now = SystemClock.elapsedRealtime()
                val pin = if (pinned != null && now < pinnedUntil) pinned else null
                val recent = if (!revealed && now < recentUntil) found.lastOrNull() else null
                // while playing only the latest find (for a moment) and tapped countries are labelled
                val pool = if (revealed) data.entities.filter { it.region in selected }.map { it.id } else emptyList()
                val out = ArrayList<LabelItem>()
                fun add(id: String, top: Boolean) {
                    val e = data.byId.getValue(id)
                    out += LabelItem(e.id, e.name, e.flag, e.lon, e.lat, e.sr, e.dot, top, missed = revealed && id !in foundSet)
                }
                if (pin != null) add(pin, true)
                if (recent != null && recent != pin) add(recent, true)
                pool.filter { it != pin && it != recent }
                    .sortedByDescending { data.byId.getValue(it).area }
                    .forEach { add(it, false) }
                return out
            }
        }
    }

    // ---------- persistence ----------
    fun save() {
        if (mode != Mode.GAME) return
        val o = JSONObject()
            .put("selected", JSONArray(selected.toList()))
            .put("found", JSONArray(found.toList()))
            .put("elapsed", elapsed())
            .put("finished", finished).put("practice", practice).put("revealed", revealed)
        prefs.edit().putString("game", o.toString()).apply()
    }

    fun restore() {
        val s = prefs.getString("game", null) ?: return
        try {
            val o = JSONObject(s)
            val sel = o.getJSONArray("selected")
            selected = List(sel.length()) { sel.getString(it) }.toSet()
            val f = o.getJSONArray("found")
            found.clear(); foundSet.clear()
            for (i in 0 until f.length()) { val id = f.getString(i); if (data.byId.containsKey(id)) { found += id; foundSet += id } }
            elapsedBase = o.optLong("elapsed", 0)
            finished = o.optBoolean("finished"); practice = o.optBoolean("practice"); revealed = o.optBoolean("revealed")
            running = !finished && !practice; runStart = SystemClock.elapsedRealtime()
            mode = Mode.GAME
            styleVersion++
        } catch (_: Exception) {
            prefs.edit().remove("game").apply()
        }
    }
}
