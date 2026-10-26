// Tema propuesto 13 (pág. 273, ejercicio 6): taller de jerseys, resuelto con un MONITOR.
//
// Tres personas trabajan en el taller:
//   - la costurera fabrica mangas y las deja en el cesto de mangas,
//   - otra persona fabrica cuerpos y los deja en el cesto de cuerpos,
//   - el ensamblador toma 2 mangas y 1 cuerpo y arma un jersey.
//
// Los dos cestos están dentro del monitor Taller. En Java, una clase con métodos
// synchronized es un monitor: un solo hilo a la vez puede estar ejecutando
// cualquiera de esos métodos. wait() deja al hilo esperando y libera el monitor;
// notifyAll() despierta a los que esperan para que vuelvan a revisar su condición.
//
// Para ejecutarlo:  java TallerJerseys.java
import java.util.Random;

public class TallerJerseys {

    static final int NUM_MAX_MANGAS = 5;   // capacidad del cesto de mangas
    static final int NUM_MAX_CUERPOS = 3;  // capacidad del cesto de cuerpos
    static final int NUM_JERSEYS = 6;      // jerseys a fabricar para que el programa termine

    static final Random azar = new Random();

    // Simula el tiempo que lleva una tarea: entre minMs y maxMs milisegundos.
    static void trabajar(int minMs, int maxMs) throws InterruptedException {
        Thread.sleep(minMs + azar.nextInt(maxMs - minMs + 1));
    }

    public static void main(String[] args) throws InterruptedException {
        Taller taller = new Taller();

        // La costurera y el fabricante de cuerpos son más rápidos que el ensamblador,
        // así los cestos se llenan y se ve que los productores esperan.
        Thread costurera = new Thread(() -> {
            try {
                for (int i = 1; i <= 2 * NUM_JERSEYS; i++) {
                    trabajar(0, 50);
                    System.out.println("costurera termina la manga " + i);
                    taller.dejarManga();
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });

        Thread fabricanteCuerpos = new Thread(() -> {
            try {
                for (int i = 1; i <= NUM_JERSEYS; i++) {
                    trabajar(0, 50);
                    System.out.println("fabricante termina el cuerpo " + i);
                    taller.dejarCuerpo();
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });

        Thread ensamblador = new Thread(() -> {
            try {
                for (int j = 1; j <= NUM_JERSEYS; j++) {
                    taller.tomarPiezas();  // espera a que haya 2 mangas y 1 cuerpo
                    trabajar(100, 200);
                    System.out.println("ensamblador termina el jersey " + j);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });

        // cobegin
        costurera.start();
        fabricanteCuerpos.start();
        ensamblador.start();
        // coend
        costurera.join();
        fabricanteCuerpos.join();
        ensamblador.join();
        System.out.println("Fin: se fabricaron " + NUM_JERSEYS + " jerseys");
    }
}

// El monitor: los dos cestos y las operaciones sobre ellos.
// Las condiciones se revisan con while y no con if: cuando un hilo despierta
// de wait(), otro pudo haber cambiado el estado antes de que vuelva a entrar
// al monitor, así que tiene que volver a comprobar.
class Taller {
    private int mangas = 0;   // mangas en el cesto
    private int cuerpos = 0;  // cuerpos en el cesto

    // Costurera: deja una manga; espera si el cesto de mangas está lleno.
    synchronized void dejarManga() throws InterruptedException {
        while (mangas == TallerJerseys.NUM_MAX_MANGAS) {
            System.out.println("    cesto de mangas lleno: costurera espera");
            wait();
        }
        mangas++;
        System.out.println("    cesto de mangas recibe 1, hay " + mangas + "/" + TallerJerseys.NUM_MAX_MANGAS);
        notifyAll();  // puede que el ensamblador esté esperando piezas
    }

    // Fabricante: deja un cuerpo; espera si el cesto de cuerpos está lleno.
    synchronized void dejarCuerpo() throws InterruptedException {
        while (cuerpos == TallerJerseys.NUM_MAX_CUERPOS) {
            System.out.println("    cesto de cuerpos lleno: fabricante espera");
            wait();
        }
        cuerpos++;
        System.out.println("    cesto de cuerpos recibe 1, hay " + cuerpos + "/" + TallerJerseys.NUM_MAX_CUERPOS);
        notifyAll();
    }

    // Ensamblador: toma 2 mangas y 1 cuerpo juntos; espera hasta que estén todas.
    // Como toma las 3 piezas en una sola operación del monitor, nunca se queda
    // con piezas a medias.
    synchronized void tomarPiezas() throws InterruptedException {
        while (mangas < 2 || cuerpos < 1) {
            System.out.println("    faltan piezas (mangas " + mangas + ", cuerpos " + cuerpos + "): ensamblador espera");
            wait();
        }
        mangas -= 2;
        cuerpos -= 1;
        System.out.println("    el ensamblador se lleva 2 mangas y 1 cuerpo, quedan mangas " + mangas + ", cuerpos " + cuerpos);
        notifyAll();  // ahora hay lugar en los cestos: pueden seguir la costurera y el fabricante
    }
}
