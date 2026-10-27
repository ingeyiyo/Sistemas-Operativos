// Animación de fabrica-bicicletas-escenarios.html: la misma simulación de FabricaBicicletas.java, pero se elige
// con cuántas piezas arranca cada almacén y se puede detener cualquier hilo para ver a quién bloquea.
(() => {
  "use strict";
  const MAX_R = 10, MAX_MA = 4, N_B = 6, STEP = 260, CS = 450, PROD = [500, 1100];
  const RITMOS = { 1: [[300, 600], "muy rápido"], 2: [[700, 1200], "rápido"], 3: [[1300, 2000], "parejo"], 4: [[2200, 3200], "lento"], 5: [[3600, 5000], "muy lento"] };
  const reducir = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = id => document.getElementById(id);
  const ritmoMon = () => RITMOS[$("ritmo").value][0];
  let vel = 0.5, jugando = true;
  // Escenario elegido: piezas iniciales en cada almacén y qué hilos están detenidos.
  const ESC = { ini: { ruedas: 0, marcos: 0 }, parados: { ru: false, ma: false, mo: false } };

  // Líneas de Buffer que recorre la animación (las mismas de FabricaBicicletas.java, resumidas).
  const CODE = [
    { h: "// Buffer.poner(): operarios" },
    { id: "e1", s: "synchronized void poner(pieza) {" },
    { id: "c1", s: "  while (cantidad == b.length)" },
    { id: "c2", s: "    wait();" },
    { id: "c3", s: "  b[i] = pieza;  i = (i+1) % b.length;" },
    { id: "c4", s: "  cantidad++;  notifyAll();" },
    { id: "x1", s: "}" },
    { h: "// Buffer.extraer(n): montador" },
    { id: "e2", s: "synchronized int[] extraer(n) {" },
    { id: "k1", s: "  while (cantidad < n)" },
    { id: "k2", s: "    wait();" },
    { id: "k3", s: "  n veces: b[j];  j = (j+1) % b.length;" },
    { id: "k4", s: "  cantidad -= n;  notifyAll();" },
    { id: "x2", s: "}" },
    { h: "// fuera del monitor" },
    { id: "w1", s: "trabajar();" }
  ];
  const lineaTexto = id => (CODE.find(l => l.id === id) || {}).s || "";

  // ================= MOTOR =================
  // Corrutinas (generadores) que imitan los hilos de Java. Cada almacén es un monitor
  // con su dueño, su cola de entrada y su conjunto de espera (wait).
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function crearSim(seed, emit) {
    const rng = mulberry32(seed), rnd = ([a, b]) => a + rng() * (b - a);
    const almacen = (nombre, max) => {
      const n = ESC.ini[nombre], b = Array(max).fill(null);
      for (let k = 0; k < n; k++) b[k] = String.fromCharCode(97 + k);
      return { nombre, max, b, i: n % max, j: 0, n, mon: { owner: null, entrada: [], espera: [] } };
    };
    const sim = { now: 0, bicis: 0, fin: false, logs: [], almacenes: { ruedas: almacen("ruedas", MAX_R), marcos: almacen("marcos", MAX_MA) } };
    const R = sim.almacenes.ruedas, MA = sim.almacenes.marcos;
    const log = (texto, tipo) => { sim.logs.push({ texto, tipo }); if (sim.logs.length > 200) sim.logs.shift(); };
    const dormir = (a, ms, estado, kind) => { a.state = "sleeping"; a.until = sim.now + ms; if (estado) a.estado = estado; if (kind) a.kind = kind; };
    function liberar(alm) {
      const m = alm.mon; m.owner = null; const nx = m.entrada.shift();
      if (nx) { m.owner = nx; dormir(nx, STEP, `entra al monitor de ${alm.nombre}`, "mon"); }
    }
    function ejecutar(a, c) {
      // Un hilo detenido no entra al monitor: queda afuera, sin tener el candado.
      if (c.t === "enter" && ESC.parados[a.id]) { a.pend = c; a.state = "parked"; return; }
      if (c.ln) a.ln = c.ln;
      const alm = c.alm, m = alm && alm.mon;
      switch (c.t) {
        case "sleep": dormir(a, c.ms, c.estado, c.kind); break;
        case "enter":
          if (!m.owner) { m.owner = a; dormir(a, STEP, `entra al monitor de ${alm.nombre}`, "mon"); }
          else { m.entrada.push(a); a.state = "blocked"; a.kind = "wait"; a.estado = `espera para entrar al monitor de ${alm.nombre}`; }
          break;
        case "wait": m.espera.push(a); a.state = "blocked"; a.kind = "wait"; a.estado = `wait() en ${alm.nombre}: duerme y suelta el monitor`; liberar(alm);
          emit({ type: "wait", actor: a, motivo: sim.logs[sim.logs.length - 1].texto.trim() }); break;
        case "notifyAll": {
          const ws = m.espera.splice(0);
          ws.forEach(w => { w.estado = "despertado: espera para volver a entrar"; m.entrada.push(w); });
          if (ws.length) log(`    · notifyAll() en ${alm.nombre} despierta a: ${ws.map(w => w.logName).join(", ")}`, "nota");
          dormir(a, STEP, "notifyAll()", "mon"); break;
        }
        case "exit": liberar(alm); a.estado = `sale del monitor de ${alm.nombre}`; a.kind = "work"; break;
      }
    }
    function correr(a) {
      let g = 0;
      while (a.state === "ready" && g++ < 50) {
        const r = a.gen.next();
        if (r.done) { a.state = "done"; a.kind = "done"; a.estado = "terminó"; a.ln = null; break; }
        ejecutar(a, r.value);
      }
    }

    // Operario.run() + Buffer.poner(). Como dice el enunciado, trabajan sin cantidad fija.
    function* operario(a, alm, art, pieza) {
      for (let n = 1; ; n++) {
        yield { t: "sleep", ms: rnd(PROD), ln: "w1", estado: `fabrica ${art} ${n}`, kind: "work" };
        log(`${a.logName} termina ${art} ${n}`);
        yield { t: "enter", alm, ln: "e1" };
        yield { t: "sleep", ms: STEP, ln: "c1", estado: "revisa si el almacén está lleno", kind: "mon" };
        while (alm.n === alm.max) {
          log(`    almacén de ${alm.nombre} lleno: ${a.logName} espera`, "warn");
          yield { t: "wait", alm, ln: "c2" };
          yield { t: "sleep", ms: STEP, ln: "c1", estado: "vuelve a revisar la condición", kind: "mon" };
        }
        yield { t: "sleep", ms: CS, ln: "c3", estado: `deja ${art} ${n} en b[${alm.i}]`, kind: "mon" };
        const idx = alm.i; alm.b[idx] = n; alm.i = (alm.i + 1) % alm.max;
        emit({ type: "deja", alm: alm.nombre, idx, actor: a.id, pieza });
        yield { t: "sleep", ms: STEP, ln: "c4", estado: "cantidad++", kind: "mon" };
        alm.n++; a.hechas = n;
        log(`    almacén de ${alm.nombre} recibe 1, hay ${alm.n}/${alm.max}`);
        yield { t: "notifyAll", alm, ln: "c4" };
        yield { t: "exit", alm, ln: "x1" };
      }
    }
    // Buffer.extraer(n)
    function* extraer(a, alm, cuantas, pieza) {
      yield { t: "enter", alm, ln: "e2" };
      yield { t: "sleep", ms: STEP, ln: "k1", estado: `revisa si hay ${cuantas} ${alm.nombre}`, kind: "mon" };
      while (alm.n < cuantas) {
        log(`    faltan ${alm.nombre} (hay ${alm.n}, necesita ${cuantas}): montador espera`, "warn");
        yield { t: "wait", alm, ln: "k2" };
        yield { t: "sleep", ms: STEP, ln: "k1", estado: "vuelve a revisar la condición", kind: "mon" };
      }
      yield { t: "sleep", ms: CS, ln: "k3", estado: `saca ${cuantas} desde b[${alm.j}]`, kind: "mon" };
      const idxs = [], nums = [];
      for (let k = 0; k < cuantas; k++) { idxs.push(alm.j); nums.push(alm.b[alm.j]); alm.b[alm.j] = null; alm.j = (alm.j + 1) % alm.max; }
      a.hand[pieza].push(...nums);
      emit({ type: "saca", alm: alm.nombre, idxs, pieza });
      alm.n -= cuantas;
      log(`    almacén de ${alm.nombre} entrega ${cuantas}, hay ${alm.n}/${alm.max}`);
      yield { t: "notifyAll", alm, ln: "k4" };
      yield { t: "exit", alm, ln: "x2" };
    }
    // Montador.run()
    function* montador(a) {
      for (let n = 1; ; n++) {
        yield* extraer(a, R, 2, "rueda");
        yield* extraer(a, MA, 1, "marco");
        yield { t: "sleep", ms: rnd(ritmoMon()), ln: "w1", estado: `monta la bici ${n}`, kind: "work" };
        const r = a.hand.rueda, m = a.hand.marco;
        log(`montador termina la bici ${n} (ruedas ${r[0]} y ${r[1]}, marco ${m[0]})`);
        a.hand = { rueda: [], marco: [] }; sim.bicis = n;
        emit({ type: "bici", n });
      }
    }

    const mk = (id, nombre, logName) => ({ id, nombre, logName, state: "ready", until: 0, ln: null, estado: "", kind: "work", hechas: 0, hand: { rueda: [], marco: [] } });
    const ru = mk("ru", "Operario de ruedas", "operario de ruedas"), ma = mk("ma", "Operario de marcos", "operario de marcos"), mo = mk("mo", "Montador", "montador");
    ru.gen = operario(ru, R, "la rueda", "rueda");
    ma.gen = operario(ma, MA, "el marco", "marco");
    mo.gen = montador(mo);
    sim.actores = [ru, ma, mo];
    sim.arrancar = () => sim.actores.forEach(correr);
    sim.avanzar = dt => {
      let resto = dt;
      while (resto > 0 && !sim.fin) {
        const paso = Math.min(25, resto); resto -= paso; sim.now += paso;
        for (const a of sim.actores) {
          // Detenido mientras trabaja: el reloj de su tarea no avanza.
          a.congelado = ESC.parados[a.id] && a.state === "sleeping" && a.kind === "work";
          if (a.congelado) a.until += paso;
          if (a.state === "parked" && !ESC.parados[a.id]) { a.state = "ready"; const c = a.pend; a.pend = null; ejecutar(a, c); }
        }
        for (let v = 0; v < 6; v++) {
          let algo = false;
          for (const a of sim.actores) if (a.state === "sleeping" && a.until <= sim.now) { a.state = "ready"; algo = true; correr(a); }
          if (!algo) break;
        }
        if (sim.frenar) { sim.frenar = false; break; }
      }
    };
    // ¿En qué está esperando un hilo bloqueado? Devuelve la clave del lugar (para dibujar el hilo).
    sim.bloqueo = a => {
      if (a.state !== "blocked") return null;
      for (const alm of Object.values(sim.almacenes)) {
        if (alm.mon.entrada.includes(a)) return `${alm.nombre}-entrada`;
        if (alm.mon.espera.includes(a)) return `${alm.nombre}-espera`;
      }
      return null;
    };
    return sim;
  }

  // ================= ÍCONOS =================
  const ICON = {
    rueda: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="3"/><path d="M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3 6.3 17.7" stroke="currentColor" stroke-width="1.1"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/></svg>',
    marco: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 17 11 17 9 8ZM11 17 17 8M9 8h8M17 8l3.5 9M9 8 8.4 5.2H6M17 8l-.8-3.2h2.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    bici: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="16" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="18.5" cy="16" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 16h6L9.6 9.5ZM11.5 16l4.8-6.5M9.6 9.5h6.7M16.3 9.5l2.2 6.5M9.6 9.5 9 7.4H7.2M16.3 9.5l-.6-2.4h2.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    ovillo: '<svg class="ovi" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="14" fill="currentColor"/><path d="M6 12c6 2 14 1 22-3M5 19c8 3 17 2 24-4M8 25c6 2 13 1 19-4M13 4c-3 7-3 18 1 27M21 4c-4 8-4 18 0 26" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.4"/></svg>'
  };
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const KIND = { work: "trabajando", mon: "en el monitor", wait: "bloqueado", done: "terminó", paused: "detenido" };
  const PIEZA = { ruedas: "rueda", marcos: "marco" };

  // ================= CÓDIGO CLAVE (estático) =================
  (() => {
    const KW = t => `<span class="kw">${t}</span>`, CM = t => `<span class="cm">${t}</span>`;
    const L = (code, mk = "", cls = "") => `<span class="${("l " + cls).trim()}"><i>${mk ? `<span class="mk${cls.includes("w") ? " w" : ""}">${mk}</span>` : ""}</i><span>${code}</span></span>`;
    $("claveCod").innerHTML = [
      L(`${KW("class")} Buffer {`),
      L(`    ${KW("private int")}[] b;              ${CM("// arreglo circular")}`),
      L(`    ${KW("private int")} i = 0, j = 0, cantidad = 0;`),
      L(" "),
      L(`    ${KW("synchronized void")} poner(${KW("int")} pieza) {`, "1", "k"),
      L(`        ${KW("while")} (cantidad == b.length)`, "2", "k w"),
      L("            wait();", "", "k w"),
      L("        b[i] = pieza;  i = (i + 1) % b.length;"),
      L("        cantidad++;"),
      L("        notifyAll();", "3", "k"),
      L("    }"),
      L(" "),
      L(`    ${KW("synchronized int")}[] extraer(${KW("int")} n) {`, "1", "k"),
      L(`        ${KW("while")} (cantidad &lt; n)`, "2", "k w"),
      L("            wait();", "", "k w"),
      L(`        ${KW("for")} (k = 0; k &lt; n; k++) { piezas[k] = b[j];  j = (j + 1) % b.length; }`, "4", "k"),
      L("        cantidad -= n;", "", "k"),
      L("        notifyAll();", "3", "k"),
      L(`        ${KW("return")} piezas;`),
      L("    }"),
      L("}"),
      L(" "),
      L(CM("// Montador.run(), por cada bici:")),
      L("ruedas.extraer(2);", "5", "k"),
      L("marcos.extraer(1);", "", "k")
    ].join("");
  })();

  // ================= ESCENA =================
  function crearEscena(root) {
    const actorHtml = (id, nombre) =>
      `<div class="act" data-actor="${id}" style="--who: var(--a-${id})">${ICON.ovillo}<b>${nombre}<span class="st"></span></b><span class="es"></span><code></code>${id !== "mo" ? '<span class="pg"></span>' : ""}</div>`;
    const almHtml = (n, titulo) => `<div class="cesto" data-alm="${n}"><div class="cesto-h"><b>${titulo}</b><span data-r="cnt"></span></div><div class="slots"></div></div>`;
    root.innerHTML = `
    <svg class="sk-threads" aria-hidden="true"></svg>
    <div class="sk-top"><b>Fábrica de bicicletas</b><span data-r="time"></span></div>
    <div class="sk-floor">
      <div class="sk-col"><h5>Operarios</h5>${actorHtml("ru", "Operario de ruedas")}${actorHtml("ma", "Operario de marcos")}</div>
      <div class="sk-col"><h5>Almacenes (Buffer)</h5>${almHtml("ruedas", "Ruedas")}${almHtml("marcos", "Marcos")}</div>
      <div class="sk-col"><h5>Montaje</h5>${actorHtml("mo", "Montador")}<div class="hand" data-r="hand"></div><h5>Bicis terminadas</h5><div class="bicis" data-r="bicis"></div></div>
    </div>
    <div class="sk-low">
      <div class="sk-col"><h5>Monitores</h5><div class="sync-box" data-r="sync"></div></div>
      <div class="sk-col"><h5>Filas del patrón (código)</h5><div class="codigo" data-r="code"></div></div>
      <div class="sk-col"><h5>Notas del patrón (salida)</h5><pre class="salida" data-r="log"></pre></div>
    </div>`;
    const q = s => root.querySelector(s);
    const actorEl = id => q(`[data-actor="${id}"]`);
    const almEl = n => q(`[data-alm="${n}"]`);
    const slotEl = (n, i) => almEl(n).querySelectorAll(".slot")[i];
    const biciEl = n => q('[data-r="bicis"]').querySelectorAll(".slot")[n - 1];
    const svg = q(".sk-threads");
    const color = v => getComputedStyle(root).getPropertyValue(v).trim();
    let prevB = {}, popDelay = {}, bPrev = 0, bDelay = 0, logLen = -1;

    function volar(desde, hacia, pieza) {
      if (reducir || !desde || !hacia) return 0;
      const dur = Math.max(160, 560 / Math.max(1, vel));
      const a = desde.getBoundingClientRect(), b = hacia.getBoundingClientRect();
      if (a.bottom < 0 || a.top > innerHeight + 200) return 0;
      const el = document.createElement("div"); el.className = "vuela"; el.innerHTML = ICON[pieza];
      el.style.color = color(pieza === "bici" ? "--ens" : "--" + pieza);
      document.body.appendChild(el);
      const ax = a.left + a.width / 2 - 13, ay = a.top + a.height / 2 - 13, bx = b.left + b.width / 2 - 13, by = b.top + b.height / 2 - 13;
      el.animate([
        { transform: `translate(${ax}px,${ay}px) scale(.7)`, opacity: .5 },
        { transform: `translate(${(ax + bx) / 2}px,${Math.min(ay, by) - 36}px) scale(1.2)`, opacity: 1, offset: .5 },
        { transform: `translate(${bx}px,${by}px) scale(1)`, opacity: 1 }
      ], { duration: dur, easing: "cubic-bezier(.45,0,.25,1)" }).onfinish = () => el.remove();
      return dur;
    }

    function syncHtml(sim) {
      const chip = a => `<span class="chip" style="--who: var(--a-${a.id})">${a.nombre}</span>`;
      const lista = arr => arr.length ? arr.map(chip).join("") : "<span>nadie</span>";
      return Object.values(sim.almacenes).map(alm => {
        const m = alm.mon;
        return `<div class="mon-blk">
        <div class="zona" data-t="${alm.nombre}-entrada"><span>Esperan para entrar</span><div>${lista(m.entrada)}</div></div>
        <div class="rep"><span class="rep-t">monitor ${alm.nombre} · cantidad ${alm.n}/${alm.max}</span>
          <div class="zona"><span>Adentro</span><div>${m.owner ? chip(m.owner) : "<span>libre</span>"}</div></div>
          <div class="zona" data-t="${alm.nombre}-espera"><span>En wait()</span><div>${lista(m.espera)}</div></div>
        </div></div>`;
      }).join("");
    }

    return {
      reset(sim) {
        for (const alm of Object.values(sim.almacenes)) {
          almEl(alm.nombre).querySelector(".slots").innerHTML = Array.from({ length: alm.max }, () => `<div class="slot">${ICON[PIEZA[alm.nombre]]}<span class="num"></span><span class="ptr"></span></div>`).join("");
          prevB[alm.nombre] = Array(alm.max).fill(null); popDelay[alm.nombre] = 0;
        }
        q('[data-r="bicis"]').innerHTML = Array.from({ length: N_B }, () => `<div class="slot">${ICON.bici}</div>`).join("");
        q('[data-r="code"]').innerHTML = CODE.map((l, i) => l.h
          ? `<div class="ln h"><span class="marks"></span><code>${esc(l.h)}</code><span class="rn"></span></div>`
          : `<div class="ln" data-id="${l.id}"><span class="marks"></span><code>${esc(l.s)}</code><span class="rn">${i + 1}</span></div>`).join("");
        q('[data-r="sync"]').dataset.html = ""; q('[data-r="hand"]').dataset.html = "";
        q('[data-r="log"]').textContent = "";
        bPrev = 0; bDelay = 0; logLen = -1;
      },
      onEvent(e) {
        if (e.type === "deja") popDelay[e.alm] = volar(actorEl(e.actor), slotEl(e.alm, e.idx), e.pieza);
        else if (e.type === "saca") e.idxs.forEach(i => volar(slotEl(e.alm, i), q('[data-r="hand"]'), e.pieza));
        else if (e.type === "bici") bDelay = volar(actorEl("mo"), biciEl((e.n - 1) % N_B + 1), "bici");
      },
      render(sim) {
        q('[data-r="time"]').textContent = `t = ${(sim.now / 1000).toFixed(1).replace(".", ",")} s · ${sim.bicis} ${sim.bicis === 1 ? "bici" : "bicis"}`;
        for (const a of sim.actores) {
          const el = actorEl(a.id);
          const kind = a.state === "parked" || a.congelado ? "paused" : a.kind;
          el.dataset.kind = kind;
          el.querySelector(".st").textContent = KIND[kind];
          el.querySelector(".es").textContent = a.state === "parked" ? "detenido antes de entrar al monitor" : a.congelado ? `detenido mientras ${a.estado}` : a.estado;
          el.querySelector("code").textContent = a.ln ? lineaTexto(a.ln) : "—";
          const pg = el.querySelector(".pg");
          if (pg) pg.textContent = a.id === "ru" ? `ruedas hechas: ${a.hechas}` : `marcos hechos: ${a.hechas}`;
        }
        const mo = sim.actores[2];
        const h = [...mo.hand.rueda.map(n => `<span style="color:var(--rueda)" title="rueda ${n}">${ICON.rueda}</span>`), ...mo.hand.marco.map(n => `<span style="color:var(--marco)" title="marco ${n}">${ICON.marco}</span>`)];
        const handHtml = "en la mano: " + (h.length ? h.join("") : "nada");
        const hand = q('[data-r="hand"]'); if (hand.dataset.html !== handHtml) { hand.innerHTML = handHtml; hand.dataset.html = handHtml; }

        for (const alm of Object.values(sim.almacenes)) {
          const box = almEl(alm.nombre);
          box.querySelector('[data-r="cnt"]').textContent = `cantidad ${alm.n}/${alm.max}${alm.n === alm.max ? " · lleno" : ""}`;
          box.classList.toggle("lleno", alm.n === alm.max);
          box.querySelectorAll(".slot").forEach((s, k) => {
            const v = alm.b[k], on = v !== null;
            if (on && prevB[alm.nombre][k] !== v) { s.classList.add("pop"); s.style.setProperty("--d", (popDelay[alm.nombre] * .8) + "ms"); }
            if (!on) s.classList.remove("pop");
            s.classList.toggle("on", on);
            s.style.color = `var(--${PIEZA[alm.nombre]})`;
            s.querySelector(".num").textContent = on ? v : "";
            const p = (k === alm.i ? "i" : "") + (k === alm.j ? (k === alm.i ? " j" : "j") : "");
            s.querySelector(".ptr").textContent = p;
          });
          prevB[alm.nombre] = alm.b.slice();
        }
        // El estante tiene N_B lugares: al llenarse se vacía y vuelve a empezar.
        const enEstante = sim.bicis ? (sim.bicis - 1) % N_B + 1 : 0;
        if (enEstante < bPrev) bPrev = 0;
        q('[data-r="bicis"]').querySelectorAll(".slot").forEach((s, i) => {
          const on = i < enEstante;
          if (on && i >= bPrev) { s.classList.add("pop"); s.style.setProperty("--d", (bDelay * .8) + "ms"); }
          if (!on) s.classList.remove("pop");
          s.classList.toggle("on", on);
          s.style.color = "var(--ens)";
        });
        bPrev = enEstante;
        const syncEl = q('[data-r="sync"]'), html = syncHtml(sim);
        if (syncEl.dataset.html !== html) { syncEl.innerHTML = html; syncEl.dataset.html = html; }
        q('[data-r="code"]').querySelectorAll(".ln[data-id]").forEach(ln => {
          const quienes = sim.actores.filter(a => a.ln === ln.dataset.id && a.state !== "done");
          const marks = quienes.map(a => `<i style="--who: var(--a-${a.id})" title="${a.nombre}"></i>`).join("");
          const mk = ln.querySelector(".marks"); if (mk.dataset.html !== marks) { mk.innerHTML = marks; mk.dataset.html = marks; }
          ln.classList.toggle("act-l", quienes.length > 0);
        });
        if (logLen !== sim.logs.length) {
          q('[data-r="log"]').innerHTML = sim.logs.slice(-9).map(l => `<span class="${l.tipo || ""}">${esc(l.texto.trim() === l.texto ? l.texto : "  " + l.texto.trim())}</span>`).join("\n");
          logLen = sim.logs.length;
        }
        // hilos: de cada bloqueado a lo que espera
        const rb = root.getBoundingClientRect();
        let paths = "";
        for (const a of sim.actores) {
          const k = sim.bloqueo(a); if (!k) continue;
          const t = q(`[data-t="${k}"]`); if (!t) continue;
          const r1 = actorEl(a.id).getBoundingClientRect(), r2 = t.getBoundingClientRect();
          const x1 = r1.left + r1.width / 2 - rb.left, y1 = r1.bottom - rb.top;
          const x2 = r2.left + Math.min(40, r2.width / 2) - rb.left, y2 = r2.top + Math.min(14, r2.height / 2) - rb.top;
          const dy = Math.max(40, Math.abs(y2 - y1) * .5);
          paths += `<path class="hilo" d="M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}"/><circle class="hilo-pt" cx="${x2}" cy="${y2}" r="4.5"/>`;
        }
        if (svg.dataset.html !== paths) { svg.innerHTML = paths; svg.dataset.html = paths; }
      }
    };
  }

  // ================= ARMADO =================
  const escena = crearEscena($("escena"));
  let sim;
  function reiniciar() {
    const s = sim = crearSim((Math.random() * 1e9) | 0, ev => { alEvento(ev, s); escena.onEvent(ev); });
    escena.reset(sim);
    sim.arrancar();
    escena.render(sim);
  }

  let ultimo = null;
  function cuadro(ts) {
    if (ultimo === null) ultimo = ts;
    const dt = Math.min(100, ts - ultimo); ultimo = ts;
    if (jugando) sim.avanzar(dt * vel);
    escena.render(sim);
    $("btnPlay").textContent = jugando ? "Pausar" : "Seguir";
    requestAnimationFrame(cuadro);
  }

  const marcar = (seg, v) => seg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.vel === String(v))));
  $("segVel").addEventListener("click", ev => { const b = ev.target.closest("button"); if (!b) return; vel = Number(b.dataset.vel); marcar($("segVel"), b.dataset.vel); });
  $("btnPlay").addEventListener("click", () => { jugando = !jugando; if (jugando) avisar(""); });
  $("btnReset").addEventListener("click", () => { jugando = true; avisar(""); reiniciar(); });
  const ritmoTxt = () => { $("ritmoTxt").textContent = RITMOS[$("ritmo").value][1]; };
  $("ritmo").addEventListener("input", ritmoTxt);
  document.addEventListener("keydown", ev => { if (ev.code === "Space" && !/INPUT|BUTTON|TEXTAREA|A/.test(document.activeElement.tagName)) { ev.preventDefault(); $("btnPlay").click(); } });

  // ================= ESCENARIO =================
  const NOMBRES = { ru: "El operario de ruedas", ma: "El operario de marcos", mo: "El montador" };
  const MAXES = { ruedas: MAX_R, marcos: MAX_MA };
  const CASOS = {
    vacio: { ini: [0, 0], parados: [], txt: "Los almacenes arrancan vacíos y todos trabajan: es la simulación normal." },
    lleno: { ini: [0, 4], parados: ["mo"], txt: "El almacén de marcos arranca lleno y el montador está detenido. El operario de marcos termina un marco, encuentra el almacén lleno y hace wait(). El de ruedas llena su almacén (10) y también queda en wait(). Reactivá al montador: cada extraer() hace notifyAll() y los despierta." },
    rueda: { ini: [1, 4], parados: ["ru"], txt: "Hay 1 rueda y 4 marcos, y el operario de ruedas está detenido. El montador pide extraer(2) en ruedas: no alcanza y hace wait(). El operario de marcos encuentra su almacén lleno y también queda en wait(). Reactivá al de ruedas para destrabarlos." },
    mano: { ini: [10, 0], parados: ["ma"], txt: "Ruedas llenas, ningún marco y el operario de marcos detenido. El montador saca 2 ruedas (sale del monitor de ruedas) y queda en wait() en marcos con las ruedas en la mano. El de ruedas repone y vuelve a quedar en wait() con el almacén lleno. Son dos monitores: retener y esperar, pero sin ciclo, así que no hay interbloqueo." }
  };
  function avisar(t) { $("aviso").textContent = t; $("aviso").hidden = !t; }
  function alEvento(ev, s) {
    if (ev.type !== "wait" || !$("autoPausa").checked) return;
    jugando = false; s.frenar = true;
    avisar(`${NOMBRES[ev.actor.id]} hizo wait(): ${ev.motivo.split(":")[0]}`);
  }
  function pintarEscenario() {
    for (const k of ["ruedas", "marcos"]) {
      const st = document.querySelector(`.stp[data-cesto="${k}"]`);
      st.querySelector("output").textContent = ESC.ini[k];
      st.querySelector('[data-d="-1"]').disabled = ESC.ini[k] === 0;
      st.querySelector('[data-d="1"]').disabled = ESC.ini[k] === MAXES[k];
    }
    document.querySelectorAll(".hilo-t").forEach(b => {
      const p = ESC.parados[b.dataset.actor];
      b.setAttribute("aria-pressed", String(!p));
      b.querySelector("span").textContent = p ? "detenido" : "trabaja";
    });
  }
  const marcarCaso = id => $("casos").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.caso === id)));
  function usarCaso(id) {
    const c = CASOS[id];
    [ESC.ini.ruedas, ESC.ini.marcos] = c.ini;
    for (const k in ESC.parados) ESC.parados[k] = c.parados.includes(k);
    marcarCaso(id);
    $("casoTxt").textContent = c.txt;
    pintarEscenario(); jugando = true; avisar(""); reiniciar();
  }
  $("casos").addEventListener("click", ev => { const b = ev.target.closest("button"); if (b) usarCaso(b.dataset.caso); });
  document.querySelectorAll(".stp").forEach(st => st.addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    const k = st.dataset.cesto;
    ESC.ini[k] = Math.max(0, Math.min(MAXES[k], ESC.ini[k] + Number(b.dataset.d)));
    marcarCaso("");
    $("casoTxt").textContent = "Combinación propia: la simulación arranca de nuevo con estas piezas. Las que ya estaban se marcan con letras (a, b, c…).";
    pintarEscenario(); jugando = true; avisar(""); reiniciar();
  }));
  // Detener o reactivar un hilo no reinicia: se aplica en el momento.
  document.querySelectorAll(".hilo-t").forEach(b => b.addEventListener("click", () => {
    ESC.parados[b.dataset.actor] = !ESC.parados[b.dataset.actor];
    pintarEscenario();
  }));

  ritmoTxt();
  usarCaso("vacio");
  requestAnimationFrame(cuadro);
})();
