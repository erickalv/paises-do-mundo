package br.erick.paises

import android.content.Context
import org.json.JSONArray
import java.text.Normalizer
import java.util.Locale

/** A country or territory as the game counts it (255 in total). */
class Entity(
    val index: Int,
    val id: String,
    val name: String,
    val aliases: List<String>,
    val c2: String?,
    val region: String,
    val lon: Double,
    val lat: Double,
    val area: Double,
    val dot: Boolean,
    val sr: Double,               // area on the unit sphere (steradians)
    val bounds: DoubleArray?,     // lon0, lat0, lon1, lat1
    val sovereign: String?,       // dependent territories: the country they belong to
) {
    /** Reference to the flag image: "x:<iso2>" for today's flags, "blank" when there is none. */
    val flag: String get() = TODAY_FLAG[id] ?: if (c2 != null) "x:" + c2.lowercase(Locale.ROOT) else "blank"
}

/** Today's flags that differ from flag-icons: Afghanistan under the Taliban (since 2021), Honduras back to navy blue (2026). */
private val TODAY_FLAG = mapOf("AFG" to "h:af21", "HND" to "h:hn26")

/** A political unit of a given year in the History tab, rows of history.json. */
class HistRow(val key: String, val name: String?, val flag: String, val y0: Int, val y1: Int, val members: List<String>, val ll: DoubleArray?, val owner: String?)

class YearUnit(
    val key: String,
    val name: String,
    val flag: String,
    val lon: Double,
    val lat: Double,
    val members: List<String>,
    val historical: Boolean,
    val sr: Double,
    val dot: Boolean,
    val code: Int,
    val owner: String? = null,    // who the unit belongs to (colonies, dependencies, occupied land)
)

/** unitOfPiece: unit code of each piece of today's map (1946–2026).
 *  snap/snapMap: before 1946, which historical map is used and the unit code of each of its units. */
class YearInfo(val unitOfPiece: IntArray, val units: List<YearUnit>, val snap: Int = -1, val snapMap: IntArray? = null)

class Era(val y0: Int, val y1: Int, val snap: Int, val units: List<YearUnit>, val map: IntArray)

/** Fill shapes of one historical map (hist/f<year>.bin): triangles in lon/lat (1/100 degree), in chunks
 *  that each belong to one unit of the map. Drawn to highlight a tapped unit, and used to find what was tapped. */
class FillMesh(bytes: ByteArray) {
    val nv: Int
    val ni: Int
    val chunkUnit: IntArray
    val chunkVBase: IntArray
    val chunkIBase: IntArray
    val chunkCount: IntArray
    val lonLat: ShortArray
    val idx: ShortArray

    init {
        val bb = java.nio.ByteBuffer.wrap(bytes).order(java.nio.ByteOrder.LITTLE_ENDIAN)
        bb.position(4)
        nv = bb.int; ni = bb.int
        val nc = bb.int
        chunkUnit = IntArray(nc); chunkVBase = IntArray(nc); chunkIBase = IntArray(nc); chunkCount = IntArray(nc)
        for (c in 0 until nc) { chunkUnit[c] = bb.int; chunkVBase[c] = bb.int; chunkIBase[c] = bb.int; chunkCount[c] = bb.int }
        lonLat = ShortArray(nv * 2); bb.asShortBuffer().get(lonLat); bb.position(bb.position() + nv * 4)
        idx = ShortArray(ni); bb.asShortBuffer().get(idx)
    }

