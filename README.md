# Exam Management V2

Local LAN exam system for one teacher machine and student browsers on the same Wi-Fi/LAN.

## Run on Windows for testing

```powershell
npm install
powershell -ExecutionPolicy Bypass -File .\Start.ps1
```

Open `http://localhost:3000`.

## Default teacher password

The development default is `admin123`. Change it with:

```powershell
$env:TEACHER_PASSWORD="your-password"; npm start
```

## macOS portable start

After dependencies are installed on macOS:

```bash
chmod +x Start.command
./Start.command
```
