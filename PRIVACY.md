# Privacy Policy — Jump Juice Adventure

**Last updated: 4 August 2026**

## The short version

Jump Juice Adventure collects nothing, sends nothing, and has no servers.
Everything the game remembers stays on your own device.

There is no account, no login, no analytics, no advertising, no tracking, no
crash reporting, and no third-party SDK of any kind.

## What is stored, and where

The game saves your progress in your browser's `localStorage`, under the key
`jja2`, on your device only. It contains:

* your best distance, coins and XP
* which heroes and glow skins you have unlocked, and which hero is selected
* achievement progress, daily mission progress and your login streak
* your fruit inventory and equipped brew
* your settings: sound, volume, vibration, calm mode, battery saver,
  invert steering, daily-modifier toggle and control scheme

This never leaves your device. It is not transmitted anywhere, because there
is nowhere for it to go — the game has no backend.

**To delete it:** clear site data for the page in your browser settings, or
uninstall the app if you added it to your home screen. That erases everything;
there is no copy anywhere else, and no way for anyone (including us) to
recover or inspect it.

## Network access

The game is designed to run fully offline and does so once installed.

The only network request it can make is for the **Space Grotesk** web font
from Google Fonts, which is loaded asynchronously purely for appearance. If it
fails or is blocked, the game falls back to a system font and plays
identically. Requesting a font from Google's servers discloses your IP address
to Google under
[their privacy policy](https://policies.google.com/privacy) — that is the
single third-party contact the game can make. Blocking it costs you nothing
but the typeface.

The offline build in `dist/pwa/` caches the game itself in a service worker so
it runs with no connection at all.

## Permissions

The game requests no permissions. It does not use the camera, microphone,
location, contacts, files, clipboard, or Bluetooth.

It uses two device features, both without any permission prompt and both
switchable off in Pause ▸ Settings:

* **Vibration** — short haptic taps on landings and hits (`vib`)
* **Audio** — sound effects and music, generated on your device with WebAudio;
  no audio files are downloaded and nothing is recorded (`snd`)

## Children

The game is suitable for all ages. Because it collects no data whatsoever, it
does not knowingly or unknowingly collect personal information from children,
and there is nothing to disclose, sell or share under COPPA, GDPR-K or
equivalent regimes.

## Changes

If this policy ever changes, the updated version will be published with the
game and the date above will change. Since the game collects nothing, any
change would be a reduction in scope or a clarification.

## Contact

Questions about this policy can be raised as an issue on the project
repository.
