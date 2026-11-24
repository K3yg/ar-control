' Runs auto.mjs with no console window (the browser window still shows when it needs you).
' Used by the Windows scheduled task; see README "Run it on your Windows PC".
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = dir
sh.Run "node --env-file-if-exists=.env auto.mjs", 0, False
