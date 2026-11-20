# Registro de correcciones y plan de mejoras (`Sams`)

> Estado actual: **Fases 1, 2, 3, 4 y 5 completadas y verificadas**.  
> **Verificación ejecutada:** Dependencias instaladas con `npm install`, compilación limpia sin errores (`npm run build` / `tsc --noEmit` + `vite build`) y **suite completa en verde** (`npm test`: 41 archivos de test, 302 tests aprobados).

---

## Hecho — Fase 1: Corrección de bugs críticos en la simulación

### 1.1 Tareas, duración de reparación, validación y ciclo de vida de acciones
- **[`src/sim/systems/tasks.ts`](file:///c:/Python%20proyectos/Sams/src/sim/systems/tasks.ts)**
  - **Ventaja de `manitas` en `repair` (`actionDuration`, `beginTask`, `runTask`):** El multiplicador de duración de reparación estaba en la rama `def.target === 'self'`, cuando `ACTIONS.repair` tiene `target: 'object'`. Se extrajo `actionDuration` y se aplicó en `runTask` al pasar a fase `'acting'`.
  - **Validación de acciones propias (`beginTask`):** Las acciones con `def.target === 'self'` ahora pasan por `checkSelfAction` cuando no son `forced` ni `'idle'`/`'vomit'`, evitando ejecutar acciones en cola que ya no cumplan sus requisitos.
  - **Guardas tras acciones mortales (`completeTask`):** Se añadió `if (!w.agent(a.id)) return;` justo después de `riskyTask` (p. ej. electrocución al reparar) y tras `socialOutcome` (p. ej. pelea o chiste mortal), evitando modificar estado o emitir avisos de un agente ya fallecido.
  - **Preservación de reemplazo de tarea (`completeTask`):** Cambiado `endTask(w, a)` por `if (a.current === task) endTask(w, a)` para no sobrescribir tareas impuestas durante la finalización (como `pass_out` al pasarse con el alcohol en `drink`).

### 1.2 Mudanzas, embarazos, jubilación y limpieza al morir
- **[`src/sim/systems/breakups.ts`](file:///c:/Python%20proyectos/Sams/src/sim/systems/breakups.ts)**
  - **Rejilla de colisión al emanciparse (`moveOut`):** Llamada a `w.rebuildGrid()` inmediatamente después de `addRentalFlat(...)` para registrar el grid del nuevo piso de alquiler en `w.grids`.
  - **Transferencia de embarazo (`moveOut`):** Si `old.expecting?.mother === a.id`, el embarazo se traslada al nuevo hogar de la madre en lugar de quedar asociado a la casa anterior.
- **[`src/sim/systems/lifecycle.ts`](file:///c:/Python%20proyectos/Sams/src/sim/systems/lifecycle.ts)**
  - **Transferencia de embarazo en mudanzas (`moveToHousehold`, `moveIn`):** Si la embarazada cambia de hogar y el destino no tiene ya un bebé en camino, se traslada `expecting` al nuevo hogar.
  - **Jubilación con universidad o estudio activo (`onStageChange`):** Al pasar a `'elder'`, se limpia `a.study` y se retira `a.job` cuando `career === 'uni'` sin disparar el aviso ni la lógica de jubilación de un empleo ordinario.
  - **Limpieza integral al morir (`die`):**
    - Se llama a `endTask(w, a)` y se terminan tareas de otros agentes cuyo `passiveOf` o `targetAgentId` sea `a.id`.
    - Se limpian `w.state.dilemma` y entradas en `w.state.schedule` que apunten al agente fallecido (como actor o como objetivo).
    - Se elimina `x.expecting` en los hogares si muere la madre (`expecting.mother === a.id`) o si el embarazo queda sin progenitores.
    - Al calcular `lastPerson` en un hogar, no se consideran los bebés (`stageOf !== 'baby'`) como capaces de sostener el hogar; si fallece la última persona no bebé, los bebés huérfanos restantes se retiran limpiamente antes de evaluar `familyGone` o `replaceFamily`.
- **[`src/sim/world.ts`](file:///c:/Python%20proyectos/Sams/src/sim/world.ts)**
  - **Guardas en `activeAgent` y `viewLotId`:** Añadidos fallbacks seguros para no devolver `undefined` ni romper el acceso a `a.travel` / `a.lotId` si la familia del jugador se queda sin miembros tras `familyGone`.
- **[`src/ui/profile.ts`](file:///c:/Python%20proyectos/Sams/src/ui/profile.ts)**
  - **Ocultar embarazo no confirmado (`renderProfile`, `cycleHtml`):** Cuando `expecting.known === false` (recién concebido por `niqui`, antes del aviso del día siguiente), se oculta la tarjeta de «Bebé en camino» y la línea de embarazo en `cycleHtml`, mostrando la fase normal del ciclo sin alterar `isPregnant()` ni `hasCycle()`.

### 1.3 Escapadas, relaciones, conversación, culebrones y visitas
- **[`src/sim/systems/trips.ts`](file:///c:/Python%20proyectos/Sams/src/sim/systems/trips.ts)**
  - **`travellers` y `tripsHour`:** Excluidos de la escapada de fin de semana los agentes en la cárcel (`reason === 'jail'`) o con llegada infinita (`!Number.isFinite(arrive)`, como mascotas/bebés con la abuela por desahucio o aislamiento). Además, `tripsHour` evita emitir toast y noticia duplicados si la escapada ya había arrancado previamente.
- **[`src/sim/conversation.ts`](file:///c:/Python%20proyectos/Sams/src/sim/conversation.ts)**
  - **`converse`:** Invocación de `attend(world, a, t)` cuando `outcome !== 'bad'` para que las conversaciones interactivas cuenten como atención y actualicen `rel.last`.
- **[`src/sim/relations.ts`](file:///c:/Python%20proyectos/Sams/src/sim/relations.ts)** y **[`src/sim/neighborhood.ts`](file:///c:/Python%20proyectos/Sams/src/sim/neighborhood.ts)**
  - **`kinTag` (`relations.ts`):** Corregido `a.sex === 'm'` por `b.sex === 'm'` al etiquetar «Su hijo / Su hija».
  - **`setupFamilyLife` (`neighborhood.ts`):** Rellenado `k.parents` en los jóvenes generados con adultos en la familia para que `kinTag` distinga padres, hijos y hermanos correctamente.
- **[`src/sim/social.ts`](file:///c:/Python%20proyectos/Sams/src/sim/social.ts)**
  - **`grudgeOf`:** Cualquier recuerdo `'perdon'` corta los rencores previos (`if (m.k === 'perdon') return undefined;`) en lugar de comprobar solo `m.by === tId`, haciendo simétrica la reconciliación tras una `'pelea'`.
- **[`src/sim/systems/gossip.ts`](file:///c:/Python%20proyectos/Sams/src/sim/systems/gossip.ts)** y **[`src/sim/systems/arcs.ts`](file:///c:/Python%20proyectos/Sams/src/sim/systems/arcs.ts)**
  - **`catchAffair` (`gossip.ts`):** Llamada a `onBreakUp(w, cheater, betrayed, r)` cuando una infidelidad provoca ruptura fuera de un culebrón activo (`!arcOf(w, cheater.id)`), registrando `split` para que `dailyBreakups` gestione la separación si convivían.
  - **`startArc` y `runStep` (`arcs.ts`):** En culebrones `'lio'`, se evita elegir como protagonista a alguien cuya pareja ya esté en otro culebrón activo; y si en el desenlace (`default`) el infiel no llega a mudarse con el amante y seguía conviviendo con su ex, se invoca `onBreakUp` para evitar que sigan juntos indefinidamente.
- **[`src/sim/world.ts`](file:///c:/Python%20proyectos/Sams/src/sim/world.ts)**
  - **Filtro `visitorsNow` en `hourly()`:** Corregido para detectar únicamente visitantes reales en la parcela del jugador (`visitUntil`) o vecinos en camino hacia ella (`travel.to === this.household.lotId || via === this.household.lotId`), evitando que cualquier vecino viajando por otro motivo bloquee las visitas espontáneas.

---

## Hecho — Fase 2: Guardado, migraciones y validación

- **[`src/save/validate.ts`](file:///c:/Python%20proyectos/Sams/src/save/validate.ts)**
  - Validación de unicidad y referencias cruzadas en [`validateState`](file:///c:/Python%20proyectos/Sams/src/save/validate.ts#L45) para `lots`, `households`, `objects`, `agents` y `memberIds` (incluyendo `playerHouseholdId`, `home`, `lotId`, `householdId`, `aging`).
  - Validación de objetos anidados que antes faltaban: `expecting`, `delivery`, `travel`, `job`, tareas (`current`/`queue` con `actionId`, `phase`, `remaining`, `dest`, `goal`), `party`, `dilemma`, `events`, `secrets`, `lottery`, `news` y memorias/valores de `rels`.
- **[`src/save/serialize.ts`](file:///c:/Python%20proyectos/Sams/src/save/serialize.ts)** y **[`src/sim/neighborhood.ts`](file:///c:/Python%20proyectos/Sams/src/sim/neighborhood.ts)**
  - Añadido `syncNextId` en [`migrate`](file:///c:/Python%20proyectos/Sams/src/save/serialize.ts#L189) (antes y después del bucle de migración) para garantizar que `nextId` sea siempre mayor que el sufijo numérico más alto existente en agentes, hogares, lotes, objetos, secretos, arcos, deudas, deseos, tareas y programación.
  - Restauración en `migrate` de `travel.arrive = Infinity` cuando `JSON.stringify` lo serializó como `null` (desahucios/aislamiento), y rellenado de `parents` para menores que convivan con adultos `kin` en partidas antiguas.
  - Prevención de objetos duplicados en [`placeObjects`](file:///c:/Python%20proyectos/Sams/src/sim/neighborhood.ts#L94) cuando se ejecutan migraciones sobre lotes ya poblados.
- **[`src/save/db.ts`](file:///c:/Python%20proyectos/Sams/src/save/db.ts)** y **[`src/main.ts`](file:///c:/Python%20proyectos/Sams/src/main.ts)**
  - Cierre garantizado de `IDBDatabase` (`finally { db.close(); }`) y escucha de `tx.onabort` en `saveGame`, `readIdb` y `deleteGame`.
  - [`saveGame`](file:///c:/Python%20proyectos/Sams/src/save/db.ts#L41) y [`saveGameSync`](file:///c:/Python%20proyectos/Sams/src/save/db.ts#L32) devuelven `boolean` indicando si se pudo persistir en IndexedDB o `localStorage`, y `onSave` en [`main.ts`](file:///c:/Python%20proyectos/Sams/src/main.ts#L24) avisa al usuario si el almacenamiento falla o está lleno.
- **[`tests/seguridad.test.ts`](file:///c:/Python%20proyectos/Sams/tests/seguridad.test.ts)**
  - Añadidos tests para rechazo de referencias rotas o IDs duplicados, sincronización automática de `nextId` y conservación de viajes infinitos tras serializar/migrar.

---

## Hecho — Fase 3: Gestión de recursos, audio y eventos de UI

- **[`src/audio/synth.ts`](file:///c:/Python%20proyectos/Sams/src/audio/synth.ts)** y **[`src/audio/ambience.ts`](file:///c:/Python%20proyectos/Sams/src/audio/ambience.ts)**
  - Desconexión de nodos Web Audio mediante `onended` en [`tone`](file:///c:/Python%20proyectos/Sams/src/audio/synth.ts#L48), [`noise`](file:///c:/Python%20proyectos/Sams/src/audio/synth.ts#L98) y [`pluck`](file:///c:/Python%20proyectos/Sams/src/audio/synth.ts#L125) (ganancias, filtros, LFO y fuentes), y expulsión FIFO en `pluckCache` al alcanzar el límite de 80 entradas en lugar de vaciar la caché completa.
  - Desconexión de fuentes, filtros, ganancias y LFOs en `stoppers` dentro de [`makeLayer`](file:///c:/Python%20proyectos/Sams/src/audio/ambience.ts#L20) al detener capas de ambiente.
- **[`src/audio/engine.ts`](file:///c:/Python%20proyectos/Sams/src/audio/engine.ts)**
  - Guardas en el listener `keydown` de desbloqueo (`isComposing`, modificadores `ctrl`/`meta`/`alt` y campos editables) y retirada automática de los listeners globales de `window` en cuanto el `AudioContext` pasa a `'running'`.
- **[`src/ui/talk.ts`](file:///c:/Python%20proyectos/Sams/src/ui/talk.ts)**, **[`src/ui/dilemma.ts`](file:///c:/Python%20proyectos/Sams/src/ui/dilemma.ts)**, **[`src/ui/sheet.ts`](file:///c:/Python%20proyectos/Sams/src/ui/sheet.ts)**, **[`src/ui/profile.ts`](file:///c:/Python%20proyectos/Sams/src/ui/profile.ts)**, **[`src/ui/editor.ts`](file:///c:/Python%20proyectos/Sams/src/ui/editor.ts)** y **[`src/ui/hud.ts`](file:///c:/Python%20proyectos/Sams/src/ui/hud.ts)**
  - Cierre/limpieza automática de paneles cuando desaparece o cambia el objetivo/agente activo (`syncTalk`, `syncDilemma`, `syncSheet`, `syncProfile`, `syncEditor`) desde [`Hud.render`](file:///c:/Python%20proyectos/Sams/src/ui/hud.ts#L176).
  - En [`Hud.setWorld`](file:///c:/Python%20proyectos/Sams/src/ui/hud.ts#L78), salida limpia del modo construcción/conversación previo, cierre de modales abiertos y reseteo completo de cachés HTML de `FamilyPanel` antes de enlazar la nueva partida.
- **[`src/render/HouseScene.ts`](file:///c:/Python%20proyectos/Sams/src/render/HouseScene.ts)** y **[`src/main.ts`](file:///c:/Python%20proyectos/Sams/src/main.ts)**
  - Limpieza de mapas de escena (`nextFx`, `nextTalk`, `convo` y `pendingSpeech`) en [`setWorld`](file:///c:/Python%20proyectos/Sams/src/render/HouseScene.ts#L262), [`showLot`](file:///c:/Python%20proyectos/Sams/src/render/HouseScene.ts#L413) y al retirar sprites de agentes que salen de la parcela en [`syncAgents`](file:///c:/Python%20proyectos/Sams/src/render/HouseScene.ts#L804).
  - Comprobación `w === world` en el temporizador de captura automática de [`bindToasts`](file:///c:/Python%20proyectos/Sams/src/main.ts#L61) para no capturar si cambió la partida antes de los 400 ms.

---

## Hecho — Fase 4: Optimización de rendimiento

- **[`src/sim/pathfinding.ts`](file:///c:/Python%20proyectos/Sams/src/sim/pathfinding.ts)**
  - Reemplazada la búsqueda lineal del mínimo en `open` (`O(n)`) dentro de [`findPath`](file:///c:/Python%20proyectos/Sams/src/sim/pathfinding.ts#L57) por un Min-Heap binario (`heapPush`/`heapPop`, `O(log n)`) con desempate determinista por orden de inserción (`seq`).
- **[`src/sim/world.ts`](file:///c:/Python%20proyectos/Sams/src/sim/world.ts)**
  - Añadidos índices autovalidados en `World` (`hhCache`, `lotCache`, `agentCache`, `objCache`) por referencia/longitud/extremos de array para acelerar en `O(1)` las consultas de `household`, `householdOf`, `lotById`, `agent`, `object` y `objectsIn` (con invalidación explícita en `rebuildGrid()`).
- **[`src/ui/panel.ts`](file:///c:/Python%20proyectos/Sams/src/ui/panel.ts)** y **[`src/ui/hud.ts`](file:///c:/Python%20proyectos/Sams/src/ui/hud.ts)**
  - Añadida caché `lastWhoHtml` en `FamilyPanel` y comprobaciones previas de igualdad en [`Hud.render`](file:///c:/Python%20proyectos/Sams/src/ui/hud.ts#L180) (`#clock.title`, `#funds`, `#family`) para evitar mutar el DOM en cada intervalo de `200 ms` cuando el texto visible no ha cambiado.
- **[`src/render/HouseScene.ts`](file:///c:/Python%20proyectos/Sams/src/render/HouseScene.ts)**
  - Añadido `badgeKey` en [`syncObjects`](file:///c:/Python%20proyectos/Sams/src/render/HouseScene.ts#L636) para no regenerar texto/fondo ni reajustar visibilidad de etiquetas (`¡Vacío!`, `¡Sucio!`, `🔧 Roto`) en cada frame si el estado no cambia.
  - Sustituido `JSON.stringify(a.look ?? {})` en [`agentKey`](file:///c:/Python%20proyectos/Sams/src/render/HouseScene.ts#L682) por interpolación directa sin asignaciones temporales por agente y frame.

---

## Hecho — Fase 5: Verificación, ajuste adicional y tests de regresión

- **[`src/sim/systems/checks.ts`](file:///c:/Python%20proyectos/Sams/src/sim/systems/checks.ts)**
  - Corregida la comprobación de ocupación en [`checkObjectAction`](file:///c:/Python%20proyectos/Sams/src/sim/systems/checks.ts#L87): para `actionId === 'repair'`, la capacidad efectiva mínima pasa a ser `Math.max(1, od.capacity)`, desbloqueando la reparación de objetos con `capacity: 0` como `tv` que antes devolvían `'Ocupado'` siempre que se estropeaban.
- **[`tests/regresion.test.ts`](file:///c:/Python%20proyectos/Sams/tests/regresion.test.ts)**
  - **15 nuevos tests de regresión** que verifican: duración de `repair` con `manitas`, rechazo de acciones `self` inválidas en `beginTask`, aborto post-mortem en `completeTask`, preservación de `pass_out` al terminar una bebida alcohólica, `moveOut` + grid + transferencia de `expecting` (también en `moveToHousehold` y `moveIn`), `onStageChange` (`'elder'`) limpiando estudios/uni, limpieza integral en `die()` (tareas dependientes, dilemas, programación, embarazo y bebés huérfanos), `tripsHour` (cárcel/infinito y no duplicación), `converse` + `attend`, `kinTag` hijo/hija + `parents` en vecindario, perdón simétrico en `grudgeOf`, `catchAffair` registrando `split` fuera de culebrones, `findPath` sin cortes diagonales con Min-Heap y coherencia de índices autovalidados de `World`.
- **[`tests/seguridad.test.ts`](file:///c:/Python%20proyectos/Sams/tests/seguridad.test.ts)**
  - Tests de Fase 2 para referencias cruzadas rotas, IDs duplicados, sincronización de `nextId` y conservación de viajes infinitos al serializar/migrar.

---

## Notas finales
- Toda la suite (`npm run build` y `npm test` — 41 archivos, 302 tests) queda en verde. Como únicas pruebas fuera del runner de Vitest permanecen el test E2E con Playwright (`npm run test:e2e`) y la verificación visual de UI de navegador/Canvas (`ProfilePanel`, `Hud`) al correr la aplicación.