    /** unit of the map at (lon, lat), or -1 */
    fun unitAt(lon: Double, lat: Double): Int {
        val y = (lat * 100).toFloat()
        for (c in chunkUnit.indices) {
            val vb = chunkVBase[c]
            var t = chunkIBase[c]
            val end = t + chunkCount[c]
            while (t < end) {
                val a = vb + (idx[t].toInt() and 0xFFFF); val b = vb + (idx[t + 1].toInt() and 0xFFFF); val cc = vb + (idx[t + 2].toInt() and 0xFFFF)
                t += 3
                val ay = lonLat[a * 2 + 1].toFloat(); val by = lonLat[b * 2 + 1].toFloat(); val cy = lonLat[cc * 2 + 1].toFloat()
                if (y < minOf(ay, by, cy) || y > maxOf(ay, by, cy)) continue
                val ax = lonLat[a * 2].toFloat(); val bx = lonLat[b * 2].toFloat(); val cx = lonLat[cc * 2].toFloat()
                // longitudes of a triangle may be unwrapped past ±180
                for (sh in SHIFTS) {
                    val x = (lon * 100).toFloat() + sh
                    if (x < minOf(ax, bx, cx) || x > maxOf(ax, bx, cx)) continue
                    val d1 = (bx - ax) * (y - ay) - (by - ay) * (x - ax)
                    val d2 = (cx - bx) * (y - by) - (cy - by) * (x - bx)
                    val d3 = (ax - cx) * (y - cy) - (ay - cy) * (x - cx)
                    if ((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0)) return chunkUnit[c]
                }
            }
        }
        return -1
    }

    private companion object { val SHIFTS = floatArrayOf(0f, 36000f, -36000f) }
}

val REGIONS = listOf(
    "eu" to "Europa", "as" to "Ásia", "af" to "África", "oc" to "Oceania",
    "na" to "América do Norte", "sa" to "América do Sul", "an" to "Antártida", "sm" to "Sete Mares",
)

/** Islands of the open ocean, played as their own region ("Sete Mares") instead of their continent. */
private val SEVEN_SEAS = setOf("MDV", "MUS", "BVT", "SGS", "ATF", "SHN", "SYC", "CLP", "HMD", "IOT")

object Names {
    private val marks = Regex("\\p{Mn}+")
    private val nonAlnum = Regex("[^a-z0-9]")
    private val article = Regex("^(as |os |a |o )")
    private val prefix = Regex("^(ilhas? (de |do |da |dos |das )?|republica (de |do |da |dos |das )?|reino (de |do |da )?|estado (de |do |da )?)")
    private fun fold(s: String) = Normalizer.normalize(s, Normalizer.Form.NFD).replace(marks, "").lowercase(Locale.ROOT)
    fun norm(s: String) = fold(s).replace(nonAlnum, "")
    fun strip(s: String) = norm(fold(s).trim().replace(article, "").replace(prefix, ""))
}

fun ownerOf(id: String) = if (id.contains('~')) id.substringBefore('~') else id

class GeoData(ctx: Context) {
    private val appCtx: Context = ctx.applicationContext
    val entities: List<Entity>
    val byId: Map<String, Entity>
    val pieceIds: List<String>
    /** entity index of each piece, or -1 for pieces that are not a country (e.g. Dhekelia) */
    val pieceOwner: IntArray
    val hist: List<HistRow>
    val histFrom: Int
    val histTo: Int
    val modernFrom: Int
    val snapYears: IntArray
    val eras: List<Era>
    /** leaders.json: per unit name, the effective leader ("l"), the kind of territory ("t") and the leader's title ("c") on 31 Dec, as [year0, year1, text] */
    private val yearTexts: Triple<Map<String, List<Triple<Int, Int, String>>>, Map<String, List<Triple<Int, Int, String>>>, Map<String, List<Triple<Int, Int, String>>>> by lazy {
        val j = org.json.JSONObject(appCtx.assets.open("leaders.json").bufferedReader().readText())
        fun read(o: org.json.JSONObject): Map<String, List<Triple<Int, Int, String>>> {
            val m = HashMap<String, List<Triple<Int, Int, String>>>()
            for (k in o.keys()) {
                val a = o.getJSONArray(k)
                m[k] = List(a.length()) { i -> a.getJSONArray(i).let { Triple(it.getInt(0), it.getInt(1), it.getString(2)) } }
            }
            return m
        }
        Triple(read(j.getJSONObject("l")), read(j.getJSONObject("t")), j.optJSONObject("c")?.let { read(it) } ?: emptyMap())
    }
    fun leaderOf(name: String, y: Int): String? = yearTexts.first[name]?.firstOrNull { y >= it.first && y <= it.second }?.third
    fun kindOf(name: String, y: Int): String? = yearTexts.second[name]?.firstOrNull { y >= it.first && y <= it.second }?.third
    /** cargo do líder (rei, presidente, primeiro-ministro...) */
    fun titleOf(name: String, y: Int): String? = yearTexts.third[name]?.firstOrNull { y >= it.first && y <= it.second }?.third
    private val lookup = HashMap<String, String>()
    private val lookupStripped = HashMap<String, String>()

