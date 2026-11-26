package br.erick.paises

import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.material3.Text
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

private val Bg = Color(0xFF000000)
private val Surface = Color(0xFF121826)
private val Surface2 = Color(0xFF22324F)
private val Sheet = Color(0xFF121A29)
private val Line = Color(0xFF2A3346)
private val Line2 = Color(0xFF4A5E85)
private val TextC = Color(0xFFF2EEE4)
private val Muted = Color(0xFF8D95A8)
private val Gold = Color(0xFFE6C66E)
private val Cta = Color(0xFFE8DFC6)
private val Ok = Color(0xFF7FCB8A)
private val Warn = Color(0xFFE6B35C)
private val Err = Color(0xFFE5736B)

class MainActivity : ComponentActivity() {
    private lateinit var host: GlobeHost
    private lateinit var model: AppModel

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val data = GeoData(this)
        model = AppModel(data, getSharedPreferences("paises", Context.MODE_PRIVATE))
        model.restore()
        host = GlobeHost(this, data)
        val handler = Handler(Looper.getMainLooper())
        host.listener = object : GlobeListener {
            override fun labels() = model.labels()
            override fun labelMode() = model.labelMode()
            override fun onTap(lon: Double, lat: Double, sx: Float, sy: Float) {
                if (model.mode == Mode.HISTORY) { model.historyTap(sx, sy, host); host.redraw(); return }
                val id = model.tapTarget(lon, lat, sx, sy, host)
                if (id == null) { model.clearOutline(); return }
                if (!model.isFound(id) && !model.revealed) { model.outlineOf(id, host.renderer.hit); return }
                model.clearOutline()
                model.pinned = id
                model.pinnedUntil = android.os.SystemClock.elapsedRealtime() + 3500
                host.redraw()
                handler.postDelayed({ host.redraw() }, 3600)
            }
        }
        if (model.mode == Mode.GAME) model.found.lastOrNull()?.let { id ->
            val e = data.byId.getValue(id); host.cam.lon0 = e.lon; host.cam.lat0 = e.lat
        }
        setContent { App(model, host) }
    }

    override fun onResume() { super.onResume(); host.onResume(); model.resume(); host.kick() }
    override fun onPause() { model.pause(); host.onPause(); super.onPause() }
}

