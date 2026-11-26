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
) {
    /** Reference to the flag image: "x:<iso2>" for today's flags, "blank" when there is none. */
    val flag: String get() = if (c2 != null) "x:" + c2.lowercase(Locale.ROOT) else "blank"
}

/** A political unit of a given year in the History tab, rows of history.json. */
class HistRow(val key: String, val name: String?, val flag: String, val y0: Int, val y1: Int, val members: List<String>, val ll: DoubleArray?)

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
)

class YearInfo(val unitOfPiece: IntArray, val units: List<YearUnit>)

val REGIONS = listOf(
    "eu" to "Europa", "as" to "Ásia", "af" to "África", "oc" to "Oceania",
    "na" to "América do Norte", "sa" to "América do Sul", "an" to "Antártida",
)

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
    val entities: List<Entity>
    val byId: Map<String, Entity>
    val pieceIds: List<String>
    /** entity index of each piece, or -1 for pieces that are not a country (e.g. Dhekelia) */
    val pieceOwner: IntArray
    val hist: List<HistRow>
    val histFrom: Int
    val histTo: Int
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
                region = o.getString("r"),
                lon = ll.getDouble(0), lat = ll.getDouble(1),
                area = o.optDouble("area", 0.0).let { if (it.isNaN()) 0.0 else it },
                dot = o.optInt("dot", 0) == 1,
                sr = o.optDouble("sr", 0.0),
                bounds = b?.let { DoubleArray(4) { k -> it.getDouble(k) } },
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
        histFrom = hj.getInt("from"); histTo = hj.getInt("to")
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

    private val yearCache = HashMap<Int, YearInfo>()

    fun yearInfo(y: Int): YearInfo = yearCache.getOrPut(y) {
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
