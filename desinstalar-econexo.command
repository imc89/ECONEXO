#!/bin/bash
# ==============================================================================
# Script de Desinstalación Total de ECONEXO (macOS)
# Borra la aplicación, todas sus bases de datos (IndexedDB), cachés y preferencias.
# ==============================================================================

clear
echo "=========================================================="
echo "      🗑️  DESINSTALADOR COMPLETO DE ECONEXO (macOS)       "
echo "=========================================================="
echo ""
echo "Este script eliminará:"
echo " 1. La aplicación (/Applications/ECONEXO.app)"
echo " 2. Todos los datos financieros guardados (IndexedDB / localStorage)"
echo " 3. Preferencias, contraseñas locales y archivos de configuración"
echo " 4. Cachés temporales y registros (logs)"
echo ""
read -p "¿Estás seguro de que deseas eliminar ECONEXO y todos sus datos? (s/N): " confirm

if [[ "$confirm" != "s" && "$confirm" != "S" && "$confirm" != "si" && "$confirm" != "SI" ]]; then
  echo ""
  echo "❌ Operación cancelada. No se ha borrado nada."
  exit 0
fi

echo ""
echo "⏳ Cerrando la aplicación si está abierta..."
killall "ECONEXO" 2>/dev/null
killall "Electron" 2>/dev/null
sleep 1

echo "⏳ Eliminando la aplicación..."
rm -rf "/Applications/ECONEXO.app"
rm -rf "$HOME/Applications/ECONEXO.app"

echo "⏳ Eliminando bases de datos, IndexedDB y configuraciones de usuario..."
rm -rf "$HOME/Library/Application Support/ECONEXO"
rm -rf "$HOME/Library/Application Support/econexo"
rm -rf "$HOME/Library/Application Support/com.econexo.app"

echo "⏳ Eliminando cachés y estados del sistema..."
rm -rf "$HOME/Library/Caches/ECONEXO"
rm -rf "$HOME/Library/Caches/econexo"
rm -rf "$HOME/Library/Caches/com.econexo.app"
rm -rf "$HOME/Library/Caches/com.econexo.app.ShipIt"
rm -rf "$HOME/Library/Saved Application State/com.econexo.app.savedState"
rm -rf "$HOME/Library/Preferences/com.econexo.app.plist"
rm -rf "$HOME/Library/Preferences/com.econexo.app.helper.plist"
rm -rf "$HOME/Library/Logs/ECONEXO"
rm -rf "$HOME/Library/Logs/econexo"

# Limpieza de caché de preferencias de macOS
killall cfprefsd 2>/dev/null

echo ""
echo "=========================================================="
echo " ✅ ¡Desinstalación completada con éxito!"
echo " Todos los archivos y datos de ECONEXO han sido eliminados."
echo "=========================================================="
echo ""
read -p "Presiona Enter para cerrar esta ventana..."