@Composable
fun App(model: AppModel, host: GlobeHost) {
    var topY by remember { mutableFloatStateOf(0f) }
    var bottomY by remember { mutableFloatStateOf(0f) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(model.styleVersion, model.mode, model.selected, model.revealed, model.year) {
        host.autoRotate = model.mode == Mode.START
        host.applyStyle(model.style(host.renderer.dotEntities))
    }
    LaunchedEffect(topY, bottomY) { host.setInsets(topY, bottomY) }
    // the label of a country just found disappears after a moment
    LaunchedEffect(model.toast?.id) { if (model.toast != null) { delay(2700); host.redraw() } }

    BackHandler(enabled = model.mode != Mode.START || model.dialog != null) {
        when {
            model.dialog != null -> model.dialog = null
            model.mode == Mode.GAME -> model.requestQuit()
            else -> model.mode = Mode.START
        }
    }

    Box(Modifier.fillMaxSize().background(Bg)) {
        AndroidView(factory = { host }, modifier = Modifier.fillMaxSize())

        if (model.mode == Mode.START || model.mode == Mode.HISTORY) {
            Column(
                Modifier.statusBarsPadding().padding(horizontal = 20.dp).padding(top = 20.dp)
                    .onGloballyPositioned { topY = it.boundsInRoot().bottom }
            ) {
                Text("Países do Mundo", color = TextC, fontSize = 26.sp, fontWeight = FontWeight.Medium)
                Spacer(Modifier.height(14.dp))
                Row(
                    Modifier.clip(RoundedCornerShape(22.dp)).background(Surface).border(1.dp, Color(0xFF232B3D), RoundedCornerShape(22.dp)).padding(4.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    TabButton("Jogar", model.mode == Mode.START) { model.mode = Mode.START; model.pick = null; model.styleVersion++ }
                    TabButton("História", model.mode == Mode.HISTORY) { model.mode = Mode.HISTORY; model.styleVersion++ }
                }
            }
            Box(Modifier.align(Alignment.BottomCenter).onGloballyPositioned { bottomY = it.boundsInRoot().top }) {
                if (model.mode == Mode.START) StartSheet(model) else HistoryPanel(model)
            }
        } else {
            GameHud(model, Modifier.onGloballyPositioned { topY = it.boundsInRoot().bottom })
            Box(Modifier.align(Alignment.BottomCenter).onGloballyPositioned { bottomY = it.boundsInRoot().top }) {
                SearchArea(model)
            }
        }

        model.dialog?.let { d -> DialogOverlay(model, d) }
    }
}

// ---------------------------------------------------------------- start screen
@Composable
private fun TabButton(label: String, on: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.height(36.dp).clip(RoundedCornerShape(18.dp)).background(if (on) Surface2 else Color.Transparent)
            .clickable(onClick = onClick).padding(horizontal = 18.dp),
        contentAlignment = Alignment.Center,
    ) { Text(label, color = if (on) TextC else Muted, fontWeight = FontWeight.SemiBold, fontSize = 14.sp) }
}

@Composable
private fun StartSheet(model: AppModel) {
    val total = model.selectedTotal()
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)).background(Sheet)
            .navigationBarsPadding().padding(start = 18.dp, end = 18.dp, top = 22.dp, bottom = 18.dp)
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Text("Escolher regiões", color = TextC, fontSize = 19.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Text(if (total == model.data.entities.size) "$total países e territórios" else "$total selecionados", color = Color(0xFF9AA3B5), fontSize = 14.sp)
        }
        Spacer(Modifier.height(16.dp))
        val chips = REGIONS.map { (r, name) -> Triple(name, model.data.entities.count { it.region == r }, r) } + Triple("Todas", model.data.entities.size, "*")
        for (row in chips.chunked(2)) {
            Row(Modifier.fillMaxWidth().padding(bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                for ((name, count, r) in row) {
                    val on = if (r == "*") model.selected.size == REGIONS.size else r in model.selected
                    Chip(name, count, on, Modifier.weight(1f)) { if (r == "*") model.toggleAll() else model.toggleRegion(r) }
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            val enabled = total > 0
            Row(
                Modifier.weight(1f).height(58.dp).clip(CircleShape).border(1.5.dp, Line2, CircleShape)
                    .clickable(enabled = enabled) { model.start(true) },
                horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
            ) {
                Ico(20.dp, Color(0xFFD5DBE7)) { s -> book(s) }
                Spacer(Modifier.width(10.dp))
                Text("Treino", color = Color(0xFFD5DBE7).copy(alpha = if (enabled) 1f else .45f), fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            }
            Row(
                Modifier.weight(1.35f).height(58.dp).clip(CircleShape).background(Cta.copy(alpha = if (enabled) 1f else .45f))
                    .clickable(enabled = enabled) { model.start(false) },
                horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
            ) {
                Ico(16.dp, Color(0xFF15181F), fill = true) { s -> play(s) }
                Spacer(Modifier.width(12.dp))
                Text("INICIAR", color = Color(0xFF15181F), fontSize = 17.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.4.sp)
            }
        }
    }
}

@Composable
private fun Chip(name: String, count: Int, on: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier.heightIn(min = 52.dp).clip(shape).background(if (on) Surface2 else Color.Transparent)
            .border(1.5.dp, if (on) Line2 else Line, shape).clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(18.dp)) { if (on) Ico(18.dp, Color(0xFFE8ECF4)) { s -> check(s) } }
        Spacer(Modifier.width(10.dp))
        Text(name, color = if (on) Color(0xFFE8ECF4) else Muted, fontSize = 15.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f), lineHeight = 18.sp)
        Text("$count", color = if (on) Color(0xFFC9D1E0) else Color(0xFF5D6577), fontSize = 15.sp)
    }
}