    init {
        val ej = JSONArray(ctx.assets.open("entities.json").bufferedReader().readText())
        val list = ArrayList<Entity>()
        for (i in 0 until ej.length()) {
            val o = ej.getJSONObject(i)
            val al = o.getJSONArray("a")
            val ll = o.getJSONArray("ll")
            val b = o.optJSONArray("b")
            list += Entity(
                index = i,
                id = o.getString("id"),
                name = o.getString("n"),
                aliases = List(al.length()) { al.getString(it) },
                c2 = if (o.isNull("c2")) null else o.getString("c2"),
                region = if (o.getString("id") in SEVEN_SEAS) "sm" else o.getString("r"),
                lon = ll.getDouble(0), lat = ll.getDouble(1),
                area = o.optDouble("area", 0.0).let { if (it.isNaN()) 0.0 else it },
                dot = o.optInt("dot", 0) == 1,
                sr = o.optDouble("sr", 0.0),
                bounds = b?.let { DoubleArray(4) { k -> it.getDouble(k) } },
                sovereign = if (o.isNull("o")) null else o.optString("o", "").ifEmpty { null },
            )
        }
        entities = list
        byId = list.associateBy { it.id }
        for (e in list) for (a in listOf(e.name) + e.aliases) {
            val k = Names.norm(a)
            if (k.isNotEmpty()) lookup.putIfAbsent(k, e.id)
            val s = Names.strip(a)
            if (s.length > 2) lookupStripped.putIfAbsent(s, e.id)
        }

        val pj = JSONArray(ctx.assets.open("pieces.json").bufferedReader().readText())
        pieceIds = List(pj.length()) { pj.getJSONArray(it).getString(0) }
        pieceOwner = IntArray(pj.length()) { k ->
            val row = pj.getJSONArray(k)
            if (row.isNull(1)) -1 else byId[row.getString(1)]?.index ?: -1
        }

        val hj = org.json.JSONObject(ctx.assets.open("history.json").bufferedReader().readText())
        histFrom = hj.optInt("open", hj.getInt("from")); histTo = hj.getInt("to"); modernFrom = hj.getInt("modernFrom")
        val sj = hj.getJSONArray("snaps")
        snapYears = IntArray(sj.length()) { sj.getJSONObject(it).getInt("y") }
        val ej2 = hj.getJSONArray("eras")
        eras = List(ej2.length()) { k ->
            val o = ej2.getJSONObject(k)
            val us = o.getJSONArray("u"); val mp = o.getJSONArray("m")
            Era(
                o.getInt("y0"), o.getInt("y1"), o.getInt("s"),
                List(us.length()) { i ->
                    val u = us.getJSONArray(i)
                    YearUnit(
                        key = "e$k.$i", name = if (u.isNull(0)) "" else u.getString(0), flag = u.getString(1),
                        lon = u.getDouble(2), lat = u.getDouble(3), members = emptyList(), historical = true,
                        sr = u.getDouble(4), dot = false, code = i,
                        owner = if (u.length() > 5 && !u.isNull(5)) u.getString(5) else null,
                    )
                },
                IntArray(mp.length()) { mp.getInt(it) },
            )
        }
        val units = hj.getJSONArray("units")
        hist = List(units.length()) { k ->
            val u = units.getJSONArray(k)
            val m = u.getJSONArray(5)
            HistRow(
                key = u.getString(0),
                name = if (u.isNull(1)) null else u.getString(1),
                flag = u.getString(2), y0 = u.getInt(3), y1 = u.getInt(4),
                members = List(m.length()) { m.getString(it) },
                ll = if (u.length() > 6) u.getJSONArray(6).let { doubleArrayOf(it.getDouble(0), it.getDouble(1)) } else null,
                owner = if (u.length() > 7 && !u.isNull(7)) u.getString(7) else null,
            )
        }
    }

