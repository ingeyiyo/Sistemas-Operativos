// Ejercicio resuelto 10.5 (pág. 363): fábrica de bicicletas, resuelto con MONITORES.
//
// Hay 2 operarios y 1 montador:
//   - un operario fabrica ruedas y las deja en el almacén de ruedas (capacidad 10),
//   - el otro fabrica marcos y los deja en el almacén de marcos (capacidad 4),
//   - el montador toma 2 ruedas y 1 marco y monta una bicicleta.
//
// Basado en el proyecto FabricaBicicletas del drive (clases Buffer, Operario y
// Montador), pero con Buffer convertido en monitor: métodos synchronized con
// wait() y notifyAll() en lugar de los semáforos hayEspacio / hayDatos / mutex.
//
// Para ejecutarlo:  java FabricaBicicletas.java
import java.util.Random;

public class FabricaBicicletas {

    static final int NUM_MAX_RUEDAS = 10;  // capacidad del almacén de ruedas
    static final int NUM_MAX_MARCOS = 4;   // capacidad del almacén de marcos
    static final int NUM_BICIS = 6;        // bicicletas a fabricar para que el programa termine

    static final Random azar = new Random();

    // Simula el tiempo que lleva una tarea: entre minMs y maxMs milisegundos.
    static void trabajar(int minMs, int maxMs) throws InterruptedException {
        Thread.sleep(minMs + azar.nextInt(maxMs - minMs + 1));
    }

    public static void main(String[] args) throws InterruptedException {
        Buffer ruedas = new Buffer("ruedas", NUM_MAX_RUEDAS);
        Buffer marcos = new Buffer("marcos", NUM_MAX_MARCOS);

        // Cada bici lleva 2 ruedas y 1 marco: se fabrican exactamente las que hacen falta.
        Operario operarioRuedas = new Operario("operario de ruedas", "la rueda", ruedas, 2 * NUM_BICIS);
        Operario operarioMarcos = new Operario("operario de marcos", "el marco", marcos, NUM_BICIS);
        Montador montador = new Montador(ruedas, marcos, NUM_BICIS);

        // cobegin
        operarioRuedas.start();
        operarioMarcos.start();
        montador.start();
        // coend
        operarioRuedas.join();
        operarioMarcos.join();
        montador.join();
        System.out.println("Fin: se fabricaron " + NUM_BICIS + " bicicletas");
    }
}

// Un almacén de capacidad limitada, hecho monitor.
// El arreglo circular (i para poner, j para extraer) es el del Buffer original;
// "cantidad" reemplaza a los semáforos: dice cuántas piezas hay ahora.
// Las condiciones van con while y no con if: al despertar de wait(), otro hilo
// pudo haber cambiado el almacén antes de que este vuelva a entrar.
class Buffer {
    private final String nombre;
    private final int[] b;    // piezas guardadas (cada una es su número de pieza)
    private int i = 0;        // próximo lugar donde poner
    private int j = 0;        // próximo lugar de donde extraer
    private int cantidad = 0; // piezas en el almacén

    Buffer(String nombre, int capacidad) {
        this.nombre = nombre;
        this.b = new int[capacidad];
    }

    // Operario: deja una pieza; espera si el almacén está lleno.
    synchronized void poner(int pieza, String quien) throws InterruptedException {
        while (cantidad == b.length) {
            System.out.println("    almacén de " + nombre + " lleno: " + quien + " espera");
            wait();
        }
        b[i] = pieza;
        i = (i + 1) % b.length;
        cantidad++;
        System.out.println("    almacén de " + nombre + " recibe 1, hay " + cantidad + "/" + b.length);
        notifyAll();  // puede que el montador esté esperando piezas
    }

    // Montador: se lleva "n" piezas juntas; espera hasta que estén todas.
    // Como las saca en una sola llamada al monitor, nadie puede meterse a la mitad.
    synchronized int[] extraer(int n) throws InterruptedException {
        while (cantidad < n) {
            System.out.println("    faltan " + nombre + " (hay " + cantidad + ", necesita " + n + "): montador espera");
            wait();
        }
        int[] piezas = new int[n];
        for (int k = 0; k < n; k++) {
            piezas[k] = b[j];
            j = (j + 1) % b.length;
        }
        cantidad -= n;
        System.out.println("    almacén de " + nombre + " entrega " + n + ", hay " + cantidad + "/" + b.length);
        notifyAll();  // ahora hay lugar: el operario puede seguir
        return piezas;
    }
}

// Fabrica piezas y las deja en su almacén.
class Operario extends Thread {
    private final String quien;
    private final String pieza;
    private final Buffer almacen;
    private final int cantidad;

    Operario(String quien, String pieza, Buffer almacen, int cantidad) {
        this.quien = quien;
        this.pieza = pieza;
        this.almacen = almacen;
        this.cantidad = cantidad;
    }

    @Override
    public void run() {
        try {
            for (int n = 1; n <= cantidad; n++) {
                FabricaBicicletas.trabajar(0, 50);  // los operarios son más rápidos que el montador
                System.out.println(quien + " termina " + pieza + " " + n);
                almacen.poner(n, quien);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}

// Toma 2 ruedas y 1 marco y monta cada bicicleta.
class Montador extends Thread {
    private final Buffer ruedas;
    private final Buffer marcos;
    private final int bicis;

    Montador(Buffer ruedas, Buffer marcos, int bicis) {
        this.ruedas = ruedas;
        this.marcos = marcos;
        this.bicis = bicis;
    }

    @Override
    public void run() {
        try {
            for (int n = 1; n <= bicis; n++) {
                int[] r = ruedas.extraer(2);  // las 2 ruedas juntas
                int[] m = marcos.extraer(1);
                FabricaBicicletas.trabajar(100, 200);
                System.out.println("montador termina la bici " + n
                        + " (ruedas " + r[0] + " y " + r[1] + ", marco " + m[0] + ")");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
