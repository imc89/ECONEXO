#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PKG_DIR="$ROOT_DIR/dist-electron/Desinstalador ECONEXO (Windows)"
ZIP_PATH="$ROOT_DIR/dist-electron/Desinstalador-ECONEXO-windows.zip"

echo "🔨 Creando Desinstalador para Windows..."

rm -rf "$PKG_DIR"
rm -f "$ZIP_PATH"
mkdir -p "$PKG_DIR"

# 1. Crear script VBScript nativo (sin consola negra, cuadros de diálogo nativos de Windows)
cat << 'EOF' > "$PKG_DIR/Desinstalador ECONEXO.vbs"
Option Explicit
Dim objShell, objFSO, userProfile, appData, localAppData, programFiles, programFilesX86
Dim answer

Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

userProfile = objShell.ExpandEnvironmentStrings("%USERPROFILE%")
appData = objShell.ExpandEnvironmentStrings("%APPDATA%")
localAppData = objShell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
programFiles = objShell.ExpandEnvironmentStrings("%ProgramFiles%")
programFilesX86 = objShell.ExpandEnvironmentStrings("%ProgramFiles(x86)%")

answer = MsgBox("¿Estás seguro de que deseas desinstalar ECONEXO?" & vbCrLf & vbCrLf & _
  "Esta acción cerrará la aplicación, la eliminará de tu equipo y borrará permanentemente todas las bases de datos locales (IndexedDB), balances y configuraciones guardadas.", _
  vbYesNo + vbExclamation + vbDefaultButton2, "Desinstalador de ECONEXO")

If answer <> vbYes Then
    WScript.Quit 0
End If

' Cerrar procesos de ECONEXO si están en ejecución
On Error Resume Next
objShell.Run "taskkill /F /IM ECONEXO.exe /T", 0, True
objShell.Run "taskkill /F /IM electron.exe /T", 0, True
WScript.Sleep 500

' Ejecutar desinstalador silencioso de NSIS si existe
Dim uninstPath
uninstPath = localAppData & "\Programs\ECONEXO\Uninstall ECONEXO.exe"
If objFSO.FileExists(uninstPath) Then
    objShell.Run """" & uninstPath & """ /S", 0, True
    WScript.Sleep 1000
End If

' Eliminar carpetas del programa si quedan restos
DeleteFolderSafe localAppData & "\Programs\ECONEXO"
DeleteFolderSafe programFiles & "\ECONEXO"
DeleteFolderSafe programFilesX86 & "\ECONEXO"

' Eliminar datos de usuario, IndexedDB, LevelDB y configuraciones
DeleteFolderSafe appData & "\ECONEXO"
DeleteFolderSafe appData & "\econexo"
DeleteFolderSafe appData & "\com.econexo.app"
DeleteFolderSafe localAppData & "\ECONEXO"
DeleteFolderSafe localAppData & "\econexo"
DeleteFolderSafe localAppData & "\com.econexo.app"
DeleteFolderSafe localAppData & "\ECONEXO-updater"

' Eliminar accesos directos
DeleteFileSafe userProfile & "\Desktop\ECONEXO.lnk"
DeleteFileSafe objShell.SpecialFolders("AllUsersDesktop") & "\ECONEXO.lnk"
DeleteFileSafe appData & "\Microsoft\Windows\Start Menu\Programs\ECONEXO.lnk"
DeleteFolderSafe appData & "\Microsoft\Windows\Start Menu\Programs\ECONEXO"

' Limpiar registro de Windows
objShell.Run "reg delete ""HKCU\Software\com.econexo.app"" /f", 0, True
objShell.Run "reg delete ""HKCU\Software\ECONEXO"" /f", 0, True
objShell.Run "reg delete ""HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\com.econexo.app"" /f", 0, True

MsgBox "La aplicación ECONEXO y todos sus datos han sido eliminados por completo de tu equipo.", _
  vbOKOnly + vbInformation, "Desinstalación Completada"

Sub DeleteFolderSafe(path)
    On Error Resume Next
    If objFSO.FolderExists(path) Then
        objFSO.DeleteFolder path, True
    End If
End Sub

Sub DeleteFileSafe(path)
    On Error Resume Next
    If objFSO.FileExists(path) Then
        objFSO.DeleteFile path, True
    End If
End Sub
EOF

# 2. Crear archivo .bat directo para máxima compatibilidad
cat << 'EOF' > "$PKG_DIR/Desinstalador ECONEXO.bat"
@echo off
start "" wscript.exe "%~dp0Desinstalador ECONEXO.vbs"
EOF

# 3. Crear archivo LEEME
cat << 'EOF' > "$PKG_DIR/LEEME.txt"
==============================================================
   DESINSTALADOR COMPLETO DE ECONEXO (Windows 10 / 11)
==============================================================

Para desinstalar ECONEXO por completo y borrar todos sus datos locales:

1. Haz doble clic sobre "Desinstalador ECONEXO.vbs" (o "Desinstalador ECONEXO.bat").
2. Aparecerá un cuadro de confirmación nativo de Windows.
3. Haz clic en "Sí" para confirmar.

El desinstalador:
- Cerrará la aplicación si estuviera abierta.
- Eliminará la aplicación de tus programas instalados.
- Eliminará permanentemente todas las bases de datos locales (IndexedDB),
  saldos, previsiones, fondos y configuraciones guardadas en %APPDATA%\ECONEXO.
- Borrará los accesos directos del Escritorio y del Menú Inicio.
==============================================================
EOF

# 4. Crear archivo ZIP
cd "$ROOT_DIR/dist-electron"
zip -r -q "Desinstalador-ECONEXO-windows.zip" "Desinstalador ECONEXO (Windows)"

echo "✅ Desinstalador de Windows creado con éxito en:"
echo "   $ZIP_PATH"
