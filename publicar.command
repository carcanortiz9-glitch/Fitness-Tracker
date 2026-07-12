#!/bin/zsh
# Doble clic para publicar la app en GitHub Pages.
# Requiere la configuración de git + llave SSH (una sola vez).
cd "$(dirname "$0")"
git add -A
git commit -m "Actualización de OVERLOAD $(date '+%Y-%m-%d %H:%M')" || echo "Sin cambios nuevos."
git push origin main && echo "✅ Publicado — en 1-2 min estará en línea." || echo "❌ Algo falló; revisa la conexión o pídeme ayuda."
read -k 1 -s "?Presiona cualquier tecla para cerrar…"
