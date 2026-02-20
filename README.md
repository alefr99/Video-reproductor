# StudioCut Pro (demo funcional)

Aplicación web de edición de vídeo estilo profesional (single-page, vanilla JS) con:

- Línea de tiempo multipista con zoom y snapping.
- Importación de vídeo/audio/gráficos.
- Herramientas de corte (split, trim, ripple, slip, slide).
- Transiciones básicas.
- Títulos/lower thirds.
- Controles de audio con Web Audio API (volumen, EQ, compresor, limitador, sidechain básico, mute/solo).
- Corrección de color básica y avanzada (incluye LUTs rápidas, lift/gamma/gain y máscara circular).
- Scopes en preview (waveform y vectorscope aproximados).
- Multicámara con conmutación de ángulo.
- Motion tracking básico mediante puntos en tiempo.
- Chroma key con controles de spill/feather.
- Estabilización simulada para preview.
- Plantillas de proyecto.
- Cola de render por lotes con presets de exportación.

## Ejecutar

Puedes abrir `index.html` directamente o usar servidor local:

```bash
python3 -m http.server 4173
```

Luego visita `http://localhost:4173`.