// ---------------------------------------------------------------- history
@Composable
private fun HistoryPanel(model: AppModel) {
    val from = model.data.histFrom
    val to = model.data.histTo
    val state = rememberLazyListState(initialFirstVisibleItemIndex = model.year - from)
    val fling = rememberSnapFlingBehavior(lazyListState = state)
    val scope = rememberCoroutineScope()
    val itemPx = with(LocalDensity.current) { 16.dp.toPx() }

    LaunchedEffect(state) {
        snapshotFlow { state.firstVisibleItemIndex to state.firstVisibleItemScrollOffset }.collect { (i, off) ->
            val y = (from + i + (off / itemPx).roundToInt()).coerceIn(from, to)
            if (y != model.year) model.year = y
        }
    }
    fun go(y: Int) = scope.launch { state.animateScrollToItem((y - from).coerceIn(0, to - from)) }

    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)).background(Sheet)
            .navigationBarsPadding().padding(top = 14.dp, bottom = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(22.dp)) {
            RoundButton { go(model.year - 1) }
            Text("${model.year}", color = TextC, fontSize = 40.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.widthIn(min = 124.dp))
            RoundButton(right = true) { go(model.year + 1) }
        }
        Spacer(Modifier.height(6.dp))
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val half = maxWidth / 2 - 8.dp
            LazyRow(state = state, flingBehavior = fling, contentPadding = PaddingValues(horizontal = half), modifier = Modifier.fillMaxWidth()) {
                items(to - from + 1) { i ->
                    val y = from + i
                    Tick(y, Modifier.clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { go(y) })
                }
            }
            Box(Modifier.align(Alignment.TopCenter).width(3.dp).height(32.dp).clip(RoundedCornerShape(2.dp)).background(Gold))
        }
    }
}

@Composable
private fun RoundButton(right: Boolean = false, onClick: () -> Unit) {
    Box(
        Modifier.size(46.dp).clip(CircleShape).background(Surface).border(1.dp, Color(0xFF232B3D), CircleShape).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Ico(20.dp, Color(0xFFC9D1E0)) { s -> chevron(s, right) } }
}

@Composable
private fun Tick(y: Int, modifier: Modifier) {
    Box(modifier.width(16.dp).height(58.dp)) {
        val big = y % 10 == 0; val mid = y % 5 == 0
        Box(
            Modifier.align(Alignment.TopCenter).padding(top = 6.dp).width(if (big) 2.dp else 1.dp)
                .height(if (big) 24.dp else if (mid) 18.dp else 12.dp)
                .background(if (big) Muted else if (mid) Color(0xFF5D6987) else Color(0xFF3D4863))
        )
        if (mid) Text(
            "$y", color = Muted, fontSize = 12.sp, softWrap = false,
            modifier = Modifier.align(Alignment.TopCenter).padding(top = 34.dp).width(40.dp),
            textAlign = TextAlign.Center,
        )
    }
}

// ---------------------------------------------------------------- game
@Composable
private fun GameHud(model: AppModel, modifier: Modifier) {
    var now by remember { mutableLongStateOf(0L) }
    LaunchedEffect(Unit) { while (true) { now = model.elapsed(); delay(250) } }
    LaunchedEffect(model.found.size) { model.save() }
    Row(
        modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 16.dp).padding(top = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            Modifier.height(46.dp).clip(CircleShape).background(Surface).border(1.dp, Color(0xFF232B3D), CircleShape).padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(Gold))
            Spacer(Modifier.width(12.dp))
            Text("${model.found.size}", color = TextC, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            Text(" / ${model.selectedTotal()}", color = Muted, fontWeight = FontWeight.Medium, fontSize = 16.sp)
            if (model.practice) {
                Text("  · treino", color = Muted, fontSize = 14.sp)
            } else {
                Spacer(Modifier.width(12.dp))
                Box(Modifier.width(1.dp).height(22.dp).background(Color(0xFF2C3447)))
                Spacer(Modifier.width(12.dp))
                Ico(18.dp, Muted) { s -> timer(s) }
                Spacer(Modifier.width(8.dp))
                Text(fmt(now), color = TextC, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            }
        }
        Spacer(Modifier.weight(1f))
        if (model.practice) {
            Box(
                Modifier.size(46.dp).clip(CircleShape).background(Surface).border(1.dp, if (model.revealed) Gold else Color(0xFF232B3D), CircleShape)
                    .clickable { model.toggleReveal() },
                contentAlignment = Alignment.Center,
            ) { if (model.revealed) Ico(22.dp, Gold) { s -> eyeOpen(s) } else Ico(22.dp, Color(0xFFC9D1E0)) { s -> eyeClosed(s) } }
            Spacer(Modifier.width(10.dp))
        }
        Box(
            Modifier.size(46.dp).clip(CircleShape).background(Surface).border(1.dp, Color(0xFF232B3D), CircleShape).clickable { model.requestQuit() },
            contentAlignment = Alignment.Center,
        ) { Ico(20.dp, Color(0xFFC9D1E0)) { s -> close(s) } }
    }
}

