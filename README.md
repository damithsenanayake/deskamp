# DeskAmp

DeskAmp is a compact desktop amplifier for local music on macOS and Linux. It has three **real windows**: the player, a five-band equalizer, and the playlist editor. Nearby vertical edges snap together. On macOS, docked windows form a native parent-child group and move together; dragging a lower window away detaches that part of the stack. On Linux, attached windows are repositioned together as the dragged window moves. Its name, graphics, and UI code are original.

## Run

Install Node.js 20 or newer, then:

```bash
npm install
npm start
```

Use **+ FILES** or **+ FOLDER** in the playlist window, or drop files and folders onto any DeskAmp window. The **EQ** and **PL** buttons on the player show or hide the other windows. Closing the player quits the app; closing EQ or playlist hides that window.

| Action | Shortcut |
| --- | --- |
| Play or pause | Space |
| Previous or next track | Up / Down arrows |
| Seek five seconds | Left / Right arrows |
| Search playlist | Command+K on Mac, Ctrl+K on Linux |

Click a playlist row to play it. Right-click one to reveal its file. Use × to remove a row. Shuffle and repeat are on the player; repeat cycles through off, all, and one.

DeskAmp lists MP3, M4A, AAC, WAV, FLAC, OGG, Opus, WebM, and AIFF. Playback support for a format depends on Electron/Chromium and the operating system.

## Package

```bash
npm run dist:mac
npm run dist:mac:intel
npm run dist:linux
npm run dist:linux:arm64
```

Packages appear in `release/`. The Mac builds are unsigned, so macOS may require you to explicitly allow them in System Settings. Linux builds are AppImages; make one executable with `chmod +x DeskAmp-*.AppImage` before opening it.

## Data

Music files remain where they are. DeskAmp stores a playlist and settings in Electron's local user data directory and can read playlists made by the earlier Riffbox prototype. There is no account or network service. DeskAmp is independent and not affiliated with Winamp.
