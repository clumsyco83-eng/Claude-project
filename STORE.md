# Store copy — Jump Juice Adventure

Ready-to-paste listing text. Character counts are noted where stores enforce
them. Nothing here claims a feature the game does not have.

---

## Name

**Jump Juice Adventure**

Short name (home screen, 12 char limit): `Jump Juice`

## Subtitle / tagline

* **30 chars:** `Fill the meter. Go further.`
* **45 chars:** `Fill the meter, trigger Juice Mode, run on.`
* **80 chars:** `An endless runner across seven worlds — each with its own boss and its own music.`

## Short description (Google Play, 80 chars)

`Fill the meter, trigger JUICE MODE, and run as far as seven worlds allow.`

## Full description

> **Fill the meter. Trigger JUICE MODE. Go further.**
>
> Jump Juice Adventure is an endless runner built around one moment: the
> instant the meter fills and everything goes bright. For twelve seconds you
> are invincible, you jump forever, you hit twice as hard, and the ground
> shakes when you land. Then it ends, and you have to earn it again.
>
> **Seven worlds, seven bosses, seven soundtracks.**
> Forest, mountain, ice, storm, volcano, sky and space — each with its own
> hazards, its own monsters, its own boss, and its own music. The Frost Titan
> throws splinters in the ice. The Storm Drake rides the thunder. The Cloud
> Kraken nests above the clouds. Every fight runs three escalating phases and
> ends the same honest way: dodge the dive, then stomp the glowing core.
>
> **34 heroes, and they actually feel different.**
> Bolt runs 25% faster but burns Juice Mode quicker. Frost slows every enemy
> by nearly half. Inferno walks through fire and sets the ground alight on
> every landing. Squid takes your first hit for you. Pick one and the run
> changes shape.
>
> **Brew your own Juice.**
> Fruit drops as you run. Spend it in the Juice Lab on Lightning (faster),
> Mega (wider shockwave) or Rainbow (longer, triple orbs) — then spend the
> brew on a run that deserves it.
>
> **Built to be played anywhere.**
> Install it to your home screen and it runs fullscreen with no browser
> around it — and with no connection at all. Works in portrait or landscape.
> Gestures or on-screen buttons, your choice.
>
> No ads. No purchases. No account. No tracking. Nothing is collected, and
> nothing leaves your device.

## Feature bullets

* Seven worlds, each with its own boss, monsters, hazards and soundtrack
* JUICE MODE — 12 seconds of invincibility, infinite jumps and double damage
* 34 heroes with passives that genuinely change how a run plays
* Juice Lab: collect fruit, brew three juices that reshape Juice Mode
* Four three-phase bosses per rotation with a fair, readable weak-point window
* 15 awards, daily missions, a daily modifier and a login streak
* Play in portrait or landscape, with gestures or on-screen buttons
* Installs to your home screen and plays completely offline
* No ads, no in-app purchases, no accounts, no tracking

## Categories

Primary: **Games ▸ Arcade**
Secondary: **Games ▸ Action**

Content rating: suitable for all ages. Cartoon monsters, no blood, no
realistic violence, no text chat, no user-generated content, no purchases,
no ads, no data collection.

## Keywords (100 chars, comma-separated)

`endless runner,platformer,arcade,offline,jump,retro,pixel,boss,no ads,casual`

## What's new (release notes for this version)

> **Every world now has its own boss and its own music.**
> Three new bosses join the roster — the Frost Titan in the ice, the Storm
> Drake in the storm and the Cloud Kraken in the sky — so the fight always
> belongs to the place it happens in. Each of the seven worlds also gets its
> own key, tempo and instrumentation, with a dedicated boss theme over the
> top.
>
> Jump Juice can now be installed to your home screen and played completely
> offline.
>
> Fixes: heroes with fire immunity were also shrugging off ice and lightning;
> boss projectiles all drew as the same fireball regardless of who threw them.

## Screenshots

Generated into `dist/pwa/shots/` by `node test/build-pwa.mjs`, and per-boss
captures live in `shots4/`. Suggested order for a listing:

1. Juice Mode at full tilt (the hook — lead with this)
2. A boss fight in the stun window, STOMP prompt visible
3. The hero roster
4. The Juice Lab
5. Two contrasting worlds side by side (ice and volcano)

## Assets

| Asset | Where |
|---|---|
| App icon, all sizes | `dist/pwa/icons/` |
| Maskable icon (Android adaptive) | `dist/pwa/icons/maskable-512.png` |
| iOS launch images | `dist/pwa/splash/` |
| Wide + narrow store screenshots | `dist/pwa/shots/` |
| Privacy policy | `PRIVACY.md` |

## Honest limitations to keep in mind before listing

* The game has **not been tested on real iPhone or Android hardware** — all
  mobile verification was Chromium device emulation. Do a device pass before
  any public listing.
* A store listing (as opposed to PWA install) needs a wrapper: Bubblewrap/TWA
  for Play, Capacitor for the App Store. The PWA build is the input to both.
* All text is English only.
