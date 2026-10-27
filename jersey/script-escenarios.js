// Animación de taller-jerseys-escenarios.html: la misma simulación de TallerJerseys.java, pero se elige con
// cuántas piezas arranca cada cesto y se puede detener cualquier hilo para ver a quién bloquea.
(() => {
  "use strict";
  const MAX_M = 5, MAX_C = 3, N_J = 6, STEP = 260, CS = 450, PROD = [500, 1100];
  const RITMOS = { 1: [[300, 600], "muy rápido"], 2: [[700, 1200], "rápido"], 3: [[1300, 2000], "parejo"], 4: [[2200, 3200], "lento"], 5: [[3600, 5000], "muy lento"] };
  const reducir = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = id => document.getElementById(id);
  const ritmoEns = () => RITMOS[$("ritmo").value][0];
  const modo = "mon";
  let vel = 0.5, jugando = true;
  // Escenario elegido: piezas iniciales en cada cesto y qué hilos están detenidos.
  const ESC = { ini: { mangas: 0, cuerpos: 0 }, parados: { cost: false, fab: false, ens: false } };

  const CODE = {
    mon: [
      { h: "// dejarManga() / dejarCuerpo()" },
      { id: "e1", s: "synchronized void dejar…() {" },
      { id: "c1", s: "  while (cesto lleno)" },
      { id: "c2", s: "    wait();" },
      { id: "c3", s: "  piezas++;" },
      { id: "c4", s: "  notifyAll();" },
      { id: "x1", s: "}" },
      { h: "// tomarPiezas(): ensamblador" },
      { id: "e2", s: "synchronized void tomarPiezas() {" },
      { id: "k1", s: "  while (mangas < 2 || cuerpos < 1)" },
      { id: "k2", s: "    wait();" },
      { id: "k3", s: "  mangas -= 2;  cuerpos -= 1;" },
      { id: "k4", s: "  notifyAll();" },
      { id: "x2", s: "}" },
      { h: "// fuera del monitor" },
      { id: "w1", s: "trabajar();" }
    ]
  };
  const lineaTexto = (m, id) => (CODE[m].find(l => l.id === id) || {}).s || "";

  // ================= MOTOR (idéntico para los tres estilos) =================
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function crearSim(m, seed, emit) {
    const rng = mulberry32(seed), rnd = ([a, b]) => a + rng() * (b - a);
    const sim = {
      modo: m, now: 0, jerseys: 0, fin: false, logs: [],
      cestos: { mangas: { nombre: "mangas", max: MAX_M, n: ESC.ini.mangas }, cuerpos: { nombre: "cuerpos", max: MAX_C, n: ESC.ini.cuerpos } },
      mon: { owner: null, entrada: [], espera: [] }
    };
    const log = (texto, tipo) => { sim.logs.push({ texto, tipo, t: sim.now }); if (sim.logs.length > 200) sim.logs.shift(); };
    const dormir = (a, ms, estado, kind) => { a.state = "sleeping"; a.until = sim.now + ms; if (estado) a.estado = estado; if (kind) a.kind = kind; };
    function liberarMonitor() {
      sim.mon.owner = null; const nx = sim.mon.entrada.shift();
      if (nx) { sim.mon.owner = nx; dormir(nx, STEP, "entra al monitor", "mon"); }
    }
    function ejecutar(a, c) {
      // Un hilo detenido no entra al monitor: queda afuera, sin tener el candado.
      if (c.t === "enter" && ESC.parados[a.id]) { a.pend = c; a.state = "parked"; return; }
      if (c.ln) a.ln = c.ln;
      switch (c.t) {
        case "sleep": dormir(a, c.ms, c.estado, c.kind); break;
        case "enter":
          if (!sim.mon.owner) { sim.mon.owner = a; dormir(a, STEP, "entra al monitor", "mon"); }
          else { sim.mon.entrada.push(a); a.state = "blocked"; a.kind = "wait"; a.estado = "espera para entrar al monitor"; }
          break;
        case "wait": sim.mon.espera.push(a); a.state = "blocked"; a.kind = "wait"; a.estado = "wait(): duerme y suelta el monitor"; liberarMonitor();
          emit({ type: "wait", actor: a, motivo: sim.logs[sim.logs.length - 1].texto.trim() }); break;
        case "notifyAll": {
          const ws = sim.mon.espera.splice(0);
          ws.forEach(w => { w.estado = "despertado: espera para volver a entrar"; sim.mon.entrada.push(w); });
          if (ws.length) log(`    · notifyAll() despierta a: ${ws.map(w => w.logName).join(", ")}`, "nota");
          dormir(a, STEP, "notifyAll()", "mon"); break;
        }
        case "exit": liberarMonitor(); a.estado = "sale del monitor"; a.kind = "work"; break;
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
    const M = sim.cestos.mangas, C = sim.cestos.cuerpos;
    const MANGA = { art: "la manga", k: "manga" }, CUERPO = { art: "el cuerpo", k: "cuerpo" };

    // Como dice el enunciado, trabajan "continuamente": sin cantidad fija.
    function* prodMon(a, c, p) {
      for (let i = 1; ; i++) {
        yield { t: "sleep", ms: rnd(PROD), ln: "w1", estado: `fabrica ${p.art} ${i}`, kind: "work" };
        log(`${a.logName} termina ${p.art} ${i}`);
        yield { t: "enter", ln: "e1" };
        yield { t: "sleep", ms: STEP, ln: "c1", estado: "revisa si el cesto está lleno", kind: "mon" };
        while (c.n === c.max) {
          log(`    cesto de ${c.nombre} lleno: ${a.logName} espera`, "warn");
          yield { t: "wait", ln: "c2" };
          yield { t: "sleep", ms: STEP, ln: "c1", estado: "vuelve a revisar la condición", kind: "mon" };
        }
        yield { t: "sleep", ms: CS, ln: "c3", estado: `deja ${p.art} en el cesto`, kind: "mon" };
        c.n++; a.hechas = i; emit({ type: "deja", cesto: c.nombre, idx: c.n - 1, actor: a.id, pieza: p.k });
        log(`    cesto de ${c.nombre} recibe 1, hay ${c.n}/${c.max}`);
        yield { t: "notifyAll", ln: "c4" };
        yield { t: "exit", ln: "x1" };
      }
    }
    function* ensMon(a) {
      for (let j = 1; ; j++) {
        yield { t: "enter", ln: "e2" };
        yield { t: "sleep", ms: STEP, ln: "k1", estado: "revisa si están las 3 piezas", kind: "mon" };
        while (M.n < 2 || C.n < 1) {
          log(`    faltan piezas (mangas ${M.n}, cuerpos ${C.n}): ensamblador espera`, "warn");
          yield { t: "wait", ln: "k2" };
          yield { t: "sleep", ms: STEP, ln: "k1", estado: "vuelve a revisar la condición", kind: "mon" };
        }
        yield { t: "sleep", ms: CS, ln: "k3", estado: "se lleva 2 mangas y 1 cuerpo", kind: "mon" };
        emit({ type: "saca", cesto: "mangas", idxs: [M.n - 1, M.n - 2], pieza: "manga" });
        emit({ type: "saca", cesto: "cuerpos", idxs: [C.n - 1], pieza: "cuerpo" });
        M.n -= 2; C.n -= 1; a.hand = { manga: 2, cuerpo: 1 };
        log(`    el ensamblador se lleva 2 mangas y 1 cuerpo, quedan mangas ${M.n}, cuerpos ${C.n}`);
        yield { t: "notifyAll", ln: "k4" };
        yield { t: "exit", ln: "x2" };
        yield { t: "sleep", ms: rnd(ritmoEns()), ln: "w1", estado: `arma el jersey ${j}`, kind: "work" };
        terminar(a, j);
      }
    }
    function terminar(a, j) {
      a.hand = { manga: 0, cuerpo: 0 }; sim.jerseys = j;
      emit({ type: "jersey", j });
      log(`ensamblador termina el jersey ${j}`);
    }
    const mk = (id, nombre, logName) => ({ id, nombre, logName, state: "ready", until: 0, ln: null, estado: "", kind: "work", hechas: 0, hand: { manga: 0, cuerpo: 0 } });
    const cost = mk("cost", "Costurera", "costurera"), fab = mk("fab", "Fabricante", "fabricante"), ens = mk("ens", "Ensamblador", "ensamblador");
    cost.gen = prodMon(cost, M, MANGA); fab.gen = prodMon(fab, C, CUERPO); ens.gen = ensMon(ens);
    sim.actores = [cost, fab, ens];
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
      if (sim.mon.entrada.includes(a)) return "mon-entrada";
      if (sim.mon.espera.includes(a)) return "mon-espera";
      return null;
    };
    return sim;
  }

  // ================= ÍCONOS =================
  const ICON = {
    manga: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 5.5 11.5 3l7.5 14.5-6.5 3.5z"/></svg>',
    cuerpo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 3h3.2c.5 1.6 3.1 1.6 3.6 0H17l1.5 4v14h-13V7z"/></svg>',
    jersey: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8.2 2.5 3.5 4.6 1 11.2l3.4 1.6L6 9.6V21.5h12V9.6l1.6 3.2 3.4-1.6-2.5-6.6-4.7-2.1c-.6 1.9-7 1.9-7.6 0z"/></svg>',
    ovillo: '<svg class="ovi" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="14" fill="currentColor"/><path d="M6 12c6 2 14 1 22-3M5 19c8 3 17 2 24-4M8 25c6 2 13 1 19-4M13 4c-3 7-3 18 1 27M21 4c-4 8-4 18 0 26" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.4"/></svg>',
  };
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const KIND = { work: "trabajando", sync: "sincronizando", mon: "en el monitor", wait: "bloqueado", done: "terminó", paused: "detenido" };

  // ================= RENDERER DOM (tejido y señales) =================
  function crearDom(root) {
    const T = { titulo: "Taller de jerseys", prod: "Hilados", cestos: "Bloques de la carta", ens: "Armado", jer: "Prendas terminadas", sync: "Contadores", code: "Filas del patrón (código)", log: "Notas del patrón (salida)" };
    const actorHtml = (id, nombre) =>
      `<div class="act" data-actor="${id}" style="--who: var(--a-${id})">${ICON.ovillo}<b>${nombre}<span class="st"></span></b><span class="es"></span><code></code>${id !== "ens" ? '<span class="pg"></span>' : ""}</div>`;
    root.innerHTML = `
    <svg class="sk-threads" aria-hidden="true"></svg>
    <div class="sk-top"><b>${T.titulo}</b><span data-r="modo"></span><span data-r="time"></span></div>
    <div class="sk-floor">
      <div class="sk-col"><h5>${T.prod}</h5>${actorHtml("cost", "Costurera")}${actorHtml("fab", "Fabricante")}</div>
      <div class="sk-col"><h5>${T.cestos}</h5>
        <div class="cesto" data-cesto="mangas"><div class="cesto-h"><b>Mangas</b><span data-r="cnt"></span></div><div class="slots"></div></div>
        <div class="cesto" data-cesto="cuerpos"><div class="cesto-h"><b>Cuerpos</b><span data-r="cnt"></span></div><div class="slots"></div></div>
      </div>
      <div class="sk-col"><h5>${T.ens}</h5>${actorHtml("ens", "Ensamblador")}<div class="hand" data-r="hand"></div><h5>${T.jer}</h5><div class="jer" data-r="jer"></div></div>
    </div>
    <div class="sk-low">
      <div class="sk-col"><h5>${T.sync}</h5><div data-r="sync"></div></div>
      <div class="sk-col"><h5>${T.code}</h5><div class="codigo" data-r="code"></div></div>
      <div class="sk-col"><h5>${T.log}</h5><pre class="salida" data-r="log"></pre></div>
    </div>`;
    const q = s => root.querySelector(s);
    const actorEl = id => q(`[data-actor="${id}"]`);
    const cestoEl = n => q(`[data-cesto="${n}"]`);
    const slotEl = (n, i) => cestoEl(n).querySelectorAll(".slot")[i];
    const jerEl = j => q('[data-r="jer"]').querySelectorAll(".slot")[j - 1];
    const svg = q(".sk-threads");
    const color = v => getComputedStyle(root).getPropertyValue(v).trim();
    let prev = {}, popDelay = {}, jPrev = 0, jDelay = 0;

    function volar(desde, hacia, pieza) {
      if (reducir || !desde || !hacia) return 0;
      const dur = Math.max(160, 560 / Math.max(1, vel));
      const a = desde.getBoundingClientRect(), b = hacia.getBoundingClientRect();
      if (a.bottom < 0 || a.top > innerHeight + 200) return 0;
      const el = document.createElement("div"); el.className = "vuela"; el.innerHTML = ICON[pieza];
      el.style.color = color(pieza === "jersey" ? "--ens" : "--" + pieza);
      document.body.appendChild(el);
      const ax = a.left + a.width / 2 - 13, ay = a.top + a.height / 2 - 13, bx = b.left + b.width / 2 - 13, by = b.top + b.height / 2 - 13;
      el.animate([
        { transform: `translate(${ax}px,${ay}px) scale(.7)`, opacity: .5 },
        { transform: `translate(${(ax + bx) / 2}px,${Math.min(ay, by) - 36}px) scale(1.2)`, opacity: 1, offset: .5 },
        { transform: `translate(${bx}px,${by}px) scale(1)`, opacity: 1 }
      ], { duration: dur, easing: "cubic-bezier(.45,0,.25,1)" }).onfinish = () => el.remove();
      return dur;
    }

    function syncMon(sim) {
      const chip = a => `<span class="chip" style="--who: var(--a-${a.id})">${a.nombre}</span>`;
      const lista = arr => arr.length ? arr.map(chip).join("") : "<span>nadie</span>";
      const m = sim.mon, M = sim.cestos.mangas, C = sim.cestos.cuerpos;
      return `<div class="zona" data-t="mon-entrada"><span>Esperan para entrar</span><div>${lista(m.entrada)}</div></div>
      <div class="rep"><span class="rep-t">recuadro de repetición · monitor Taller</span>
        <div class="zona"><span>Adentro</span><div>${m.owner ? chip(m.owner) : "<span>libre</span>"}</div></div>
        <div class="zona" data-t="mon-espera"><span>En wait()</span><div>${lista(m.espera)}</div></div>
        <div class="zona"><span>Variables</span><div style="font-family:'Martian Mono',monospace">mangas ${M.n}/${MAX_M} · cuerpos ${C.n}/${MAX_C}</div></div>
        </div>`;
    }

    const api = {
      reset(sim) {
        for (const c of Object.values(sim.cestos)) cestoEl(c.nombre).querySelector(".slots").innerHTML = Array.from({ length: c.max }, () => `<div class="slot">${ICON[c.nombre === "mangas" ? "manga" : "cuerpo"]}</div>`).join("");
        q('[data-r="jer"]').innerHTML = Array.from({ length: N_J }, (_, i) => `<div class="slot" data-n="${i + 1}">${ICON.jersey}</div>`).join("");
        q('[data-r="code"]').innerHTML = CODE[sim.modo].map((l, i) => l.h
          ? `<div class="ln h"><span class="marks"></span><code>${esc(l.h)}</code><span class="rn"></span></div>`
          : `<div class="ln" data-id="${l.id}"><span class="marks"></span><code>${esc(l.s)}</code><span class="rn">${i + 1}</span></div>`).join("");
        q('[data-r="sync"]').className = "sync-box"; q('[data-r="sync"]').dataset.html = "";
        q('[data-r="log"]').textContent = "";
        prev = { mangas: 0, cuerpos: 0 }; popDelay = { mangas: 0, cuerpos: 0 }; jPrev = 0; jDelay = 0; this.logLen = -1;
      },
      onEvent(e) {
        if (e.type === "deja") popDelay[e.cesto] = volar(actorEl(e.actor), slotEl(e.cesto, e.idx), e.pieza);
        else if (e.type === "saca") e.idxs.forEach(i => volar(slotEl(e.cesto, i), q('[data-r="hand"]'), e.pieza));
        else if (e.type === "jersey") jDelay = volar(actorEl("ens"), jerEl((e.j - 1) % N_J + 1), "jersey");
      },
      render(sim) {
        q('[data-r="time"]').textContent = `t = ${(sim.now / 1000).toFixed(1).replace(".", ",")} s · ${sim.jerseys} ${sim.jerseys === 1 ? "jersey" : "jerseys"}`;
        for (const a of sim.actores) {
          const el = actorEl(a.id);
          const kind = a.state === "parked" || a.congelado ? "paused" : a.kind;
          el.dataset.kind = kind;
          el.querySelector(".st").textContent = KIND[kind];
          el.querySelector(".es").textContent = a.state === "parked" ? "detenido antes de entrar al monitor" : a.congelado ? `detenido mientras ${a.estado}` : a.estado;
          el.querySelector("code").textContent = a.ln ? lineaTexto(sim.modo, a.ln) : "—";
          const pg = el.querySelector(".pg");
          if (pg) pg.textContent = a.id === "cost" ? `mangas hechas: ${a.hechas}` : `cuerpos hechos: ${a.hechas}`;
          if (a.id === "ens") {
            const h = []; for (let i = 0; i < a.hand.manga; i++) h.push(`<span style="color:var(--manga)">${ICON.manga}</span>`); for (let i = 0; i < a.hand.cuerpo; i++) h.push(`<span style="color:var(--cuerpo)">${ICON.cuerpo}</span>`);
            const html = "en la mano: " + (h.length ? h.join("") : "nada");
            const hand = q('[data-r="hand"]'); if (hand.dataset.html !== html) { hand.innerHTML = html; hand.dataset.html = html; }
          }
        }
        for (const c of Object.values(sim.cestos)) {
          const box = cestoEl(c.nombre);
          box.querySelector('[data-r="cnt"]').textContent = `${c.n}/${c.max}${c.n === c.max ? " · lleno" : ""}`;
          box.classList.toggle("lleno", c.n === c.max);
          box.querySelectorAll(".slot").forEach((s, i) => {
            const on = i < c.n;
            if (on && i >= prev[c.nombre]) { s.classList.add("pop"); s.style.setProperty("--d", (popDelay[c.nombre] * .8) + "ms"); }
            if (!on) s.classList.remove("pop");
            s.classList.toggle("on", on);
            s.style.color = `var(--${c.nombre === "mangas" ? "manga" : "cuerpo"})`;
          });
          prev[c.nombre] = c.n;
        }
        // El estante tiene N_J lugares: al llenarse se vacía y vuelve a empezar.
        const enEstante = sim.jerseys ? (sim.jerseys - 1) % N_J + 1 : 0;
        if (enEstante < jPrev) jPrev = 0;
        q('[data-r="jer"]').querySelectorAll(".slot").forEach((s, i) => {
          const on = i < enEstante;
          if (on && i >= jPrev) { s.classList.add("pop"); s.style.setProperty("--d", (jDelay * .8) + "ms"); }
          if (!on) s.classList.remove("pop");
          s.classList.toggle("on", on);
          s.style.color = "var(--ens)";
        });
        jPrev = enEstante;
        const syncEl = q('[data-r="sync"]');
        const html = syncMon(sim);
        if (syncEl.dataset.html !== html) { syncEl.innerHTML = html; syncEl.dataset.html = html; }
        q('[data-r="code"]').querySelectorAll(".ln[data-id]").forEach(ln => {
          const quienes = sim.actores.filter(a => a.ln === ln.dataset.id && a.state !== "done");
          const marks = quienes.map(a => `<i style="--who: var(--a-${a.id})" title="${a.nombre}"></i>`).join("");
          const mk = ln.querySelector(".marks"); if (mk.dataset.html !== marks) { mk.innerHTML = marks; mk.dataset.html = marks; }
          ln.classList.toggle("act-l", quienes.length > 0);
        });
        if (this.logLen !== sim.logs.length) {
          const out = q('[data-r="log"]');
          out.innerHTML = sim.logs.slice(-9).map(l => {
            return `<span class="${l.tipo || ""}">${esc(l.texto.trim() === l.texto ? l.texto : "  " + l.texto.trim())}</span>`;
          }).join("\n");
          this.logLen = sim.logs.length;
        }
        // hilos: de cada bloqueado a lo que espera
        const rb = root.getBoundingClientRect();
        let paths = "";
        for (const a of sim.actores) {
          const k = sim.bloqueo(a); if (!k) continue;
          const t = q(`[data-t="${k}"]`); if (!t) continue;
          const r1 = actorEl(a.id).getBoundingClientRect(), r2 = t.getBoundingClientRect();
          const x1 = r1.left + r1.width / 2 - rb.left, y1 = r1.bottom - rb.top;
          const x2 = r2.left + Math.min(40, r2.width / 2) - rb.left, y2 = r2.top + Math.min(16, r2.height / 2) - rb.top;
          const dy = Math.max(40, Math.abs(y2 - y1) * .5);
          paths += `<path class="hilo" d="M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}"/><circle class="hilo-pt" cx="${x2}" cy="${y2}" r="4.5"/>`;
        }
        if (svg.dataset.html !== paths) { svg.innerHTML = paths; svg.dataset.html = paths; }
      }
    };
    return api;
  }

  // ================= ARMADO =================
  const escenas = [
    { el: document.querySelector('[data-world="tejido"]'), r: null }
  ];
  escenas[0].r = crearDom(escenas[0].el);
  escenas.forEach(e => { e.visible = true; });
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(ents => ents.forEach(en => { const e = escenas.find(x => x.el === en.target); if (e) e.visible = en.isIntersecting; }), { rootMargin: "200px" });
    escenas.forEach(e => io.observe(e.el));
  }

  function reiniciar() {
    const seed = (Math.random() * 1e9) | 0;
    for (const e of escenas) {
      e.sim = crearSim(modo, seed, ev => { alEvento(ev, e.sim); e.r.onEvent(ev, e.sim); });
      e.r.reset(e.sim);
    }
    for (const e of escenas) e.sim.arrancar();
    for (const e of escenas) e.r.render(e.sim);
  }

  let ultimo = null;
  function cuadro(ts) {
    if (ultimo === null) ultimo = ts;
    const dt = Math.min(100, ts - ultimo); ultimo = ts;
    if (jugando) for (const e of escenas) e.sim.avanzar(dt * vel);
    for (const e of escenas) if (e.visible) e.r.render(e.sim);
    $("btnPlay").textContent = jugando ? "Pausar" : "Seguir";
    requestAnimationFrame(cuadro);
  }

  const marcar = (seg, attr, v) => seg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset[attr] === String(v))));
  $("segVel").addEventListener("click", ev => { const b = ev.target.closest("button"); if (!b) return; vel = Number(b.dataset.vel); marcar($("segVel"), "vel", b.dataset.vel); });
  $("btnPlay").addEventListener("click", () => { jugando = !jugando; if (jugando) avisar(""); });
  $("btnReset").addEventListener("click", () => { jugando = true; avisar(""); reiniciar(); });
  const ritmoTxt = () => { $("ritmoTxt").textContent = RITMOS[$("ritmo").value][1]; };
  $("ritmo").addEventListener("input", ritmoTxt);
  document.addEventListener("keydown", ev => { if (ev.code === "Space" && !/INPUT|BUTTON|TEXTAREA|A/.test(document.activeElement.tagName)) { ev.preventDefault(); $("btnPlay").click(); } });

  // ================= ESCENARIO =================
  const NOMBRES = { cost: "La costurera", fab: "El fabricante", ens: "El ensamblador" };
  const MAXES = { mangas: MAX_M, cuerpos: MAX_C };
  const CASOS = {
    vacio: { ini: [0, 0], parados: [], txt: "Los cestos arrancan vacíos y todos trabajan: es la simulación normal." },
    lleno: { ini: [5, 0], parados: ["ens"], txt: "El cesto de mangas arranca lleno y el ensamblador está detenido. La costurera termina una manga, encuentra el cesto lleno y hace wait(). El fabricante llena el cesto de cuerpos y también queda en wait(). Reactivá al ensamblador: al sacar piezas hace notifyAll() y los despierta a los dos." },
    tres: { ini: [3, 1], parados: [], txt: "Arranca con 3 mangas y 1 cuerpo. El ensamblador se lleva 2 mangas y el cuerpo enseguida, y queda 1 manga. En la vuelta siguiente le faltan piezas: hace wait() hasta que alguien deja una y llama a notifyAll()." },
    cuerpo: { ini: [4, 0], parados: ["fab"], txt: "Hay 4 mangas pero ningún cuerpo, y el fabricante está detenido. El ensamblador hace wait() porque le falta el cuerpo. La costurera llena el cesto (5/5) y también queda en wait(): los dos dependen del fabricante. Reactivalo para ver cómo se destraban." }
  };
  function avisar(t) { $("aviso").textContent = t; $("aviso").hidden = !t; }
  function alEvento(ev, s) {
    if (ev.type !== "wait" || !$("autoPausa").checked) return;
    jugando = false; s.frenar = true;
    avisar(`${NOMBRES[ev.actor.id]} hizo wait(): ${ev.motivo.split(":")[0]}`);
  }
  function pintarEscenario() {
    for (const k of ["mangas", "cuerpos"]) {
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
  function usarCaso(id) {
    const c = CASOS[id];
    [ESC.ini.mangas, ESC.ini.cuerpos] = c.ini;
    for (const k in ESC.parados) ESC.parados[k] = c.parados.includes(k);
    marcar($("casos"), "caso", id);
    $("casoTxt").textContent = c.txt;
    pintarEscenario(); jugando = true; avisar(""); reiniciar();
  }
  $("casos").addEventListener("click", ev => { const b = ev.target.closest("button"); if (b) usarCaso(b.dataset.caso); });
  document.querySelectorAll(".stp").forEach(st => st.addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    const k = st.dataset.cesto;
    ESC.ini[k] = Math.max(0, Math.min(MAXES[k], ESC.ini[k] + Number(b.dataset.d)));
    marcar($("casos"), "caso", "");
    $("casoTxt").textContent = "Combinación propia: la simulación arranca de nuevo con estas piezas.";
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
