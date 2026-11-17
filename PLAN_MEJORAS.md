# Plan de mejoras de Sams

Plan pensado para pasárselo a otra sesión de trabajo (persona o IA). Cada tarea dice **por qué** se hace,
**qué ficheros** toca, **cómo** abordarla y **cuándo está terminada**. Se escribió sobre el commit `81e00a6`
("Diálogos con más profundidad y casi sin repeticiones"); las fases 1 a 3 y parte de la 4 ya están hechas
(PR #2, en `main`). Las descripciones de las tareas hechas se dejan como estaban, como referencia: lo que
cambió al hacerlas está en la columna «Notas».

## Estado (16-11-2026)

| Tarea | Estado | Notas |
|---|---|---|
| 1.1 Partir `world.ts` | ✅ | 919 líneas + 17 sistemas en `src/sim/systems/`; misma simulación bit a bit con la misma semilla |
| 1.2 Partir `hud.ts` + `innerHTML` | ✅ | 165 líneas + un fichero por panel; partidas validadas al cargar (`save/validate.ts`) y prueba de inyección |
| 1.3 Aligerar el bundle | ✅ | Phaser y contenido aparte; código propio 166 kB (más 20 kB de sonido, que se carga después); pantalla de carga; PWA offline probada. No se cargan paneles con `import()` (ahorraría ~20 kB: no compensa) |
| 1.4 Pruebas | ✅ | Migraciones v1→actual, 8 semanas, e2e con Playwright en CI (también en cada PR) |
| 1.5 Rendimiento | ✅ | `?debug`; cifras en «Mediciones» |
| 2.1 Tutorial guiado | ✅ | Comprar va antes que ir al parque (solo se construye en casa) |
| 2.2 Avisos con prioridad | ✅ | |
| 2.3 Controles táctiles | ✅ | El zoom y el arrastre ya existían; añadido 🎯, pulsación larga y zonas de 44 px |
| 2.4 Agenda | ✅ | SAVE_VERSION 11 (órdenes programadas y registro de movimientos) |
| 2.5 Accesibilidad | ✅ | |
| 3 Sonido | ✅ | Todo sintetizado (sin ficheros); voz del metro con `speechSynthesis` |
| 4.1 Economía | ✅ | Ver «Economía» al final. Las vacaciones de fin de semana, hechas con 4.2 |
| 4.4 Logros y retos | ✅ | 15 logros y 3 retos; generaciones contadas desde la familia fundadora |
| 4.5 Construcción | ✅ | Girar (trasponiendo el dibujo isométrico), deshacer en la sesión de obra, pintura por habitación y dos plantillas por reforma. SAVE_VERSION 12 |
| 4.3 Historias del barrio | ✅ | Tres culebrones (lío, guerra de vecinos, romance con boda), mediar y chivarse; se ven en el salseo. Dentro de la versión 12 (`arcs`) |
| 4.2 Carreras y negocio | ✅ | Opciones de dilema con habilidad o rasgo, teletrabajo (oficina y ciencia), decisiones semanales del bar. Más el fin de semana fuera que quedó de 4.1 |
| 5.1 Crear tu familia | ✅ | Creador al empezar y desde ☰ → Nueva partida; García como opción rápida. SAVE_VERSION 13 (`look` de cada persona) |
| 5.2 Fiestas nuevas | ✅ | Reyes, Carnaval y Halloween en `systems/holidays.ts` (fechas en `holidayOf`, que lee también la agenda). Sin cambios en lo que se guarda |
| 5.3 Álbum de fotos | ✅ | Base de IndexedDB aparte (`sams-album`): no toca la partida ni su versión. Fotos automáticas con el evento `moment` |
| 5.4 Sitios nuevos | ✅ | Biblioteca, gimnasio y mercadillo (`systems/places.ts`), con horarios, regateo y vecinos que van. SAVE_VERSION 14 (las tres parcelas) |
| 5.5 Tercer barrio | ✅ | Getafe (MetroSur): Cerro de los Ángeles, club de pádel y tres casas. Barrios generalizados (`squareOf`, `stationOf`, mapa por distritos). SAVE_VERSION 15 |

**Lo siguiente:** la fase 5 está completa, y también los encargos de después (ver «Encargos de la jefa de desarrollo»). La partida va por la **versión 18**: si algo nuevo cambia lo que se guarda, toca la 19 con su migración.

---

## 0. Contexto para quien retome esto

### Qué es el proyecto
- Simulador de vida estilo Los Sims, para móvil, en español (castizo madrileño). PWA publicada en GitHub Pages:
  https://ivan5cg.github.io/Sams/
- Stack: **TypeScript 5.8 + Vite 6 + Phaser 3.90 + vite-plugin-pwa + Vitest 3**. Sin framework de UI: la
  interfaz es HTML/CSS a mano en `src/ui/`.
- El `README.md` describe todas las funcionalidades actuales con detalle: léelo antes de tocar nada.

### Arquitectura (actual)
```
src/
  main.ts            Arranque: carga partida, crea World, Hud y Phaser; carga el sonido después; autoguardado
  prefs.ts           Preferencias del dispositivo (letra, contraste, movimiento, vibración)
  sim/               Simulación pura, sin navegador (se prueba en Node)
    world.ts         ~920 líneas: estado, consultas, avisos, bucle de simulación y fachada de los sistemas
    systems/         Un fichero por sistema (funciones que reciben el mundo): tasks, checks, jobs, travel,
                     calendar, lifecycle, shopping, build, pets, skills, social, street, gossip, party,
                     body, movement, wishes, money (dinero y cuentas) y feats (logros y retos)
    constants.ts     SAVE_VERSION = 11, minutos por día...      util.ts  clamp, rand, moodScore
    agenda.ts        Lo que viene hoy y mañana (puro)
    ai.ts, types.ts, neighborhood.ts, social.ts, conversation.ts, chatter.ts, phrases.ts, gossip.ts,
    aspirations.ts, wishes.ts, emotions.ts, traits.ts, pathfinding.ts
  data/              Contenido declarativo: objetos, acciones, especies, carreras, economía, logros...
  render/            Phaser isométrico: HouseScene.ts, art.ts, characters.ts, fx.ts, scenery.ts, gfx.ts,
                     iso.ts y perf.ts (mediciones de ?debug)
  ui/                hud.ts (coordinador, ~165 líneas) + un fichero por panel (build, talk, log, tutorial,
                     guide, map, sheet, profile, dilemma, panel, menu, notices, agenda, feats, debug)
                     + dom.ts (utilidades) + styles.css
  audio/             Motor Web Audio, efectos, ambientes y música, todo sintetizado (CREDITOS.md)
  save/              db.ts (IndexedDB), serialize.ts (migraciones) y validate.ts (validar al cargar)
tests/               Un fichero por área (Vitest), migraciones, 8 semanas de juego, helpers.ts
  e2e/               Playwright a 390×844: humo, paneles, offline, inyección, tutorial, sonido, avisos,
                     táctil, agenda, accesibilidad y logros
```

### Estado medido (16-11-2026, al terminar el PR #2)
- `npm test`: **157 pruebas**, todas pasan (~15 s). `npm run test:e2e` (tras `npm run build`): **18**, ~30 s.
- `tsc --noEmit`: sin errores.
- `vite build`: Phaser 1.482 kB (aparte, cacheado), código propio 166 kB, contenido 242 kB, sonido 20 kB
  (después del arranque), panel de `?debug` 2 kB (solo si se pide).
- CI: `deploy.yml` (push a `main`: pruebas, build, e2e y Pages) y `ci.yml` (lo mismo en cada PR, sin publicar).
- Las simulaciones de varios días tardan el doble en CI que en local: el límite de las pruebas es de 20 s.

### Reglas de trabajo para la siguiente sesión
1. **Nada de cambiar el comportamiento del juego en las tareas de refactor** (Fase 1). Si una prueba falla
   tras un refactor, el refactor está mal, no la prueba.
2. Después de cada tarea: `npm test`, `npx tsc --noEmit`, `npm run build` y `npm run test:e2e` deben pasar.
3. **Cualquier cambio en `types.ts` que afecte a lo que se guarda exige subir `SAVE_VERSION` y añadir una
   migración** en `src/save/serialize.ts` (`MIGRATIONS[n]`), con prueba que cargue una partida de la versión
   anterior.
4. Textos de juego en español, con el tono del juego (castizo, con humor). Los comentarios de código también
   están en español: mantenerlo.
5. Commits pequeños, uno por tarea, con mensaje en español en el estilo del historial
   (p. ej. "Partir world.ts: economía y compras a su módulo").
6. Actualizar el `README.md` cuando cambie algo que el jugador nota.
7. El juego se juega en **móvil vertical**: probar siempre a ~390×844 (Playwright con `devices['iPhone 13']`).

---

## Fase 1 — Base técnica ✅

Objetivo: que el código sea más fácil de ampliar y que el juego arranque más rápido. El jugador no debería
notar nada salvo la carga.

### 1.1 Partir `src/sim/world.ts` en sistemas ✅
**Por qué:** 3.630 líneas en una clase hacen que cada cambio sea lento y arriesgado, y que dos tareas en
paralelo choquen siempre en el mismo fichero.

**Cómo:** el fichero ya está dividido en secciones con comentarios `// ----`. Extraer cada sección a
`src/sim/systems/<nombre>.ts`. Patrón recomendado: funciones que reciben el `World` (o una interfaz mínima
`WorldCtx` con lo que necesitan) y operan sobre `world.state`. `World` sigue existiendo como fachada y conserva
sus métodos públicos (delegando), para no tocar `hud.ts`, `HouseScene.ts` ni las pruebas.

Reparto propuesto (líneas aproximadas del `world.ts` actual):

| Módulo nuevo | Contenido (métodos actuales) |
|---|---|
| `systems/wishes.ts` | `wishEvent`, `pursueWish`, `onTalkTurn` (167-260) |
| `systems/queries.ts` | `householdOf`, `lotById`, `layoutOf`, `gridOf`, `agent`, `object`, `objectsIn`, `agentsIn`, `objectAt`, `usersOf`, `residentOf`, `isActive`, `isGuest`... (309-500) |
| `systems/checks.ts` | `stageOf`, `checkObjectAction`, `checkSocialAction`, `checkSelfAction`, `optionsFor` (509-706) |
| `systems/skills.ts` | `skillLevel`, `practice`, `skillPayoff` |
| `systems/pets.ts` | `canAdopt`, `adopt`, `freeHabitat`, `favoriteOf`, `trainPet`, `petGreeting`, `neighbourAdopts` |
| `systems/travel.ts` | `canTravel`, `travel`, `districtOf`, `needsMetro`, `startTravel`, `arrive`, `invite`, visitas, `goHome` (764-925) |
| `systems/jobs.ts` | `setJob`, `fire`, `quitJob`, `checkShift`, `finishShift`, dilemas (`maybeDilemma`, `resolveDilemma`) (972-1276) |
| `systems/calendar.ts` | `seasonalDay`, `eventsHour`, `lotteryDraw`, `hasEvent`, `activeEvents`, `startEvent`, `dailyEvents`, `newDay` |
| `systems/lifecycle.ts` | `moveIn`, `births`, `onStageChange`, `deathChance`, `die`, `placeGrave`, `inherit`, `replaceFamily`, `continueWith`, `inheritTraits`, `evolveTraits`, `pickTrait` (1283-1545, 2787-2838) |
| `systems/shopping.ts` | `pantryOwner`, `closedReason`, `closingTime`, `shopping`, `checkDelivery`, `onArriveShopping`, `groceryErrand` (1570-1672) |
| `systems/build.ts` | `canBuildHere`, `canPlace`, `buy`, `nextExpansion`, `expandHouse`, `moveObject`, `sellObject`, `decorAround` (1682-1853) |
| `systems/tasks.ts` | `beginTask`, `endTask`, `completeTask`, `runTask`, `applyEffects`, `isSatisfied`, comportamientos especiales (2302-2566) |
| `systems/social.ts` | `canEngage`, `walkToAgent`, `accepts`, `remember`, `grudge`, `taskFeelings`, `socialFeelings`, `socialOutcome`, `jealousy` |
| `systems/street.ts` | gente de la calle, rap, Glovo, campaña (2904-3196) |
| `systems/gossip.ts` | salseo e infidelidad (3200-3314) |
| `systems/body.ts` | pedos y alcohol (3318-3403) |
| `systems/party.ts` | `startParty`, `partyHour` |
| `systems/movement.ts` | `face`, `moveAlong`, `neighbours`, `interactTiles`, `bestPath` |

El bucle (`tick`, `step`, `stepAgent`, `hourly`, `abstractHour`, `passiveDecay`, `idle`, `checkFailures`...) se
queda en `world.ts`, que debería quedar por debajo de ~800 líneas.

**Orden:** de lo más aislado a lo más acoplado: movement → body → street → gossip → party → shopping →
build → pets → skills → jobs → calendar → lifecycle → social → tasks. Un commit por módulo, pruebas en verde
en cada uno.

**Hecho cuando:** `world.ts` < 1.000 líneas, ningún módulo > 500, las 119 pruebas pasan sin cambiarlas, y una
partida guardada antes del refactor carga igual.

### 1.2 Partir `src/ui/hud.ts` en componentes ✅
**Por qué:** mismo problema que `world.ts`, y el HUD es lo que más se toca al añadir funcionalidades.

**Cómo:** `src/ui/` con un fichero por panel: `toasts.ts`, `build.ts` (modo construcción, 400-500),
`talk.ts` (conversar, ~580), `log.ts` (diario y salseo, ~620-642), `tutorial.ts`, `map.ts` (~690-850),
`sheet.ts` (menú de acciones, ~927-1000), `profile.ts` (~1062), `dilemma.ts` (~1110), `panel.ts`
(retratos, necesidades, emociones, deseos y cola, ~1230-1310). Utilidades comunes (`$`, `esc`, plantillas)
a `src/ui/dom.ts`. `Hud` queda como coordinador.

**Además, revisión de seguridad de `innerHTML`:** comprobar en cada uno de los ~27 usos que todo texto que
pueda venir del jugador o de una partida importada (nombres de personajes, familias, mascotas, ficheros
importados) pasa por `esc()`. Ojo con atributos (`title="${...}"`, p. ej. `hud.ts:1240` con `md.label`): `esc`
debe escapar también `"` y `'`. Añadir una prueba que importe una partida con un nombre tipo
`<img src=x onerror=alert(1)>` y compruebe que no se crea ningún elemento.

**Hecho cuando:** `hud.ts` < 300 líneas, mismo comportamiento visual, y la prueba de inyección pasa.

### 1.3 Aligerar el bundle y la carga inicial ✅
**Por qué:** 1,85 MB en un solo fichero es mucho para un móvil con mala cobertura, y cada despliegue obliga a
bajarlo entero otra vez aunque solo cambie una frase.

**Cómo:**
1. En `vite.config.ts`, `build.rollupOptions.output.manualChunks`: separar `phaser` en su propio chunk (casi
   nunca cambia, así queda en caché entre versiones) y los datos de contenido (`src/data/*`, `phrases.ts`) en
   otro.
2. Cargar con `import()` dinámico lo que no hace falta al arrancar: el pipeline WebGL de `render/gfx.ts`
   (solo si el jugador eligió "Avanzados"), los paneles grandes del HUD (construcción, perfil, mapa) y
   los textos del tutorial.
3. Pantalla de carga ligera en `index.html` (HTML+CSS puro, sin JS) mientras baja Phaser.
4. Volver a bajar `chunkSizeWarningLimit` a un valor razonable (p. ej. 1.200) una vez separado Phaser
   (Phaser solo pesa ~1,1 MB).
5. Comprobar que la PWA sigue funcionando sin conexión con los chunks nuevos (`npm run preview`, cargar,
   quitar red, recargar).

**Hecho cuando:** el chunk de código propio del juego (sin Phaser) < 500 kB, y la PWA funciona offline.

### 1.4 Pruebas que faltan ✅
1. **Migraciones:** ya hay pruebas sueltas (`sim.test.ts:203`, `:320`, `:363`, `:655`). Añadir una por cada
   versión de guardado de 1 a 9: generar con `oldSave(n)` (ya existe un helper) y comprobar que
   `migrate()` llega a `SAVE_VERSION` y que `new World(...)` simula un día entero sin lanzar errores.
2. **Resistencia a largo plazo:** simular 8 semanas de juego (todas las estaciones, Navidad, elecciones) a
   velocidad máxima, sin renderizado, comprobando invariantes: ningún `NaN` en necesidades ni dinero, ningún
   agente fuera de su parcela o en una casilla de pared, nadie con tareas colgadas más de X horas, número de
   familias = 10 en Madrid.
3. **Prueba de humo en navegador (Playwright):** `tests/e2e/smoke.spec.ts` que abre `npm run preview`, cierra el
   tutorial, toca la nevera, elige una acción, abre el mapa, viaja al parque, abre el menú ☰ y guarda. Sin
   errores en consola. Añadirla al workflow de CI (Chromium ya está instalado en el entorno de Claude Code; en
   GitHub Actions hará falta `npx playwright install --with-deps chromium`). Pasar `--trace off`.
4. Separar `tests/sim.test.ts` (1.837 líneas) por sistema, siguiendo los módulos de 1.1.

**Hecho cuando:** la CI ejecuta pruebas unitarias + smoke y todo está en verde.

### 1.5 Medir el rendimiento ✅
**Cómo:** modo debug activable con `?debug` en la URL que muestre FPS, milisegundos por `world.tick` y por
frame de render, número de agentes simulados al detalle y memoria (si `performance.memory` existe). Guardar
en el diario de desarrollo cuánto tarda simular un día a ×8.

**Hecho cuando:** existe el overlay y hay cifras de referencia anotadas en este fichero (sección "Mediciones",
al final), para poder comparar después de cada fase.

---

## Fase 2 — Que se entienda y se juegue mejor

### 2.1 Tutorial guiado (sustituye las 5 diapositivas actuales) ✅
**Por qué:** el tutorial actual explica pero no enseña haciendo; un jugador nuevo no sabe qué hacer después.

**Cómo:** convertir `showTutorial` en una lista de **pasos con objetivo**, cada uno con un texto corto, un
resaltado (flecha o halo sobre el botón u objeto) y una condición que lo da por cumplido observando el
mundo:
1. "Toca la nevera" → se abre el menú de acciones sobre una nevera.
2. "Haz que Lucía coma algo" → empieza una tarea de comer.
3. "Cambia a Toby tocando su retrato" → `setActive` a una mascota.
4. "Busca trabajo en el ordenador" → `setJob`.
5. "Abre el mapa y ve al parque" → `travel` al parque.
6. "Compra algo en 🔨" → `buy`.
- El tiempo no se para (salvo en el primer paso); se puede saltar en cualquier momento; se recuerda el paso
  en `localStorage` (clave nueva, `sams:tutorial2`) dentro de `try/catch`, como ya se hace.
- El tutorial antiguo sigue disponible en ☰ → ❓ como "Cómo se juega" (consulta rápida).

**Hecho cuando:** un jugador nuevo completa los 6 pasos sin leer el README; prueba de Playwright que los
recorre.

### 2.2 Avisos con prioridad y bandeja ✅
**Por qué:** con el barrio, el salseo, la calle y los eventos hay muchos toasts y los importantes se pierden.

**Cómo:**
- Clasificar cada `toast()` en tres niveles: **urgente** (bebé llorando, alguien a punto de desmayarse o
  morir de hambre, fuego/charco, dilema), **familia** (sueldo, ascenso, facturas, nevera vacía, nacimiento) y
  **barrio** (noticias, salseo, calle).
- Urgentes: se quedan fijos hasta tocarlos y tocan para ir al personaje afectado. Familia: toast normal.
  Barrio: no salen como toast, se acumulan en una bandeja 🔔 con contador (y siguen en el Diario).
- Agrupar repetidos ("3 noticias del barrio").

**Hecho cuando:** en una hora de juego a ×3 en el barrio no salen más de ~5 toasts no urgentes.

### 2.3 Controles táctiles ✅
- **Pellizcar para hacer zoom** y **arrastrar para mover la cámara** en `HouseScene` (ahora la cámara sigue al
  activo; al arrastrar se desengancha y un botón 🎯 la vuelve a enganchar).
- Zonas táctiles mínimas de 44×44 px en todos los botones (revisar `styles.css`: `.icon-btn`, chips del menú de
  acciones, deseos, cola).
- Vibración corta (`navigator.vibrate`, si existe) en avisos urgentes y al confirmar compras; opción para
  quitarla.
- Pulsación larga sobre un personaje = abrir su perfil.

**Hecho cuando:** todo se puede hacer con una mano en un móvil de 390 px de ancho.

### 2.4 Agenda de la familia ✅
- Panel 📅 con lo que viene hoy y mañana: turnos de trabajo, colegio, eventos del barrio (verbena, derbi,
  San Isidro, lotería), facturas del lunes, cumpleaños (cambios de etapa) y bebés por nacer.
- Poder **programar una orden a una hora** ("a las 20:00, Mateo cocina") reutilizando la cola de órdenes.
  Esto toca el estado: subir `SAVE_VERSION` y migrar.

### 2.5 Accesibilidad y ajustes ✅
- Ajustes nuevos en ☰: tamaño de letra (normal/grande), alto contraste, reducir movimiento (quita el
  parpadeo, las partículas y el temblor de cámara), vibración on/off.
- Emociones y necesidades: no depender solo del color (añadir icono o signo + / −).
- Respetar `prefers-reduced-motion` por defecto.
- Guardar los ajustes en `localStorage` con `try/catch` (son preferencias de este dispositivo, no de la partida).

---

## Fase 3 — Sonido ✅

**Por qué:** es lo que más se echa de menos para que el juego tenga vida; está todo pensado para ser visual.

### 3.1 Motor de audio ✅
- `src/audio/` con un gestor propio sobre **Web Audio API** (sin Phaser Sound, para no atarlo a la escena):
  canales `sfx`, `ambiente` y `música`, volumen por canal, silencio global, y desbloqueo con el primer toque
  (iOS/Android lo exigen).
- Pausar todo con `visibilitychange` (pantalla apagada o app en segundo plano) para no gastar batería.
- Cargar el audio de forma perezosa (después del arranque), con formato **.ogg + .m4a** (Safari no lee ogg)
  o generarlo por código.
- Licencias: solo sonidos propios, generados por código o con licencia CC0. Anotar el origen de cada fichero
  en `public/audio/CREDITOS.md`.

### 3.2 Efectos ✅
Enganchar a eventos que ya existen en la simulación (añadir un emisor de eventos en `World` si hace falta,
en vez de que el audio lea el estado cada frame):
- Interfaz: tocar, abrir/cerrar panel, comprar, vender, error.
- Casa: pasos, puerta, nevera, sartén, ducha, váter, tele, guitarra, cama.
- Mascotas: ladrido, maullido, chillido de cobaya, "dook" del hurón, capibara.
- Eventos: dinero recibido, ascenso, facturas, bebé llorando, despertador, lotería, fuegos artificiales,
  pedo (imprescindible).
- Volumen según la distancia a la cámara, para no oír la cocina desde el jardín.

### 3.3 Ambiente y música ✅
- Ambiente por sitio y hora: casa (reloj, nevera), parque (pájaros, niños), plaza de Alcorcón (fuente),
  bar Casa Paco (murmullo, tragaperras), metro (traqueteo, "próxima estación"), lluvia, noche (grillos),
  verbena (chotis).
- Música en bucle tranquila de día y de noche, y temas especiales para fiesta, Navidad y San Isidro, con
  fundido entre ellas.

**Hecho cuando:** hay controles de volumen en ☰ → 🔊, el audio se para con la pantalla apagada, y el juego
sigue funcionando igual con el sonido desactivado o si el navegador bloquea el audio.

---

## Fase 4 — Más profundidad en lo que ya hay ✅

### 4.1 Economía equilibrada ✅
**Problema a comprobar primero:** con la prueba larga de 1.4.2, sacar una gráfica del dinero de la familia
del jugador y de 3 vecinos durante 8 semanas. Probablemente se acumula sin límite o se arruinan; decidir con
datos.

**Propuestas:**
- Facturas según la casa (tamaño, muebles de lujo, número de electrodomésticos), no solo por persona.
- Hipoteca o alquiler semanal según la casa (las reformas de §6.000/§12.000 la suben).
- Registro de movimientos (ingresos y gastos por categoría) en el perfil, con el saldo de la semana.
- Sumideros de dinero con sentido: ropa, vacaciones de fin de semana, cursos para subir habilidades,
  regalos.
- Todo con constantes en `src/data/` para poder ajustar sin tocar lógica.

### 4.2 Carreras y negocio ✅
- Trabajo desde casa para algunas carreras (informes en el ordenador que dan rendimiento).
- En los dilemas (`src/data/dilemmas.ts`), una opción extra que solo aparece con habilidad o rasgo
  suficiente ("Con carisma 6: convencer al jefe").
- Bar de tapas: decisiones semanales (carta barata/cara, contratar a un vecino, abrir el domingo) que
  cambian el rango de ganancias.

### 4.3 Historias del barrio que duran varios días ✅
- Encadenar sucesos que ya existen (salseo, parejas, bodas, mudanzas, peleas) en **arcos** de 3-5 pasos con
  estado: p. ej. "rumor de lío → pillados → bronca en el parque → separación → uno se muda". Cada paso genera
  noticias, salseo y conversaciones.
- El jugador puede meterse: contarlo, mediar, chivarse.
- Guardar el estado de los arcos en `WorldState` (subir versión y migrar).

### 4.4 Logros y retos ✅
- Lista de logros (primer ascenso, boda, 5 generaciones, completar una meta de vida, sobrevivir a la Navidad
  sin deudas, adoptar las 5 especies, ganar a la tragaperras, MC Kalimotxo te dedica 3 temas...).
- Retos opcionales que se activan desde ☰ (p. ej. "100 bebés", "vivir sin nevera"). Se ven en el Diario.

### 4.5 Construcción ✅
- Pintar paredes y cambiar suelos por habitación.
- **Girar muebles** (comprobar que `canPlace` y las casillas de interacción respetan la rotación).
- **Deshacer** la última acción del modo construcción (devolver el dinero).
- Ampliaciones con varias plantillas a elegir en lugar de una sola secuencia fija.

---

## Fase 5 — Contenido nuevo (cuando lo anterior esté hecho)
- ✅ **Crear tu familia** al empezar: nombres, rasgos, aspecto (reutilizando los generadores de vecinos) y
  mascota inicial. Mantener "Familia García" como opción rápida.
  *Hecho:* `sim/family.ts` (`FamilySpec`, `GARCIA`, `randomFamily`, `familyProblems`) y `World.createNew(family)`;
  las paletas de aspecto, en `data/looks.ts`; la interfaz, en `ui/creator.ts`. Con la García por defecto, la
  simulación sale idéntica a la de antes (comprobado con semilla). Mientras el creador está abierto no se
  guarda: si se cierra la app sin elegir, al volver se elige otra vez.
- ✅ Sitios nuevos: biblioteca (lógica y deberes), gimnasio, mercadillo del domingo (comprar barato, regatear).
  *Hecho:* parcelas `BI`, `GY` y `MK` en Madrid (`addPlaces`, también en la migración 13 → 14). La rebaja de
  regatear es una emoción (`regateo`, 2 horas), así que se guarda sin campos nuevos. El minimapa tiene una fila más.
- ✅ Fiestas nuevas: Carnaval, Halloween (truco o trato por las casas), Reyes (roscón con haba y cabalgata).
  *Hecho:* el año son 4 semanas, así que Reyes abre la primavera (el lunes; el primer día de la partida no),
  Carnaval es el jueves de primavera y Halloween el viernes de otoño. Acciones que solo existen en su día
  (`HOLIDAY_ACTIONS`: fuera de él ni se ven), disfraces dibujados (antifaz, corona, sombrero de bruja) y frases.
- ✅ **Álbum de fotos**: hacer una captura del canvas (`game.renderer.snapshot`), guardarla en IndexedDB (con
  límite de tamaño) y verla en un álbum por generaciones. Exportable.
  *Hecho:* `render/photo.ts` (captura reducida a 720 px de ancho, JPEG, con pie de foto), `save/album.ts` (60 fotos
  o 12 MB; sin IndexedDB, en memoria) y `ui/album.ts`. Compartir con `navigator.share` si el móvil lo admite.
  De paso: la lluvia y la nieve solo caían en un recuadro del centro con la cámara alejada (se compensa el zoom).
- ✅ Un tercer barrio conectado por metro (seguir el patrón de Alcorcón en `src/data/street.ts` y
  `neighborhood.ts`).
  *Hecho:* Getafe (`addGetafe`, también en la migración 14 → 15), con el pádel como sitio propio. Lo que antes
  distinguía solo Madrid/Alcorcón ahora va por barrio: `squareOf` (dónde se reúne cada barrio), `stationOf`
  (la estación del metro) y el mapa, que lista todos los barrios. Más nombres de vecinos y de mascotas: con
  tanta gente se acababan y salían «Lola 704».

---

## Orden recomendado y tamaño aproximado

| # | Tarea | Esfuerzo | Riesgo | Se nota al jugar |
|---|---|---|---|---|
| 1 | 1.4 Pruebas (migraciones + larga + smoke) | M | Bajo | No, pero protege lo demás |
| 2 | 1.1 Partir `world.ts` | L | Medio | No |
| 3 | 1.3 Aligerar el bundle | S | Bajo | Sí (carga) |
| 4 | 1.2 Partir `hud.ts` + revisión de `innerHTML` | M | Bajo | No |
| 5 | 1.5 Overlay de rendimiento | S | Bajo | No |
| 6 | 2.1 Tutorial guiado | M | Bajo | Mucho |
| 7 | 3.x Sonido | L | Bajo | Mucho |
| 8 | 2.2 Avisos con prioridad | S | Bajo | Sí |
| 9 | 2.3 Controles táctiles | M | Bajo | Sí |
| 10 | 4.1 Economía | M | Medio | Sí |
| 11 | 2.5 Accesibilidad / 2.4 Agenda | M | Bajo | Sí |
| 12 | 4.2–4.5 | L | Medio | Sí |
| 13 | Fase 5 | XL | Medio | Sí |

S = una tarde, M = 1-2 días, L = varios días, XL = semanas.

**Por qué este orden:** las pruebas primero, porque el refactor de `world.ts` sin red de seguridad es
peligroso. El refactor después, porque abarata todo lo demás y evita conflictos. Luego lo que más nota quien
juega por menos esfuerzo: carga más rápida, tutorial y sonido.

---

## Mediciones
(Rellenar con los resultados de 1.5 y actualizar al terminar cada fase.)

| Fecha | Commit | JS total (gzip) | Chunk propio | FPS móvil | ms/tick a ×8 | Pruebas |
|---|---|---|---|---|---|---|
| 2026-11-16 | 81e00a6 | 1.851 kB (463 kB) | — (todo en uno) | ? | ? | 119 ✅ |
| 2026-11-16 | fase 1 | 1.858 kB (468 kB) | 140 kB (49 kB) + contenido 230 kB (77 kB) | 60 / 18 (CPU ×4) | 0,22 / 1,4 (CPU ×4) | 134 ✅ + 5 e2e |

**Cómo se mide** (`?debug` en la URL abre el panel; el botón ⏱ simula un día sobre una copia de la partida):
Chromium sin pantalla con `devices['iPhone 13']` (390×844, DPR 3), gráficos normales (Canvas), partida
nueva a ×8 durante 12 s; «CPU ×4» es la CPU ralentizada cuatro veces por CDP, para parecerse a un móvil
de gama media. Con esa misma configuración:

| Medida | CPU ×1 | CPU ×4 |
|---|---|---|
| FPS (Canvas) | 60 | 18 |
| `world.tick` por frame a ×8 | 0,22 ms (máx 0,7) | 1,4 ms (máx 5,7) |
| Resto del update de la escena | 0,6 ms | 2,7 ms |
| Frame entero (update + dibujado) | 2,4 ms | 12,9 ms |
| Simular 1 día de juego de golpe | 174 ms | 670 ms |
| Memoria JS | 11 MB | 14 MB |

Conclusión: la simulación no es el cuello de botella (≈10 % del frame); lo caro es dibujar a resolución
nativa (DPR 3). Los FPS de WebGL en este entorno no sirven (va por software, SwiftShader): hay que medirlos
en un móvil de verdad.

## Economía (4.1): antes y después

8 semanas simuladas, con la misma semilla, la familia por su cuenta y Lucía y Mateo trabajando (oficina y
cocina) desde el primer día; dinero de la familia al final de cada semana (§):

| Semana | Antes | Después (3 semillas) | Vecino A | Vecino B | Vecino C |
|---|---|---|---|---|---|
| 1 | 2.140 | 2.054 / 2.024 / 2.134 | 1.792 | 1.542 | 2.732 |
| 4 | 3.475 | 3.080 / 3.430 / 4.134 | 1.994 | 2.568 | 5.627 |
| 8 | 9.808 | 8.261 / 8.931 / 9.642 | 987 | 2.084 | 9.567 |

Sin trabajo: antes se llegaba a §0 en la semana 4 y se quedaba ahí (−§237 al final); ahora se llega en la
semana 3 y se acaba en −§750. Los vecinos antes acumulaban todos sin límite (unos §10.000) porque la compra les
salía gratis; ahora la pagan, y unos ahorran y otros van justos.

Decisiones: facturas según la casa, hipoteca por tamaño, compra semanal de los vecinos, retención de Hacienda
por tramos (frena las carreras altas sin tocar los primeros niveles), registro de movimientos y gastos
opcionales (regalos, ropa, cursos y un fin de semana fuera). Las cifras, en `src/data/economy.ts`.



---

## Encargos de la jefa de desarrollo (después de la fase 5) ✅

| Encargo | Estado | Notas |
|---|---|---|
| Editar personajes (aspecto y ropa) | ✅ | Perfil → ✏️: nombre, ropa, pantalón, piel, pelo, peinado y gafas/barba/bigote (`ui/editor.ts`, `applyEdit` en `sim/family.ts`). SAVE_VERSION 16 |
| Catálogo de muebles | ✅ | `ui/catalog.ts`: dibujo de cada mueble (`HouseScene.objectThumb`), para qué sirve, lo que sube, tamaño, calidades y precio; buscar, ordenar, filtrar y comprar-colocar. 11 muebles nuevos y descripción para todos |
| Estaciones como en la vida real | ✅ | Calendario de verdad dentro del juego (`sim/date.ts`, `sim/feasts.ts`): la partida empieza hoy y cada día de juego es un día del calendario; estaciones y fiestas en su fecha. Las partidas de antes siguen «hoy». SAVE_VERSION 17. Las pruebas fijan la fecha (`tests/setup.ts`, y el reloj del navegador en e2e) |
| Alquiler, luz, agua; cortes y desahucio | ✅ | `systems/bills.ts`: recibos al mes (alquiler el 1, luz y agua el 5), pendientes si no hay dinero, corte a los 10 días, carta/burofax/desahucio a los 10/20/30. En la calle: banco, comedor social, baños públicos; bebés y mascotas con la abuela. Volver = deuda del alquiler + un mes de fianza. Servicios sociales: §400 al mes. Los vecinos siguen pagando cada semana. SAVE_VERSION 18 |

De paso: la oscuridad de los apagones solo cubría el centro de la pantalla con la cámara alejada (como la lluvia); se compensa el zoom con `fitToScreen`.