@Composable
private fun SearchArea(model: AppModel) {
    var text by remember { mutableStateOf("") }
    val focus = remember { FocusRequester() }
    val t = model.toast
    LaunchedEffect(t?.id) { if (t != null) { delay(2200); if (model.toast === t) model.toast = null } }
    LaunchedEffect(model.revealed) { if (!model.revealed) try { focus.requestFocus() } catch (_: Exception) {} }

    fun submit() {
        model.submit(text)
        val kind = model.toast?.kind
        if (kind == ToastKind.OK || kind == ToastKind.WARN) text = ""
    }

    Column(Modifier.fillMaxWidth().imePadding().navigationBarsPadding().padding(start = 16.dp, end = 16.dp, bottom = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        if (t != null) {
            val (fg, line) = when (t.kind) {
                ToastKind.OK -> Color(0xFFBDE6C3) to Color(0xFF2E5136)
                ToastKind.WARN -> Color(0xFFF0D49A) to Color(0xFF5A4A2A)
                ToastKind.ERR -> Color(0xFFF2B5B0) to Color(0xFF5A2F33)
            }
            Text(
                t.text, color = fg, fontSize = 14.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center,
                modifier = Modifier.padding(bottom = 10.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xFF1A2133))
                    .border(1.dp, line, RoundedCornerShape(12.dp)).padding(horizontal = 14.dp, vertical = 8.dp),
            )
        }
        val border = when (t?.kind) { ToastKind.OK -> Ok; ToastKind.WARN -> Warn; ToastKind.ERR -> Err; null -> Line }
        Row(
            Modifier.fillMaxWidth().height(60.dp).clip(CircleShape).background(Surface).border(1.5.dp, border, CircleShape).padding(start = 18.dp, end = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Ico(20.dp, Muted) { s -> search(s) }
            Spacer(Modifier.width(10.dp))
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                if (text.isEmpty()) Text(if (model.revealed) "Toque no olho para recomeçar" else "Digite um país…", color = Color(0xFF7A8296), fontSize = 17.sp)
                BasicTextField(
                    value = text,
                    onValueChange = { text = it },
                    enabled = !model.revealed,
                    singleLine = true,
                    textStyle = TextStyle(color = TextC, fontSize = 17.sp, fontWeight = FontWeight.Medium),
                    cursorBrush = SolidColor(Gold),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, autoCorrectEnabled = false, imeAction = ImeAction.Go),
                    keyboardActions = KeyboardActions(onGo = { submit() }, onDone = { submit() }),
                    modifier = Modifier.fillMaxWidth().focusRequester(focus),
                )
            }
            Box(Modifier.size(44.dp).clip(CircleShape).background(Gold).clickable { submit() }, contentAlignment = Alignment.Center) {
                Ico(20.dp, Color(0xFF1A1A1A)) { s -> arrow(s) }
            }
        }
    }
}