    fun resolve(text: String): Entity? {
        val k = Names.norm(text)
        if (k.isEmpty()) return null
        lookup[k]?.let { return byId[it] }
        lookupStripped[Names.strip(text)]?.let { return byId[it] }
        return null
    }

    /** first piece index of each entity (used for the colour of its dot) */
    val firstPieceOf: IntArray by lazy {
        val a = IntArray(entities.size) { -1 }
        for (p in pieceOwner.indices) { val o = pieceOwner[p]; if (o >= 0 && a[o] < 0) a[o] = p }
        a
    }

    private val fills = object : android.util.LruCache<Int, FillMesh>(3) {
        override fun create(key: Int): FillMesh = FillMesh(appCtx.assets.open("hist/f${snapYears[key]}.bin").use { it.readBytes() })
    }
    /** fill shapes of historical map number [snap] (loaded on first use) */
    fun fill(snap: Int): FillMesh = synchronized(fills) { fills.get(snap) }

    private val yearCache = HashMap<Int, YearInfo>()

    fun yearInfo(y: Int): YearInfo = yearCache.getOrPut(y) {
        if (y < modernFrom) {
            val era = eras.first { y >= it.y0 && y <= it.y1 }
            return@getOrPut YearInfo(IntArray(0), era.units, era.snap, era.map)
        }
        val unitKeyOf = HashMap<String, String>()
        val rows = LinkedHashMap<String, Triple<HistRow?, Entity?, List<String>>>()
        for (h in hist) {
            if (y < h.y0 || y > h.y1) continue
            rows[h.key] = Triple(h, null, h.members)
            for (m in h.members) unitKeyOf[m] = h.key
        }
        for (e in entities) {
            if (unitKeyOf.containsKey(e.id)) continue
            unitKeyOf[e.id] = e.id
            rows[e.id] = Triple(null, e, listOf(e.id))
        }
        val keys = rows.keys.toList()
        val codeOf = HashMap<String, Int>()
        keys.forEachIndexed { i, k -> codeOf[k] = i }
        val units = keys.map { k ->
            val (h, e, members) = rows.getValue(k)
            val ms = members.map { byId.getValue(ownerOf(it)) }
            val big = ms.maxByOrNull { it.area }!!
            YearUnit(
                key = k,
                name = h?.name ?: e?.name ?: byId.getValue(ownerOf(members[0])).name,
                flag = h?.flag ?: e!!.flag,
                lon = h?.ll?.get(0) ?: big.lon,
                lat = h?.ll?.get(1) ?: big.lat,
                members = members,
                historical = h != null,
                sr = ms.sumOf { it.sr },
                dot = ms.size == 1 && ms[0].dot,
                code = codeOf.getValue(k),
                owner = if (h != null) h.owner else e?.sovereign,
            )
        }
        val unitOfPiece = IntArray(pieceIds.size) { p ->
            val id = pieceIds[p]
            val owner = pieceOwner[p]
            when {
                owner < 0 -> 100000 + p
                unitKeyOf.containsKey(id) -> codeOf.getValue(unitKeyOf.getValue(id))
                else -> codeOf.getValue(unitKeyOf.getValue(entities[owner].id))
            }
        }
        YearInfo(unitOfPiece, units)
    }
}
