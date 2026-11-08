# Local startup in VS Code

Open **Terminal → New Terminal** in VS Code and use PowerShell.

## Start the app

```powershell
cd "C:\Users\victo\VSCode Folder\Budgeting App"
npm run dev
```

Open **http://localhost:5173/greuro/** in your browser. If that port is occupied, open the **Local** URL printed in the terminal instead.

Keep the terminal running while using the app. Saved source changes appear automatically. Press **Ctrl+C** to stop the server.

## First setup or changed dependencies

Install the project's dependencies before starting:

```powershell
cd "C:\Users\victo\VSCode Folder\Budgeting App"
npm install
npm run dev
```

The app needs `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Use the existing project configuration and sign in normally. Local startup uses the configured Supabase account and its saved data; edits can affect that data.

## If PowerShell blocks npm or cannot find it

Use `npm.cmd`:

```powershell
npm.cmd run dev
```

If Node.js is installed in its standard Windows location but is missing from PATH:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm.cmd run dev
```

## Preview a production build

```powershell
npm run build
npm run preview
```

Open the **Local** URL printed in the terminal, normally **http://localhost:4173/greuro/**.