@Composable
private fun DialogOverlay(model: AppModel, d: DialogKind) {
    Box(
        Modifier.fillMaxSize().background(Color(0xAA000000)).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {},
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier.padding(24.dp).widthIn(max = 360.dp).fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Color(0xFF141B2A))
                .border(1.dp, Line, RoundedCornerShape(22.dp)).padding(start = 20.dp, end = 20.dp, top = 24.dp, bottom = 18.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            when (d) {
                DialogKind.ConfirmQuit -> {
                    Text("Encerrar partida?", color = TextC, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    Text("Você encontrou ${model.found.size} de ${model.selectedTotal()}. O progresso desta partida será apagado.", color = Color(0xFFB4BBCA), fontSize = 15.sp, textAlign = TextAlign.Center)
                    Spacer(Modifier.height(20.dp))
                    DialogButtons("Continuar", { model.dialog = null }, "Encerrar") { model.dialog = null; model.endGame() }
                }
                is DialogKind.Finished -> {
                    Text("Você encontrou todos!", color = TextC, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    Text("${d.total} países e territórios", color = Color(0xFFB4BBCA), fontSize = 15.sp)
                    d.timeMs?.let { Text(fmt(it), color = Gold, fontSize = 40.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(vertical = 6.dp)) }
                    Spacer(Modifier.height(16.dp))
                    DialogButtons("Ver o globo", { model.dialog = null }, "Jogar de novo") { model.dialog = null; model.endGame() }
                }
            }
        }
    }
}

@Composable
private fun DialogButtons(a: String, onA: () -> Unit, b: String, onB: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.weight(1f).height(48.dp).clip(CircleShape).border(1.5.dp, Line, CircleShape).clickable(onClick = onA), contentAlignment = Alignment.Center) {
            Text(a, color = TextC, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        }
        Box(Modifier.weight(1f).height(48.dp).clip(CircleShape).background(Cta).clickable(onClick = onB), contentAlignment = Alignment.Center) {
            Text(b, color = Color(0xFF15181F), fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

private fun fmt(ms: Long): String {
    val s = ms / 1000; val h = s / 3600; val m = (s % 3600) / 60; val x = s % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, x) else "%02d:%02d".format(m, x)
}

// ---------------------------------------------------------------- tiny icons (drawn, no icon library)
@Composable
private fun Ico(size: Dp, color: Color, fill: Boolean = false, draw: DrawScope.(Float) -> Path) {
    Canvas(Modifier.size(size)) {
        val s = this.size.width / 24f
        val p = draw(s)
        if (fill) drawPath(p, color) else drawPath(p, color, style = Stroke(width = 2.2f * s, cap = StrokeCap.Round, join = StrokeJoin.Round))
    }
}

private fun pathOf(s: Float, block: Path.(Float) -> Unit) = Path().apply { block(s) }
private fun Path.m(x: Float, y: Float, s: Float) = moveTo(x * s, y * s)
private fun Path.l(x: Float, y: Float, s: Float) = lineTo(x * s, y * s)
private fun Path.circle(cx: Float, cy: Float, r: Float, s: Float) =
    addOval(androidx.compose.ui.geometry.Rect(Offset((cx - r) * s, (cy - r) * s), androidx.compose.ui.geometry.Size(2 * r * s, 2 * r * s)))

private fun check(s: Float) = pathOf(s) { m(4.5f, 12.5f, it); l(9.5f, 17.5f, it); l(19.5f, 7f, it) }
private fun close(s: Float) = pathOf(s) { m(6f, 6f, it); l(18f, 18f, it); m(18f, 6f, it); l(6f, 18f, it) }
private fun play(s: Float) = pathOf(s) { m(5f, 3f, it); l(21f, 12f, it); l(5f, 21f, it); close() }
private fun arrow(s: Float) = pathOf(s) { m(5f, 12f, it); l(19f, 12f, it); m(13f, 6f, it); l(19f, 12f, it); l(13f, 18f, it) }
private fun chevron(s: Float, right: Boolean) = pathOf(s) { if (right) { m(9f, 5f, it); l(16f, 12f, it); l(9f, 19f, it) } else { m(15f, 5f, it); l(8f, 12f, it); l(15f, 19f, it) } }
private fun search(s: Float) = pathOf(s) { circle(10.5f, 10.5f, 6.5f, it); m(15.5f, 15.5f, it); l(21f, 21f, it) }
private fun timer(s: Float) = pathOf(s) { circle(12f, 13.5f, 7.5f, it); m(12f, 13.5f, it); l(12f, 9f, it); m(9.5f, 2.5f, it); l(14.5f, 2.5f, it) }
private fun book(s: Float) = pathOf(s) { m(4f, 19.5f, it); l(4f, 5f, it); quadraticBezierTo(4f * it, 3.5f * it, 5.5f * it, 3.5f * it); l(19f, 3.5f, it); l(19f, 18.5f, it); l(5.5f, 18.5f, it); quadraticBezierTo(4f * it, 18.5f * it, 4f * it, 20f * it); quadraticBezierTo(4f * it, 21.5f * it, 5.5f * it, 21.5f * it); l(19f, 21.5f, it) }
private fun eyeOpen(s: Float) = pathOf(s) {
    m(2.5f, 12f, it); quadraticBezierTo(12f * it, 1f * it, 21.5f * it, 12f * it); quadraticBezierTo(12f * it, 23f * it, 2.5f * it, 12f * it); close()
    circle(12f, 12f, 3f, it)
}
private fun eyeClosed(s: Float) = pathOf(s) {
    m(3f, 10f, it); quadraticBezierTo(12f * it, 19f * it, 21f * it, 10f * it)
    m(6.2f, 13.2f, it); l(4.5f, 16f, it); m(12f, 14.8f, it); l(12f, 18f, it); m(17.8f, 13.2f, it); l(19.5f, 16f, it)
}
