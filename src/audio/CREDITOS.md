# Créditos del sonido

Todo el sonido de Sams se **genera por código** con Web Audio, en el propio juego: no hay ningún fichero de
audio. Por eso no hay licencias de terceros que cumplir ni nada que descargar (y funciona sin conexión).

| Qué | Dónde | Cómo |
|---|---|---|
| Efectos (interfaz, casa, mascotas, eventos y el pedo) | `synth.ts` | Osciladores, ruido filtrado, cuerda pulsada (Karplus-Strong) y campanas por parciales |
| Ambientes (casa, parque, noche, plaza, bar, metro, tiendas, lluvia, viento) | `ambience.ts` | Una base de ruido filtrado y sonidos sueltos al azar |
| Música (día, noche, fiesta, Navidad, chotis) | `music.ts` | Secuenciador sobre progresiones de acordes; la melodía se improvisa sobre la escala |
| Voz del metro («Próxima estación…») | `engine.ts` | Síntesis de voz del sistema (`speechSynthesis`), si el navegador la tiene |

Si algún día se añaden ficheros de audio: solo propios o con licencia CC0, en formato .ogg + .m4a (Safari no
lee ogg), y anotados en esta tabla con su origen.
