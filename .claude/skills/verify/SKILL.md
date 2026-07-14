---
name: verify
description: Drive Mid Breath on the iOS simulator to verify changes at runtime — launch, navigate, screenshot, and profile renders with agent-device.
---

# Verifying Mid Breath on the iOS simulator

The dev build (`com.mdnt.brwk`) is normally installed on the booted iPhone
simulator and loads JS from Metro (`curl -s localhost:8081/status` →
`packager-status:running`). No rebuild needed for JS-only changes — just
relaunch the app.

## Handle

```bash
xcrun simctl terminate booted com.mdnt.brwk; xcrun simctl launch booted com.mdnt.brwk
agent-device session list                      # find the active session name (often `default`)
agent-device screenshot out.png --max-size 800 --session default
agent-device react-native dismiss-overlay --session default   # kill the LogBox toast first
```

- `click`/`longpress`/`gesture pan` take LOGICAL POINTS (402x874 on iPhone 17
  Pro). Screenshots downscaled to 800px tall: multiply y by 874/800.
- If `agent-device` errors DEVICE_IN_USE / SESSION_NOT_FOUND, check
  `agent-device session list` — reuse the listed session name.

## Driving a practice session

- Home rows: tap an exercise row → autoplays a guided session (Main).
  "Freestyle" row → config tray → drag the timer dial
  (`gesture pan <x> <y> -80 0` on the ruler) → tap "Start freestyle".
- Freestyle inhale: `agent-device longpress 200 400 4000` (runs ~2.5s real).
- Double-tap (pause/resume) CANNOT be synthesized — two CLI clicks are too
  slow. To observe the paused state instead: background the app
  (`xcrun simctl launch booted com.apple.Preferences`, then relaunch the
  app) — a running guided session auto-pauses.
- The session screen's "← library" exit Pressable swallows synthesized taps
  (full-screen GestureDetector). Exit by killing the app.

## Render profiling (the perf evidence)

```bash
agent-device react-devtools start --session default
xcrun simctl terminate booted com.mdnt.brwk && xcrun simctl launch booted com.mdnt.brwk  # connect
agent-device react-devtools wait --connected --session default
agent-device react-devtools profile start --session default
sleep 10
agent-device react-devtools profile stop --session default
agent-device react-devtools profile rerenders --limit 10 --session default
agent-device react-devtools errors --session default        # JS warnings/errors per component
```

Expected steady-state during a live guided session (post concordia-leaf
refactor, 2026-07): ~1 commit/sec max — SessionClockText / TimerProgressBar
leaves at 1 Hz, ExerciseCenter on phase boundaries only. The session screens
(Main / FreestyleSession) themselves should NOT appear in `rerenders` during
steady breathing; if they do, a per-tick value leaked back into screen-level
state.

## Gotchas

- First-run reset without reinstall: quit app, clear
  `$(xcrun simctl get_app_container booted com.mdnt.brwk data)/Documents/mmkv/`.
- Native launch console: `agent-device open com.mdnt.brwk --relaunch
  --launch-console out.log --session default` (native only; JS console goes
  to Metro).
- A generic "Open debugger to view warnings" LogBox toast appears at launch
  in dev; it covers the bottom chrome in screenshots — dismiss-overlay it.
