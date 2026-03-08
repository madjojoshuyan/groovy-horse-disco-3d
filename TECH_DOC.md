Copyright (c) 2026 Yan Shu (舒龑) madjojoshuyan
This work is licensed under a Creative Commons Attribution-NonCommercial 4.0 International License.

# Groovy Horse Disco 3D - Technical Documentation

## 1. All-in-One Installer Solutions

Web applications built with React and Vite run in a browser and require a local server. To distribute this as a single "double-click" installer, you have two main options:

### Option A: The Automated Setup Scripts (Included)
We have included two scripts in this folder that act as a lightweight installer and launcher.
* **Windows**: Double-click `setup-windows.bat`
* **Mac**: Double-click `setup-mac.command` (You may need to right-click -> Open, or run `chmod +x setup-mac.command` in terminal first).

These scripts will automatically check for Node.js, install all required dependencies, start the local server, and open your default web browser to the correct address.

### Option B: True Desktop App Installer (.exe / .dmg) via Electron
If you want to package this app into a standalone desktop application (like a standard `.exe` or `.dmg` file) that doesn't require the user to install Node.js at all, you should use **Electron**.

**Steps to convert to an Electron App:**
1. Open your terminal in the project folder.
2. Install Electron and Electron Builder:
   `npm install electron electron-builder concurrently wait-on --save-dev`
3. Create a `main.js` file in the root directory to configure the Electron window.
4. Update `package.json` to include `"main": "main.js"` and add build scripts:
   `"electron:serve": "concurrently \"npm run dev\" \"wait-on http://localhost:3000 && electron .\""`
   `"electron:build": "vite build && electron-builder"`
5. Run `npm run electron:build` to generate the `.exe` (Windows) or `.dmg` (Mac) installer in a new `dist_electron` folder.

---

## 2. Manual Installation Instructions (Step-by-Step)

If you prefer to run the application manually from the source code, follow these exact keyboard and mouse steps.

### Phase 1: Install Prerequisites (Node.js)
1. **Mouse Click**: Open your web browser (Chrome, Edge, Safari).
2. **Keyboard Type**: Click the address bar, type `https://nodejs.org`, and press **Enter**.
3. **Mouse Click**: Click the button that says **"Download Node.js (LTS)"**.
4. **Mouse Click**: Once downloaded, click the installer file (e.g., `node-v20...-x64.msi` or `.pkg`) to open it.
5. **Mouse Click**: Click **"Next"** through the installation wizard. Accept the license agreement, leave all default settings as they are, and click **"Install"**.
6. **Mouse Click**: Click **"Finish"** when done.

### Phase 2: Open the Project Folder
**For Windows:**
1. **Mouse Click**: Open "File Explorer" and navigate to the folder where you extracted the project code.
2. **Mouse Click**: Click on the empty space in the address bar at the top of the File Explorer window.
3. **Keyboard Type**: Type `cmd` and press **Enter**. A black command prompt window will appear.

**For Mac:**
1. **Mouse Click**: Open "Finder" and navigate to the folder where you extracted the project code.
2. **Mouse Click**: Right-click on the folder name at the bottom path bar (or click the gear icon) and select **"New Terminal at Folder"**.

### Phase 3: Install Dependencies & Run
1. **Keyboard Type**: In the terminal window, type `npm install` and press **Enter**.
2. *Wait*: You will see a progress bar. Wait until it finishes and returns you to the command prompt.
3. **Keyboard Type**: Type `npm run dev` and press **Enter**.
4. *Wait*: The terminal will display text saying `VITE ready in...` and show a local URL (usually `http://localhost:3000`).
5. **Mouse Click**: Open your web browser.
6. **Keyboard Type**: Click the address bar, type `http://localhost:3000`, and press **Enter**.
7. **Mouse Click**: The app will load. Click "Start Camera" to begin!

---

## 3. Network & Internet Accessibility (LAN / WiFi / Online)

The application is configured to listen on all network interfaces (`0.0.0.0`). This means it is automatically accessible from other devices on your local network or the internet when deployed.

### Accessing on your Local Network (LAN/WiFi)
1. Find your host computer's local IP address (e.g., `192.168.1.100`).
   - **Windows**: Open Command Prompt, type `ipconfig`, and look for "IPv4 Address".
   - **Mac**: Open Terminal, type `ipconfig getifaddr en0` (or `en1`).
2. On your other device (phone, tablet, laptop), open a web browser and navigate to `http://<YOUR_LOCAL_IP>:3000`.

