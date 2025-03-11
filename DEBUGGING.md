# 🔍 Debugging Guide for Perforce Friend

This guide helps you set up debugging for Perforce Friend in Visual Studio Code.

---

## ✅ Before You Start

You'll need:

* **VS Code** with these extensions:
  * JavaScript Debugger (built-in)
  * Chrome Debugger (for browser code)

* **Node.js** (version 18+) on your system

* **Perforce** (p4) command-line client in your PATH

---

## 🚀 Quick Start: All-in-One Debugging

This is the **recommended method**:

1. Open VS Code with the Perforce Friend project
2. Press `Ctrl+Shift+D` to open the Debug view
3. Select **"Next.js: All-in-One Debug"** from the dropdown
4. Press the green ▶️ button (or F5)
5. Set breakpoints by clicking in the left margin of your code
6. The app opens automatically in your browser

> **Tip:** This setup debugs both server and client code at once!

---

## 💡 Where to Set Breakpoints

### Server-Side Code:

* [API: Opened Files](/src/app/api/p4/files/opened/route.ts)
* [API: Connect to Perforce](/src/app/api/p4/connect/route.ts)
* [API: Where Files](/src/app/api/p4/files/where/route.ts)
* [API: Open File System](/src/app/api/system/open-file/route.ts)

### Client-Side Code:

* [Component: Checked Out Files List](/src/components/CheckedOutFilesList.tsx)
* [Component: Modified Files List](/src/components/ModifiedFilesList.tsx)
* [Component: P4 Connection Form](/src/components/P4ConnectionForm.tsx)

---

## ⚠️ Troubleshooting

### Breakpoints Not Working?

Try these steps (in order):

1. Restart the debugging session (stop and start again)
2. Clear your browser cache
3. Try a private/incognito browser window
4. Check the console for errors

### Inspector Port Issues?

If you see "port already in use" errors:

1. Close VS Code completely
2. End Node.js processes in Task Manager
3. Start VS Code and try again

### Path Problems?

If source maps aren't working:

* Check the `sourceMapPathOverrides` setting in [.vscode/launch.json](/.vscode/launch.json)
