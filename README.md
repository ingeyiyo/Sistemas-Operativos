# Sistemas Operativos: concurrencia con monitores en Java

Trabajo de la presentación del 27/10/2026 (FACET-UNT). Dos problemas de productor-consumidor resueltos con **monitores en Java**, cada uno con una animación interactiva para la demo:

| Problema | Carpeta | Programa | Animación |
|---|---|---|---|
| Problema resuelto: fábrica de bicicletas (ejercicio resuelto 10.5, pág. 363) | [`bicicletas/`](bicicletas) | `FabricaBicicletas.java` | `fabrica-bicicletas.html` |
| Problema propuesto: taller de jerseys (tema propuesto 6, pág. 273) | [`jersey/`](jersey) | `TallerJerseys.java` | `taller-jerseys.html` |

## Contenido

1. [Cómo ejecutar](#1-cómo-ejecutar)
2. [Conceptos que hay que saber](#2-conceptos-que-hay-que-saber)
3. [Monitores en Java](#3-monitores-en-java)
4. [Problema resuelto: fábrica de bicicletas](#4-problema-resuelto-fábrica-de-bicicletas)
5. [Problema propuesto: taller de jerseys](#5-problema-propuesto-taller-de-jerseys)
6. [Monitor contra semáforos](#6-monitor-contra-semáforos)
7. [Las animaciones](#7-las-animaciones)
8. [Preguntas probables y cómo responderlas](#8-preguntas-probables-y-cómo-responderlas)
9. [Guion sugerido para los 20 minutos](#9-guion-sugerido-para-los-20-minutos)

---

## 1. Cómo ejecutar

Hace falta un JDK 11 o superior (lo probamos con JDK 22). Cada programa es un solo archivo, así que no hace falta compilar aparte ni usar NetBeans:

```bash
cd bicicletas
java FabricaBicicletas.java
```

```bash
cd jersey
java TallerJerseys.java
```

Si los acentos salen mal en la consola de Windows, agregar `-Dstdout.encoding=UTF-8` (en PowerShell va entre comillas: `"-Dstdout.encoding=UTF-8"`).

Las animaciones se abren con doble clic en el `.html`. Cada carpeta tiene su `style.css` y su `script.js`: si se copia la página a otro lado, hay que llevar la carpeta entera.

---

## 2. Conceptos que hay que saber

**Proceso / hilo.** Un hilo (*thread*) es una secuencia de ejecución dentro de un programa. En nuestros programas hay tres hilos que corren a la vez: dos productores y un consumidor. El sistema operativo decide cuándo corre cada uno y puede sacarlo del procesador en cualquier momento (*planificación apropiativa*).

**Condición de carrera.** Pasa cuando el resultado depende del orden en que se intercalan los hilos. Ejemplo: `cantidad++` parece una sola operación, pero en realidad son tres (leer, sumar, escribir). Si dos hilos lo hacen a la vez, uno puede pisar al otro y se pierde una pieza.

**Sección crítica.** La parte del código que toca datos compartidos (acá, los contadores y arreglos de los almacenes). Tiene que cumplir **exclusión mutua**: un solo hilo adentro a la vez.

**Sincronización por condición.** Además de no pisarse, los hilos tienen que **esperarse**: el productor no puede dejar una pieza si el almacén está lleno, y el consumidor no puede sacar si no hay suficientes. Son dos problemas distintos y el monitor resuelve los dos.

**Productor-consumidor con buffer acotado.** El patrón de los dos ejercicios: productores que dejan cosas en un buffer de capacidad limitada y un consumidor que las saca. Las tres reglas son:
1. Exclusión mutua sobre el buffer.
2. El productor espera si el buffer está lleno.
3. El consumidor espera si no hay lo que necesita.

**Interbloqueo (*deadlock*).** Un grupo de hilos queda esperando para siempre porque cada uno espera algo que tiene otro. Necesita las cuatro condiciones de Coffman a la vez: exclusión mutua, **retener y esperar** (*hold and wait*), no apropiación y **espera circular**.

**Inanición (*starvation*).** Un hilo podría ejecutarse pero nunca le toca, porque siempre pasa otro antes.

**Semáforo.** Un contador entero con dos operaciones atómicas: `P` (*wait*, en Java `acquire()`) resta 1 y bloquea si llega a 0; `V` (*signal*, en Java `release()`) suma 1 y despierta a uno. Con semáforos el programador arma todo a mano: un `mutex` para la exclusión mutua y semáforos contadores para las condiciones.

**Monitor.** Un módulo que **encapsula** los datos compartidos junto con los procedimientos que los usan, y garantiza que **un solo proceso a la vez** ejecute cualquiera de esos procedimientos. La exclusión mutua la da el lenguaje, no el programador. Para esperar condiciones usa **variables de condición** con `delay`/`resume` (en Pascal-FC) o `wait`/`notify` (en Java).

---

## 3. Monitores en Java

En Java **cualquier objeto puede ser un monitor**. Cada objeto tiene un candado (*lock*) interno y un único conjunto de espera.

| Concepto de monitor | En Java |
|---|---|
| Procedimiento del monitor (exclusión mutua) | método `synchronized` |
| `delay(c)`: esperar una condición | `wait()` |
| `resume(c)`: despertar a uno | `notify()` |
| despertar a todos | `notifyAll()` |
| Variables de condición con nombre | **No hay**: hay una sola cola de espera por objeto |

### Qué pasa en cada operación

- **Entrar a un método `synchronized`:** el hilo toma el candado del objeto. Si otro hilo lo tiene, espera en la **cola de entrada** (*entry set*).
- **`wait()`:** el hilo **suelta el candado** y pasa al **conjunto de espera** (*wait set*). Soltarlo es clave: si no, nadie más podría entrar a cambiar el estado y el que espera dormiría para siempre.
- **`notifyAll()`:** todos los hilos del conjunto de espera pasan a competir de nuevo por el candado. **No siguen enseguida**: el que llamó a `notifyAll()` sigue ejecutando hasta salir del método.
- **Salir del método:** se libera el candado y entra el siguiente.

### Por qué `while` y no `if`

Java usa la semántica **"señalar y continuar"** (*signal and continue*, o semántica Mesa): el hilo que avisa **sigue** adentro, y el despertado tiene que volver a pelear por el candado. Mientras tanto, otro hilo pudo entrar y cambiar el estado. Por eso, al despertar, **la condición puede volver a ser falsa** y hay que revisarla de nuevo:

```java
while (cantidad == b.length)   // al volver de wait(), revisa otra vez
    wait();
```

Con `if`, el hilo seguiría de largo aunque el almacén estuviera lleno otra vez, y se rompería la capacidad del buffer. Además, Java permite *despertares espurios*: `wait()` puede volver sin que nadie haya avisado. Con `while` eso no hace daño.

En el monitor clásico de **Hoare** (y en Pascal-FC), `resume` le pasa el monitor **inmediatamente** al proceso despertado, así que la condición está garantizada y alcanza con `if`. Esta diferencia es una pregunta típica.

### Por qué `notifyAll()` y no `notify()`

Como en Java hay **una sola cola de espera por objeto**, ahí duermen juntos hilos que esperan cosas distintas. `notify()` despierta a **uno cualquiera**, que puede no ser el que corresponde: vuelve a revisar su condición, se vuelve a dormir y el aviso **se pierde**. El que sí podía seguir queda dormido, y el programa puede trabarse. `notifyAll()` despierta a todos y cada uno revisa su `while`, así que nunca se pierde un aviso.

- En **jerseys** es obligatorio: en el monitor `Taller` pueden estar esperando la costurera (cesto de mangas lleno), el fabricante (cesto de cuerpos lleno) y el ensamblador (faltan piezas).
- En **bicicletas** cada `Buffer` tiene un solo productor y un solo consumidor, y nunca pueden estar esperando los dos a la vez (lleno y "faltan piezas" no se dan juntos). Ahí `notify()` andaría, pero `notifyAll()` es más seguro y no depende de ese razonamiento.

---

## 4. Problema resuelto: fábrica de bicicletas

### Enunciado (resumen)

Dos operarios y un montador. Un operario fabrica ruedas (puede acumular hasta **10**), otro fabrica marcos (hasta **4**) y el montador toma **2 ruedas y 1 marco** para cada bicicleta. El montador no puede tomar piezas que no se fabricaron, y los operarios esperan si su almacén está lleno.

### Diseño

Cada almacén es un **monitor propio**: dos instancias de la misma clase `Buffer`, una de ruedas (capacidad 10) y una de marcos (capacidad 4). Como son objetos distintos, cada uno tiene su propio candado: el operario de ruedas nunca frena al de marcos.

```
 Operario ruedas ──poner()──▶ [ Buffer ruedas (10) ] ──extraer(2)──┐
                                                                  ├──▶ Montador ──▶ bici
 Operario marcos ──poner()──▶ [ Buffer marcos (4)  ] ──extraer(1)──┘
```

### Pseudocódigo (estilo Pascal-FC)

```pascal
monitor Buffer(capacidad);
  export poner, extraer;
  var b: array[0..capacidad-1] of integer;
      i, j, cantidad: integer;
      hayLugar, hayPiezas: condition;

  procedure poner(pieza: integer);
  begin
    if cantidad = capacidad then delay(hayLugar);
    b[i] := pieza;  i := (i + 1) mod capacidad;
    cantidad := cantidad + 1;
    resume(hayPiezas)
  end;

  procedure extraer(n: integer);   (* saca n piezas juntas *)
  begin
    while cantidad < n do delay(hayPiezas);   (* puede necesitar varios avisos *)
    for k := 1 to n do j := (j + 1) mod capacidad;
    cantidad := cantidad - n;
    resume(hayLugar)
  end;

begin  i := 0; j := 0; cantidad := 0  end;

process OperarioRuedas;   repeat fabricar; ruedas.poner(rueda) forever;
process OperarioMarcos;   repeat fabricar; marcos.poner(marco) forever;
process Montador;
  repeat
    ruedas.extraer(2);
    marcos.extraer(1);
    montar
  forever;
```

En `extraer` va `while` aun en Pascal-FC: con 1 rueda en el almacén, el primer `resume(hayPiezas)` despierta al montador, pero todavía no hay 2.

### El código Java, por partes

**`Buffer`, el monitor.** Usa el mismo **arreglo circular** que el proyecto del drive:

```java
class Buffer {
    private final int[] b;    // piezas guardadas
    private int i = 0;        // próximo lugar donde poner
    private int j = 0;        // próximo lugar de donde extraer
    private int cantidad = 0; // piezas en el almacén

    synchronized void poner(int pieza, String quien) throws InterruptedException {
        while (cantidad == b.length) {   // lleno: esperar
            wait();
        }
        b[i] = pieza;
        i = (i + 1) % b.length;          // da la vuelta al arreglo
        cantidad++;
        notifyAll();                     // puede que el montador esté esperando
    }

    synchronized int[] extraer(int n) throws InterruptedException {
        while (cantidad < n) {           // faltan piezas: esperar
            wait();
        }
        int[] piezas = new int[n];
        for (int k = 0; k < n; k++) {
            piezas[k] = b[j];
            j = (j + 1) % b.length;
        }
        cantidad -= n;
        notifyAll();                     // hay lugar: el operario puede seguir
        return piezas;
    }
}
```

- `i` y `j` avanzan con `% b.length`, así que el arreglo se reutiliza en círculo y las piezas salen **en el orden en que entraron** (FIFO).
- `cantidad` es lo que se compara en las condiciones. Reemplaza a los semáforos `hayEspacio` y `hayDatos` del original.
- `extraer(n)` saca las `n` piezas **dentro de una sola llamada al monitor**: las 2 ruedas salen juntas, y nadie puede meterse en el medio.

**`Operario`.** Un hilo (`extends Thread`) que fabrica `cantidad` piezas, cada una con su número, y las va poniendo en su almacén:

```java
for (int n = 1; n <= cantidad; n++) {
    trabajar(0, 50);          // simula el tiempo de fabricar
    almacen.poner(n, quien);
}
```

**`Montador`.** Para cada bici, primero saca las ruedas y después el marco:

```java
int[] r = ruedas.extraer(2);
int[] m = marcos.extraer(1);
trabajar(100, 200);           // simula el tiempo de montar
```

**`main`.** Crea los dos `Buffer`, arranca los tres hilos con `start()` (el *cobegin*) y los espera con `join()` (el *coend*) antes de imprimir el mensaje final. Las cantidades salen de `NUM_BICIS = 6`: 12 ruedas y 6 marcos, justo las que hacen falta.

Los operarios tardan de 0 a 50 ms y el montador de 100 a 200 ms. Como el montador es más lento, los almacenes se llenan y se ven las esperas.

### Qué cambiamos del proyecto del drive

| | Drive | Nuestra versión |
|---|---|---|
| Sincronización | Semáforos `mutex`, `hayEspacio`, `hayDatos` | Monitor: `synchronized` + `wait`/`notifyAll` |
| Sacar 2 ruedas | Dos `extraer()` seguidos | Un solo `extraer(2)` |
| Cantidades | 10 ruedas y 4 marcos para 4 bicis (sobran 2 ruedas) | 12 y 6 para 6 bicis, todo sale de `NUM_BICIS` |
| Dato guardado | Número al azar sin usar | Número de pieza, se ve qué piezas lleva cada bici |
| Fin | `main` no espera a los hilos | `join()` y mensaje final |
| Errores | `printStackTrace()` | `Thread.currentThread().interrupt()` |

### Cómo leer la salida

```
    faltan ruedas (hay 1, necesita 2): montador espera      ← wait() en extraer
operario de marcos termina el marco 6
    almacén de marcos lleno: operario de marcos espera     ← wait() en poner
montador termina la bici 1 (ruedas 1 y 2, marco 1)        ← orden FIFO
    almacén de marcos entrega 1, hay 3/4
    almacén de marcos recibe 1, hay 4/4                    ← el operario se despertó y siguió
```

### Detalle para mencionar: dos monitores

Como son dos monitores separados, el montador **retiene las 2 ruedas mientras espera un marco** (*hold and wait*). Con un solo montador no hay problema: no hay espera circular, porque el operario de marcos sigue produciendo por su cuenta. Es la diferencia de diseño con los jerseys, donde las 3 piezas salen juntas de **un solo** monitor.

---

## 5. Problema propuesto: taller de jerseys

### Enunciado (resumen)

Tres personas: una costurera hace **mangas** y las deja en un cesto (capacidad `NumMaxMangas`), otra persona hace **cuerpos** y los deja en otro cesto (capacidad `NumMaxCuerpos`), y un ensamblador toma **2 mangas y 1 cuerpo** para cada jersey. Las dos primeras no avanzan si su cesto está lleno, y el ensamblador no avanza si le faltan piezas. Usamos `NUM_MAX_MANGAS = 5`, `NUM_MAX_CUERPOS = 3` y `NUM_JERSEYS = 6`.

### Diseño

Es parecido a las bicicletas, pero con una diferencia importante: los **dos cestos viven dentro de un solo monitor**, `Taller`. Así el ensamblador puede revisar los dos cestos y sacar las 3 piezas **en una sola operación**.

```
 Costurera  ──dejarManga()──▶ ┌──────── monitor Taller ────────┐
                              │  mangas  (máx 5)                │──tomarPiezas()──▶ Ensamblador
 Fabricante ──dejarCuerpo()─▶ │  cuerpos (máx 3)                │   (2 mangas + 1 cuerpo)
                              └─────────────────────────────────┘
```

### Pseudocódigo (estilo Pascal-FC)

```pascal
monitor Taller;
  export dejarManga, dejarCuerpo, tomarPiezas;
  var mangas, cuerpos: integer;
      lugarMangas, lugarCuerpos, hayPiezas: condition;

  procedure dejarManga;
  begin
    if mangas = NumMaxMangas then delay(lugarMangas);
    mangas := mangas + 1;
    if (mangas >= 2) and (cuerpos >= 1) then resume(hayPiezas)
  end;

  procedure dejarCuerpo;
  begin
    if cuerpos = NumMaxCuerpos then delay(lugarCuerpos);
    cuerpos := cuerpos + 1;
    if (mangas >= 2) and (cuerpos >= 1) then resume(hayPiezas)
  end;

  procedure tomarPiezas;
  begin
    if (mangas < 2) or (cuerpos < 1) then delay(hayPiezas);
    mangas := mangas - 2;
    cuerpos := cuerpos - 1;
    resume(lugarMangas);
    resume(lugarCuerpos)
  end;

begin  mangas := 0; cuerpos := 0  end;

process Costurera;    repeat coser manga;   Taller.dejarManga   forever;
process Fabricante;   repeat hacer cuerpo;  Taller.dejarCuerpo  forever;
process Ensamblador;  repeat Taller.tomarPiezas; ensamblar jersey forever;
```

Acá `if` alcanza porque en Pascal-FC el `resume` pasa el monitor al despertado de inmediato, y solo se hace `resume(hayPiezas)` cuando ya están las 3 piezas. En `tomarPiezas`, un `resume` sobre una cola vacía no hace nada.

### El código Java

```java
class Taller {
    private int mangas = 0;
    private int cuerpos = 0;

    synchronized void dejarManga() throws InterruptedException {
        while (mangas == TallerJerseys.NUM_MAX_MANGAS) {
            wait();
        }
        mangas++;
        notifyAll();   // puede que el ensamblador esté esperando piezas
    }

    synchronized void dejarCuerpo() throws InterruptedException {
        while (cuerpos == TallerJerseys.NUM_MAX_CUERPOS) {
            wait();
        }
        cuerpos++;
        notifyAll();
    }

    synchronized void tomarPiezas() throws InterruptedException {
        while (mangas < 2 || cuerpos < 1) {
            wait();
        }
        mangas -= 2;
        cuerpos -= 1;
        notifyAll();   // ahora hay lugar en los cestos
    }
}
```

Las tres condiciones de Pascal-FC se convierten en **una sola** cola de espera de Java. Por eso hacen falta `while` y `notifyAll()` (ver la [sección 3](#3-monitores-en-java)). Los hilos son lambdas que llaman a estos métodos en un `for`, y `main` hace `start()` y `join()` igual que en las bicis.

### Cómo leer la salida

Salida real de una corrida:

```
costurera termina la manga 1
    faltan piezas (mangas 0, cuerpos 0): ensamblador espera
    cesto de mangas recibe 1, hay 1/5
    faltan piezas (mangas 1, cuerpos 0): ensamblador espera     ← despertó, revisó el while, volvió a esperar
fabricante termina el cuerpo 1
    cesto de cuerpos recibe 1, hay 1/3
    faltan piezas (mangas 1, cuerpos 1): ensamblador espera     ← otra vez: todavía falta una manga
costurera termina la manga 2
    cesto de mangas recibe 1, hay 2/5
    el ensamblador se lleva 2 mangas y 1 cuerpo, quedan mangas 0, cuerpos 0
...
fabricante termina el cuerpo 5
    cesto de cuerpos lleno: fabricante espera                   ← wait() con el cesto 3/3
ensamblador termina el jersey 1
    el ensamblador se lleva 2 mangas y 1 cuerpo, quedan mangas 1, cuerpos 2
    cesto de cuerpos recibe 1, hay 3/3                          ← el fabricante despertó y siguió
```

Las líneas "faltan piezas … espera" repetidas son el `while` funcionando: `notifyAll()` despertó al ensamblador, pero la condición todavía no se cumplía.

---

## 6. Monitor contra semáforos

Los dos problemas también se pueden resolver con semáforos (el proyecto del drive lo hacía así). Elegimos monitores por esto:

| | Semáforos | Monitor |
|---|---|---|
| Exclusión mutua | A mano: `P(mutex)` al entrar y `V(mutex)` al salir | Automática con `synchronized` |
| Esperar lugar o piezas | Semáforos contadores (`hayLugar` / `hayPiezas`) | `while (condición) wait();` |
| Avisar que algo cambió | `V()` sobre el semáforo que corresponde | `notifyAll()` y cada uno revisa su condición |
| Tomar varias piezas | En pasos separados: puede quedarse con piezas a medias | En una sola operación del monitor |
| Dónde está la lógica | Repartida en cada proceso | Encapsulada en el monitor |
| Error típico | Invertir el orden de los `P` (por ejemplo `P(mutex)` antes que `P(hayLugar)` → interbloqueo) u olvidar un `V` | Usar `if` en lugar de `while`, o `notify()` donde hace falta `notifyAll()` |

**La ventaja principal:** con el monitor, la condición puede ser **compuesta** (`mangas < 2 || cuerpos < 1`) y se resuelve de forma atómica. Con semáforos cada recurso tiene su contador y el ensamblador tiene que pedirlos por separado.

---

## 7. Las animaciones

Las páginas `taller-jerseys.html` y `fabrica-bicicletas.html` **no ejecutan el Java**: un navegador no puede correr Java. Son una **simulación en JavaScript** que reproduce paso a paso la misma lógica (las mismas condiciones, `wait`, `notifyAll`, cola de entrada y conjunto de espera) para hacerla visible.

Qué muestra cada página:
- Una tarjeta por hilo, con su estado (*trabajando*, *en el monitor*, *bloqueado*) y la línea de código en la que está.
- Los almacenes o cestos llenándose y vaciándose. En las bicis se ven también los números de pieza y los punteros `i`/`j` del arreglo circular.
- El estado del monitor: quién está **adentro**, quién está en **`wait()`** y quién **espera para entrar**.
- Un hilo punteado amarillo que une a cada hilo bloqueado con lo que está esperando.
- El código con un punto de color por cada hilo en su línea actual, y la salida como en la consola.

Controles: **Pausar/Seguir** (también con la barra espaciadora), **Reiniciar**, **velocidad** (½× a 4×) y el **ritmo del ensamblador/montador**. Con el ritmo en *lento* o *muy lento* los almacenes se llenan y se ve a los productores en `wait()`. En *muy rápido* se ve al consumidor esperando piezas.

Los tiempos están estirados para que se vean (en el Java son milisegundos). JavaScript en el navegador tiene un solo hilo, así que ahí no puede haber condiciones de carrera de verdad. Por eso **la solución es el Java**, y la animación es solo la forma de mostrarla.

---

## 8. Preguntas probables y cómo responderlas

**¿Qué hace exactamente `synchronized`?**
Antes de ejecutar el método, el hilo toma el candado del objeto y lo suelta al salir, aunque salga por una excepción. Mientras lo tiene, ningún otro hilo puede entrar a **ningún** método `synchronized` de ese mismo objeto.

**¿Qué pasa con el candado cuando un hilo hace `wait()`?**
Lo suelta, y por eso otros pueden entrar a cambiar el estado. Cuando lo despiertan, tiene que **volver a conseguir el candado** antes de seguir desde donde estaba.

**¿Por qué `while` y no `if`?**
Por la semántica "señalar y continuar" de Java: entre el aviso y el momento en que el despertado recupera el candado, otro hilo pudo cambiar el estado. También por los despertares espurios. Con `if` se podría poner una pieza en un almacén lleno. Ver la [sección 3](#por-qué-while-y-no-if).

**¿Por qué `notifyAll()` y no `notify()`?**
Porque Java tiene una sola cola de espera por objeto, donde duermen hilos que esperan cosas distintas. `notify()` podría despertar al equivocado y el aviso se perdería. Ver la [sección 3](#por-qué-notifyall-y-no-notify).

**¿Qué pasa si sacamos el `synchronized`?**
Dos problemas. Primero, condiciones de carrera: `cantidad++` no es atómico y se pueden perder o duplicar piezas. Segundo, Java no deja llamar a `wait()`/`notifyAll()` sin tener el candado: tira `IllegalMonitorStateException`.

**¿Puede haber interbloqueo?**
- **Jerseys:** no. Hay un solo monitor, el ensamblador toma las 3 piezas juntas (no hay *retener y esperar*) y siempre hay alguien que puede avanzar.
- **Bicicletas:** el montador sí retiene las ruedas mientras espera el marco, pero no hay **espera circular**: el operario de marcos no depende de nadie más para producir. Sin espera circular no hay interbloqueo.

**¿Y con dos ensambladores / montadores?**
- Jerseys: sigue andando igual, porque `tomarPiezas()` es atómico.
- Bicis: cada montador saca 2 ruedas con un solo `extraer(2)`, así que nunca quedan con una rueda cada uno. Con la versión del drive (dos `extraer()` seguidos) eso sí podía pasar.

**¿Puede haber inanición?**
Con un solo hilo de cada tipo, no: cada uno espera solo su propia condición y el otro lado siempre termina generándola. Igual, conviene saber que el monitor de Java **no es justo**: no garantiza el orden en que entran los hilos que esperan.

**¿Por qué en las bicis usaron dos monitores y en los jerseys uno?**
En las bicis seguimos el diseño del libro y del drive: un almacén por operario, y la clase `Buffer` se reutiliza para los dos. En los jerseys pusimos los dos cestos juntos para que el ensamblador saque las 3 piezas en una sola operación. Los dos diseños son válidos. Uno da más paralelismo (los operarios no se frenan entre sí) y el otro, atomicidad entre los dos cestos.

**¿Qué es el arreglo circular?**
Un buffer de tamaño fijo donde `i` (dónde poner) y `j` (de dónde sacar) avanzan con módulo: `i = (i + 1) % b.length`. Al llegar al final vuelven a 0, así se reutilizan los lugares y las piezas salen en orden FIFO.

**¿Qué hacen `start()` y `join()`?**
`start()` crea el hilo y lo pone a correr en paralelo (es el *cobegin*); no confundir con `run()`, que lo ejecutaría en el hilo actual. `join()` espera a que el hilo termine (el *coend*). Sin `join()`, `main` imprimiría "Fin" antes de que terminen los demás.

**¿Para qué está `InterruptedException`?**
`wait()` y `sleep()` pueden ser interrumpidos desde otro hilo. En el `catch` volvemos a marcar la interrupción con `Thread.currentThread().interrupt()` para no perderla.

**¿Por qué Java y no otro lenguaje?**
Tiene hilos reales y los monitores incluidos en el lenguaje (`synchronized`, `wait`, `notify`), además de `Semaphore` en `java.util.concurrent`. Es lo más cercano a lo que vimos en teoría.

**¿Cómo harían varias condiciones con nombre, como en Pascal-FC?**
Con `ReentrantLock` y `Condition` (de `java.util.concurrent.locks`): `lock.newCondition()` crea una variable de condición por cada motivo de espera, con `await()` y `signal()`. Así se podría usar `signal()` en lugar de `signalAll()`. Para estos problemas, `synchronized` alcanza y es más simple.

---

## 9. Guion sugerido para los 20 minutos

| Minutos | Qué | Apoyo |
|---|---|---|
| 0–2 | Presentación y conceptos: productor-consumidor, exclusión mutua, monitor | [Sección 2](#2-conceptos-que-hay-que-saber) |
| 2–5 | Monitores en Java: `synchronized`, `wait`, `notifyAll`, `while` | [Sección 3](#3-monitores-en-java) |
| 5–9 | Problema resuelto (bicicletas): enunciado, pseudocódigo, código | [Sección 4](#4-problema-resuelto-fábrica-de-bicicletas) |
| 9–10 | Demo: `java FabricaBicicletas.java` en vivo y la animación con el montador en *muy lento* | `bicicletas/` |
| 10–14 | Problema propuesto (jerseys): enunciado, pseudocódigo, código | [Sección 5](#5-problema-propuesto-taller-de-jerseys) |
| 14–16 | Demo: `java TallerJerseys.java` en vivo y la animación; mostrar el `while` (líneas "espera" repetidas) | `jersey/` |
| 16–17 | Monitor contra semáforos | [Sección 6](#6-monitor-contra-semáforos) |
| 17–20 | Preguntas | [Sección 8](#8-preguntas-probables-y-cómo-responderlas) |

Para la demo, conviene tener abiertas de antemano dos terminales (una por carpeta) y las dos animaciones en pestañas del navegador, con el zoom al 100 % (`Ctrl + 0`).