**⚠️ IMPORTANT: Webcam Access on Local Network**
Modern web browsers strictly require a secure connection (`HTTPS`) to grant webcam access. If you access the app via `http://192.168...`, the browser will **block** the camera.
To test the camera on another device locally, you have two options:
- **Option A (Tunnels - Recommended)**: Use a tool like [ngrok](https://ngrok.com/) (`npx ngrok http 3000`) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) to generate a secure `https://` URL that tunnels to your local machine.
- **Option B (Local SSL)**: Install a local SSL certificate for your Vite server using the `@vitejs/plugin-basic-ssl` plugin.

### Deploying Online (Internet)
When deploying to a live web server (like Vercel, Netlify, Render, or a VPS):
1. Run the build command: `npm run build`.
2. Upload the contents of the generated `dist/` folder to your web host.
3. Ensure your web host provides an SSL certificate (HTTPS). The app will automatically work globally and request camera permissions securely.

---

## 4. Codebase Architecture & Structure

This project is a modern frontend web application. It uses a component-based architecture with a clear separation between UI rendering, 3D scene management, and AI computer vision processing.

### Tech Stack
* **Framework**: React 19 (UI components, state management)
* **Build Tool**: Vite (Fast bundling, local development server)
* **3D Engine**: Three.js (WebGL rendering, custom shaders, procedural geometry)
* **Computer Vision**: MediaPipe Tasks Vision (Real-time hand landmark detection)
* **Styling**: Tailwind CSS (Utility-first CSS framework)

### Directory Structure

```text
/
├── index.html                 # Main HTML entry point.
├── package.json               # Project metadata, scripts, and npm dependencies.
├── vite.config.ts             # Vite bundler configuration.
├── tsconfig.json              # TypeScript compiler configuration.
├── setup-windows.bat          # Automated startup script for Windows.
├── setup-mac.command          # Automated startup script for macOS/Linux.
├── TECH_DOC.md                # This technical documentation file.
│
├── src/                       # Source code directory (mapped to root in this flat structure)
│   ├── index.tsx              # React application entry point. Mounts <App /> to the DOM.
│   ├── index.css              # Global stylesheet containing Tailwind CSS imports.
│   ├── App.tsx                # Root React component. Manages global state (audio, camera).
│   ├── types.ts               # Global TypeScript interfaces and enums (e.g., Gesture enum).
│   │
│   ├── components/            # React UI and 3D Components
│   │   ├── CameraFeed.tsx     # Handles the hidden <video> element for webcam capture.
│   │   ├── Controls.tsx       # UI overlay (Start button, audio toggles, instructions).
│   │   └── DiscoScene.tsx     # The core 3D environment. Contains all Three.js logic:
│   │                          # - Procedural horse generation
│   │                          # - Custom GLSL shaders for particles
│   │                          # - Lighting, shadows, and animation loop
│   │
│   └── services/              # Singleton services for external APIs/Logic
│       ├── audioService.ts    # Web Audio API wrapper. Handles beat detection and frequency analysis.
│       └── visionService.ts   # MediaPipe wrapper. Processes video frames to detect hand gestures.
```

### Architecture Flow
1. **Initialization**: `App.tsx` mounts and requests camera permissions. It also manages global state like `hudOpacity` and the `isStarted` flag.
2. **Vision Processing**: A hidden `<video>` element streams webcam data to `visionService.ts`, which runs the MediaPipe WASM model to extract hand coordinates and classify gestures (Fist, Palm, Victory).
3. **Audio Processing**: `audioService.ts` analyzes the playing audio track, calculating volume and detecting beats using the Web Audio API `AnalyserNode`.
4. **Calibration & Tracking**: The raw camera feed captures a wide area, but users typically keep their hands in the center. The app maps a central "active zone" (15%-85% horizontally, 20%-80% vertically) of the camera feed to the full screen. This re-calibration ensures the character and HUD cursor can reach the edges of the screen without the user having to stretch their arms uncomfortably. The HUD hand tracking circle uses CSS `clamp()` functions to ensure the UI element never overflows or gets clipped by the game window boundaries.
5. **3D Rendering & HUD**: `DiscoScene.tsx` runs a continuous `requestAnimationFrame` loop. Every frame, it polls `visionService` for the latest gesture/position and `audioService` for the latest volume/beat. It updates the Three.js scene (horse position, particle sizes, floor colors) and renders the frame to the `<canvas>`. It also directly updates the DOM position of the Hand Tracking Circle in the HUD for high-performance visual feedback.
6. **HUD Controls**: The user can adjust the HUD opacity from the start screen (`Controls.tsx`), which controls the visibility of the camera feed and hand tracking circle. A "Back to Start" button allows users to return to the main menu at any time.
