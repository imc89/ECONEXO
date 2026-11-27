#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

APP_NAME="Desinstalador ECONEXO.app"
TARGET_DIR="$ROOT_DIR/dist-electron/$APP_NAME"

echo "🔨 Creando $APP_NAME..."

rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR/Contents/MacOS"
mkdir -p "$TARGET_DIR/Contents/Resources"

# 1. Copiar icono
if [ -f "$ROOT_DIR/electron/assets/icon.icns" ]; then
  cp "$ROOT_DIR/electron/assets/icon.icns" "$TARGET_DIR/Contents/Resources/app.icns"
fi

# 2. Crear Info.plist
cat << 'EOF' > "$TARGET_DIR/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>uninstaller</string>
    <key>CFBundleIconFile</key>
    <string>app.icns</string>
    <key>CFBundleIdentifier</key>
    <string>com.econexo.uninstaller</string>
    <key>CFBundleName</key>
    <string>Desinstalador ECONEXO</string>
    <key>CFBundleDisplayName</key>
    <string>Desinstalador</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13</string>
</dict>
</plist>
EOF

# 3. Crear ejecutable nativo
cat << 'EOF' > "$TARGET_DIR/Contents/MacOS/uninstaller"
#!/bin/bash

# Diálogo de confirmación nativo de macOS
CONFIRM=$(osascript -e '
try
    set dialogResult to display dialog "⚠️ ¿Estás seguro de que deseas desinstalar ECONEXO?\n\nEsta acción cerrará la app, la eliminará de tus Aplicaciones y borrará permanentemente todas las bases de datos locales (IndexedDB), balances y configuraciones guardadas." with title "Desinstalador de ECONEXO" with icon caution buttons {"Cancelar", "Desinstalar Todo"} default button "Cancelar" cancel button "Cancelar"
    return "OK"
on error number -128
    return "CANCEL"
end try
')

if [ "$CONFIRM" != "OK" ]; then
    exit 0
fi

# Cerrar app si está abierta
killall "ECONEXO" 2>/dev/null
killall "Electron" 2>/dev/null
sleep 0.5

# 1. Eliminar aplicación de Aplicaciones
rm -rf "/Applications/ECONEXO.app"
rm -rf "$HOME/Applications/ECONEXO.app"

# 2. Eliminar bases de datos IndexedDB y LocalStorage
rm -rf "$HOME/Library/Application Support/ECONEXO"
rm -rf "$HOME/Library/Application Support/econexo"
rm -rf "$HOME/Library/Application Support/com.econexo.app"

# 3. Eliminar cachés y logs
rm -rf "$HOME/Library/Caches/ECONEXO"
rm -rf "$HOME/Library/Caches/econexo"
rm -rf "$HOME/Library/Caches/com.econexo.app"
rm -rf "$HOME/Library/Caches/com.econexo.app.ShipIt"
rm -rf "$HOME/Library/Saved Application State/com.econexo.app.savedState"
rm -rf "$HOME/Library/Preferences/com.econexo.app.plist"
rm -rf "$HOME/Library/Preferences/com.econexo.app.helper.plist"
rm -rf "$HOME/Library/Logs/ECONEXO"
rm -rf "$HOME/Library/Logs/econexo"

# Actualizar preferencias del sistema
killall cfprefsd 2>/dev/null

# Notificación y mensaje de éxito nativo
osascript -e 'display alert "✅ Desinstalación Completada" message "La aplicación ECONEXO y todos sus datos han sido eliminados por completo de tu equipo." as informational buttons {"Aceptar"} default button "Aceptar"'
EOF

chmod +x "$TARGET_DIR/Contents/MacOS/uninstaller"
codesign --force --deep --sign - "$TARGET_DIR" 2>/dev/null || true

echo "✅ App de desinstalación creada con éxito en:"
echo "   $TARGET_DIR"

cd "$ROOT_DIR/dist-electron"
zip -r -q "Desinstalador-ECONEXO-mac.zip" "$APP_NAME"
echo "📦 Comprimido para distribución en:"
echo "   $ROOT_DIR/dist-electron/Desinstalador-ECONEXO-mac.zip"
