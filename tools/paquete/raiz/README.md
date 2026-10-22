# Fab Lab CNC {{VERSION}}

A browser app to mill PCBs and parts on a **Genmitsu Cubiko** (GRBL) desktop CNC: from KiCad Gerber files
(or DXF/SVG drawings, or ready-made G-code) to a finished board, with guided setup, probing, height map,
a 3D twin of the machine, a tutorial and an exam for students.

## Requirements

- **Google Chrome or Microsoft Edge on a computer** (Windows, macOS, Linux). The app talks to the machine over
  USB with Web Serial, which only these browsers support. Safari, Firefox and phones can open the app in
  Simulation mode, but cannot connect to the machine.
- The page must be served over **HTTPS** (or from `localhost`). Web Serial does not work from `file://`
  and the app does not open by double-clicking `index.html`.
- No installation, no server-side code, no account. Nothing is sent anywhere: files you open stay in the
  browser. Fonts load from Google Fonts when online; without internet the app uses system fonts.

## Put it on a website

1. Unzip and upload the whole `fablab-cnc-{{VERSION}}` folder, as it is, to any static web host with HTTPS
   (for example `https://your-site/programs/fablab-cnc/`). Keep the folder structure.
2. Open `https://your-site/programs/fablab-cnc/` — it goes to the app (`cnc/`).

Or clone it with git (the `cnc` branch holds only this app):

    git clone -b cnc --single-branch https://github.com/sebas30073007/fablab-tools.git fablab-cnc

Every path inside is relative, so the folder works under any URL. Each version lives in its own folder,
so a new version can be published next to the old one and the links you already shared keep working.

## Run it on one computer

With Python installed, from inside the unzipped folder:

    python -m http.server 8000

then open <http://localhost:8000/cnc/> in Chrome or Edge.

## Using it

- **Simulation**: try the whole workflow without a machine (Home → Connect → Simulation).
- **Tutorial** and **Exam**: the basic CNC course, at the bottom of Home.
- Open the KiCad folder with the `F_Cu` and `Edge_Cuts` Gerbers and the drill files, or try the
  **Example** board.

## Safety

This software moves a real machine. Wear eye protection, keep hands away from the spindle, never leave the
machine running unattended, and keep the STOP button (or the Esc key) at hand. Check every toolpath in
the preview before cutting.

## About

Fab Lab CNC by Sebastián Méndez · <https://sebs.mx>. See `LICENSE.txt` for the terms of use and
`CHANGELOG.md` for what changed in each version.
