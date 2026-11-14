# Sams

Simulador de vida al estilo de Los Sims, pensado para jugarse en el móvil.
Es una PWA: funciona en el navegador, se instala en la pantalla de inicio
("Añadir a pantalla de inicio") y funciona sin conexión.

## Cómo jugar

- La partida no termina nunca. El tiempo avanza solo; arriba puedes pausar o acelerar (×1, ×3, ×8).
- Controlas a **un miembro de tu familia cada vez**, incluidas las mascotas. Toca su retrato abajo para cambiar.
- **Toca algo de la casa** (nevera, cama, otra persona, el perro…) para ver qué puede hacer el personaje activo.
  Toca el suelo para que camine hasta allí.
- Las órdenes se ponen en cola; puedes cancelarlas con la ✕.
- Los demás miembros de la familia actúan solos según sus necesidades.
- El rombo verde marca al personaje activo. Un ❗ sobre la cabeza indica una necesidad urgente.
- Si alguien no va al baño a tiempo, habrá un charco que limpiar; si no duerme, se desplomará.
- Tócate a ti mismo (al personaje activo) para ver lo que puede hacer por su cuenta: la siesta del gato,
  la danza de guerra del hurón, el chillido de la cobaya…

## Mascotas

Se adoptan en la protectora desde el **ordenador** de casa (máximo 8 miembros en la familia).

| | Precio | Cómo es |
|---|---|---|
| 🐕 Perro | §150 | Hay que sacarlo a pasear y bañarlo; juega con la pelota y hace pis en el árbol del jardín |
| 🐈 Gato | §120 | Usa el arenero (hay que limpiarlo), afila las uñas en el rascador… o en el sofá. A veces no quiere mimos |
| 🐹 Cobaya | §40 | Vive en su jaula: hay que ponerle heno y limpiarla. Chilla para que alguien vaya a hacerle caso |
| 🦦 Hurón | §90 | Duerme muchísimo en su hamaca, roba la pelota y las zapatillas y las esconde, y tiene ataques de "danza de guerra" |
| 🦫 Capibara | §300 | Vive en el jardín, necesita bañarse en el estanque y es tan tranquila que relaja a todos los que están cerca |

(No hay emojis de cobaya, hurón ni capibara: en el juego están dibujados a mano.)
- Todos envejecen un día por cada día de juego.
- La partida se guarda sola. Desde el menú ☰ puedes exportarla o importarla como archivo.

## Desarrollo

```bash
npm install
npm run dev       # servidor de desarrollo (abre la URL "Network" desde el móvil en la misma wifi)
npm test          # pruebas de la simulación
npm run build     # versión de producción en dist/
npm run preview   # sirve dist/ para probar la PWA
npm run icons     # regenera los PNG del icono desde public/icon.svg
```

La carpeta `dist/` se puede subir a cualquier hosting estático (GitHub Pages, Netlify…).
Para instalarla como app hace falta HTTPS.

## Estructura

```
src/
  sim/      Simulación pura, sin gráficos (se puede probar sin navegador)
    world.ts        Reloj, agentes, tareas, necesidades, envejecimiento
    ai.ts           Autonomía por utilidad: los objetos "anuncian" lo que ofrecen
    pathfinding.ts  A* en cuadrícula
    types.ts        Estado del juego (JSON puro, se guarda tal cual)
  data/     Contenido: especies, acciones, objetos y la parcela
  render/   Dibujado isométrico con Phaser
  ui/       Interfaz HTML (paneles, menú de acciones, retratos)
  save/     Guardado en IndexedDB, exportar/importar y migraciones
tests/      Pruebas de la simulación (Vitest)
```

Para añadir un objeto nuevo basta con definirlo en `src/data/objects.ts` y sus
acciones en `src/data/actions.ts`: la IA lo usará automáticamente.

## Hoja de ruta

1. ✅ **MVP**: casa con 2 personas y un perro, 6 necesidades, autonomía, control de un personaje cada vez, guardado.
2. ✅ Gatos, cobayas, hurones y capibaras, con sus objetos (rascador, jaula, estanque…) y la protectora.
3. Barrio con 10 unidades domésticas (las otras 9 controladas por la IA con simulación resumida), visitas y parque.
4. Relaciones, trabajo y economía.
5. Ciclo de vida completo: etapas, parejas, nacimientos, muertes y herencias.
6. Modo construcción, tienda de muebles y pulido.
