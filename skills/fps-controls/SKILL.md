# Skill: fps-controls

The first-person controller, collision loop and touch UI are already implemented by
`HARNESS.start`. Your job is to place objects so the implemented controller can walk the room.

## What the runtime does (do not reimplement)

- Eye height 1.62 m, yaw/pitch camera, pitch clamp.
- Desktop: WASD/arrows move, mouse drag looks, Shift sprints.
- Touch: left joystick moves, right look pad looks; the pad is shown only on coarse pointers.
- Collision: `POD.moveWithCollision` against the pod shell and every object passed to
  `ctx.solid`. The player slides along AABBs and cannot leave the pod.
- Reset restores the spawn point and view; Pause stops simulation but keeps rendering; Quality
  cycles Low/Medium/High (pixel ratio 1 / 1.35 / 1.75).
- Resize and orientation change are handled.

Never add keyboard/pointer/touch listeners, a second camera, OrbitControls, PointerLockControls
or a custom animation loop. Never move `ctx.camera` from the app.

## Placement rules

1. **Solid, not decoration.** Call `ctx.solid(obj)` for every object taller than ~0.35 m or wider
   than ~0.5 m that stands on the floor: cabinets, crates, tanks, benches, consoles, large pipes,
   stacked boxes. Decorative wall items, screens, gauges, mugs and labels go through
   `ctx.props.add(obj)` only.
2. **Keep a walkable ring.** The room is ~5.1 m × 4.6 m walkable. Leave at least 0.75 m clear
   between the spawn (0, 1.0) and the console bank (z≈−2.06), and at least 0.65 m between new
   objects and existing furniture. The player radius is 0.27 m.
3. **Ground everything.** A prop's base must be at y=0 unless it is mounted on a wall/ceiling.
   Do not place a group at y=0.6 when its local geometry already starts at y=0.
4. **No giant AABBs.** A group with a long cable, a light shaft or a fish school must not be passed
   to `ctx.solid`; its bounding box would block the room. Only pass the solid furniture group.
5. **Wall objects** must sit just inside the shell (radius ≤2.75) and face the room. Use
   `rotation.y` so the front faces the centre.
6. **Hatch side** (z≈2.4–2.55) is reserved for the hatch and bulkhead; keep a 0.6 m clearance in
   front of it.

## Testing (already available in the page)

`window.__POD` exposes:
- `position`, `rotation`, `paused`, `quality`, `frames`, `colliderCount`
- `key(code, down)` — press/release a key without the real keyboard
- `step(dx, dz)` — one collision-checked move
- `setPosition(x,y,z)`, `setView(yaw,pitch)`, `reset()`, `pause(bool)`, `setQuality(q)`

Mentally walk the route: spawn → forward to console → left around the seats → past the lockers →
hatch → right side → back to spawn. If any new collider blocks that loop or overlaps the spawn,
move the object before returning the code.

## Acceptance

- The camera cannot pass through the shell, consoles, seats, lockers, crates, tanks, railings,
  hatch or your new solid props.
- The player can reach every part of the room and always see a way back.
- No object intersects the camera at spawn.
- Reset returns to (0,1.62,1.0) and yaw 0; Pause freezes motion; Quality changes the label.
