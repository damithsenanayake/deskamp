# Riffbox

A compact desktop music player for macOS and Linux. Riffbox takes inspiration from the hands-on feel of classic music players, with its own name, graphics, and interface.

## Run it

Install [Node.js](https://nodejs.org/) 20 or newer, then run:

```bash
npm install
npm start
```

Click **Add Music** or **Add Folder**, or drop files and folders onto the window. Your playlist and player settings are saved locally in the app's user data folder. Your audio files stay where they are; Riffbox does not upload or copy them.

## Controls

| Action | Shortcut |
| --- | --- |
| Play or pause | Space |
| Previous or next track | Up / Down arrows |
| Seek five seconds | Left / Right arrows |
| Search playlist | Command+K on Mac, Ctrl+K on Linux |

Click a track to play it. Right-click a track to reveal its file. Use the × button to remove it from the playlist. Shuffle and repeat cycle through off, all, and one. The five-band equalizer can be turned off or reset.

Riffbox lists MP3, M4A, AAC, WAV, FLAC, OGG, Opus, WebM, and AIFF files. Actual decoding support depends on the Electron/Chromium build and operating system.

## Package it

On macOS:

```bash
npm run dist:mac
```

That builds for the current Mac architecture. To make an Intel Mac build from Apple Silicon, run `npm run dist:mac:intel`.

On Linux:

```bash
npm run dist:linux
```

This builds an x64 AppImage. For ARM64 Linux, run `npm run dist:linux:arm64`. Make the AppImage executable with `chmod +x Riffbox-*.AppImage`, then open it.

Packages appear in `release/`. The Mac build is unsigned; macOS may require you to explicitly allow it in System Settings. A signed public distribution needs Apple signing credentials.

## Privacy and project status

Riffbox only reads local files you add and stores its playlist as `library.json` in Electron's user data directory. No account or network service is involved. This is an independent project and is not affiliated with Winamp.
