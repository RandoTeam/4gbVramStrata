// Scene framework for the single-file underwater pod.
// Supplies everything that is expensive to get right in one answer: renderer,
// graded lighting, the pod shell, the exterior world, first-person controls,
// collision, touch UI, pause/reset/quality and a boot sequence.
// The app module calls HARNESS.start({...}) and adds interior detail.
// Uses the global THREE namespace and the POD asset pack. No network, no assets.

const HARNESS = (() => {
  const T = THREE;
  const R = 3.05;          // pod radius
  const H = 2.9;           // interior height
  const EYE = 1.62;        // eye height
  const QNAMES = ['Low', 'Medium', 'High'];

  const state = {
    renderer: null, scene: null, camera: null, rig: null,
    pod: null, exterior: null, props: null, solids: null,
    colliders: [], bounds: { minX: -2.55, maxX: 2.55, minZ: -2.35, maxZ: 2.25 },
    spawn: new T.Vector3(0, EYE, 1.0), yaw: 0, pitch: 0,
    paused: false, quality: 2, ready: false, frames: 0,
    clock: null, app: null, ctx: null,
  };
  const keys = Object.create(null);
  const touch = {
    move: { active: false, id: null, x: 0, y: 0, dx: 0, dy: 0 },
    look: { active: false, id: null, x: 0, y: 0 },
  };
  const look = { down: false, id: null, x: 0, y: 0 };
  let yaw = 0, pitch = 0, walkPhase = 0;
  let bootDone = false, frameCb = [], qualityCb = [];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ── environment ────────────────────────────────────────────────────────
  function envTexture() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#b9ecff');
    grad.addColorStop(0.34, '#2b8fa8');
    grad.addColorStop(0.62, '#0b3d4e');
    grad.addColorStop(1, '#02141c');
    g.fillStyle = grad; g.fillRect(0, 0, 512, 256);
    const sun = g.createRadialGradient(360, 52, 4, 360, 52, 90);
    sun.addColorStop(0, 'rgba(255,255,245,.95)');
    sun.addColorStop(0.25, 'rgba(190,245,255,.45)');
    sun.addColorStop(1, 'rgba(120,220,255,0)');
    g.fillStyle = sun; g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = 'rgba(160,240,255,' + (0.02 + Math.random() * 0.05) + ')';
      g.fillRect(Math.random() * 512, 0, 1 + Math.random() * 3, 256);
    }
    const tex = new T.CanvasTexture(c);
    tex.mapping = T.EquirectangularReflectionMapping;
    tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }

  function cameraFov() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    return aspect < 0.8 ? 82 : 68;
  }

  function makeRenderer(canvas) {
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    return renderer;
  }

  function mesh(geo, material, x = 0, y = 0, z = 0) {
    const m = new T.Mesh(geo, material);
    m.position.set(x, y, z);
    return m;
  }

  // A ready-made wall station: the model only picks a side and a colour.
  // Orientation, grounding, screen facing and collision are handled here.
  function buildSideStation(ctx, side = -1, z = -0.35, color = 0x64e8ff) {
    const g = new T.Group();
    const unit = POD.consoleUnit(0.6, 0.72, 0.34, color);
    unit.rotation.y = Math.PI;
    g.add(unit);
    const scr = POD.screen(0.4, 0.24, color, side < 0 ? 'wave' : 'bars');
    scr.position.set(0, 1.12, 0.2);
    g.add(scr);
    const lampA = POD.statusLamp(color, 0.03);
    lampA.position.set(-0.2, 0.82, 0.19); g.add(lampA);
    const lampB = POD.statusLamp(0xffb35c, 0.025);
    lampB.position.set(0.2, 0.82, 0.19); g.add(lampB);
    g.add(POD.box(0.68, 0.035, 0.3, POD.mat(0x31454c, { metalness: 0.6, roughness: 0.45 }), 0, 0.78, 0.04));
    const mug = POD.cyl(0.035, 0.032, 0.08, POD.mat(0xd8cfae, { roughness: 0.6 }), 0.24, 0.84, 0.08, 10);
    g.add(mug);
    g.position.set(side * 2.42, 0, z);
    g.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    ctx.solid(g);
    return g;
  }

  // A reef cluster already snapped to the seabed, so nothing floats in midwater.
  function buildReef(ctx, angle = 0, distance = 7, seed = 1) {
    const r = POD.rng(seed * 977 + Math.round(angle * 100));
    const g = new T.Group();
    const rock = POD.rock(seed, 1.2 + r() * 1.4, 0x2b3a3a);
    rock.position.set(0, 0.25, 0);
    g.add(rock);
    for (let i = 0; i < 2; i++) {
      const coral = POD.coral(seed * 3 + i, [0xff7f8f, 0xffb066, 0x7f9dff][i], 2.0 + r() * 1.4);
      coral.position.set((r() - 0.5) * 2.2, 0, (r() - 0.5) * 2.2);
      g.add(coral);
      const kelp = POD.kelp(seed * 5 + i, i ? 0x2f8f5b : 0x4a9a6a, 4.0 + r() * 2.2);
      kelp.position.set((r() - 0.5) * 2.4, 0, (r() - 0.5) * 2.4);
      g.add(kelp);
    }
    g.position.set(Math.sin(angle) * distance, -4.9, Math.cos(angle) * distance);
    ctx.exterior.add(g);
    return g;
  }

  // ── pod shell ─────────────────────────────────────────────────────────
  function buildShell(ctx) {
    const pod = ctx.pod;
    const hull = POD.mat(0x3a4d54, { metalness: 0.6, roughness: 0.46 });
    const hullDark = POD.mat(0x1b2a30, { metalness: 0.5, roughness: 0.6 });
    const trim = POD.mat(0x69797e, { metalness: 0.72, roughness: 0.36 });
    const brass = POD.mat(0xb98a52, { metalness: 0.75, roughness: 0.35 });
    const rubber = POD.mat(0x11191d, { metalness: 0.1, roughness: 0.92 });
    const rivetMat = POD.mat(0x7e9399, { metalness: 0.85, roughness: 0.32 });
    const glass = POD.glassMaterial({ opacity: 0.13 });
    // One fixed saturated material: an oxblood cushion. The plan palette moves
    // every other surface, but the seats have to stay the warm anchor the eye
    // lands on from the hatch, and a palette-driven seat turns green or pink.
    const seatColor = 0x7a3742;

    // floor with a radial grating
    const deck = POD.mat(0x33454c, { metalness: 0.55, roughness: 0.6, surface: 'floor' });
    const floor = mesh(new T.CylinderGeometry(R, R, 0.16, 40), deck, 0, -0.08, 0);
    floor.receiveShadow = true; pod.add(floor);
    const grateMat = POD.mat(0x3e5158, { metalness: 0.8, roughness: 0.4 });
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      const beam = mesh(new T.BoxGeometry(0.045, 0.025, R * 1.92), grateMat,
        Math.sin(a) * R * 0.48, 0.008, Math.cos(a) * R * 0.48);
      beam.rotation.y = a; pod.add(beam);
    }
    for (const rr of [0.95, 1.85, 2.72]) {
      const ring = mesh(new T.TorusGeometry(rr, 0.018, 5, 48), grateMat, 0, 0.01, 0);
      ring.rotation.x = Math.PI / 2; pod.add(ring);
    }
    // deck lights: a ring of pucks set into the plating, pulsing slowly. The
    // reference deck reads as a working floor because it is lit from below the
    // grating, not because it has more polygons.
    const deckLampMat = POD.glowMat(0xffb877, 0.8, { roughness: 0.5 });
    const deckLights = new T.Group();
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5 + Math.PI / 10;
      const x = Math.sin(a) * (i % 2 ? 2.46 : 1.32), z = Math.cos(a) * (i % 2 ? 2.46 : 1.32);
      const puck = mesh(new T.CylinderGeometry(0.055, 0.06, 0.022, 10), deckLampMat, x, 0.028, z);
      deckLights.add(puck);
      const trim = mesh(new T.CylinderGeometry(0.072, 0.075, 0.016, 10), brass, x, 0.024, z);
      deckLights.add(trim);
    }
    deckLights.userData.tick = (t) => {
      deckLampMat.emissiveIntensity = 0.55 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.35));
    };
    pod.add(deckLights);
    // central drain
    const drainMat = POD.mat(0x24343b, { metalness: 0.72, roughness: 0.46, surface: 'brushed' });
    const drain = mesh(new T.CylinderGeometry(0.34, 0.34, 0.03, 24), drainMat, 0, 0.012, 0);
    // bolts round the drain ring so the deck reads as plates, not one sheet
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5;
      pod.add(mesh(new T.SphereGeometry(0.022, 6, 5), rivetMat,
        Math.sin(a) * 0.44, 0.026, Math.cos(a) * 0.44));
    }
    pod.add(drain);
    for (let i = 0; i < 8; i++) {
      const s = mesh(new T.BoxGeometry(0.03, 0.02, 0.28), brass, 0, 0.03, 0.16);
      s.rotation.y = i * Math.PI / 4; pod.add(s);
    }

    // hull bands: below and above the glass
    const band = (h, y) => {
      const m = mesh(new T.CylinderGeometry(R, R, h, 40, 1, true), hull, 0, y, 0);
      m.material = hull.clone(); m.material.side = T.DoubleSide;
      m.receiveShadow = true;
      pod.add(m);
    };
    band(0.82, 0.41);
    band(0.55, 2.625);
    // inner wainscot detail
    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI / 12;
      const rib = mesh(new T.BoxGeometry(0.035, 0.72, 0.05), trim,
        Math.sin(a) * (R - 0.05), 0.42, Math.cos(a) * (R - 0.05));
      rib.rotation.y = a; pod.add(rib);
    }

    // glass band all round
    const glassBand = mesh(new T.CylinderGeometry(R - 0.01, R - 0.01, 1.55, 40, 1, true), glass, 0, 1.575, 0);
    glassBand.renderOrder = 6; glassBand.name = 'glass';
    pod.add(glassBand);

    // window framing: eight bays with thick pilasters, a deep sill and bolt
    // lines. Thin mullions made the room read as a fish tank, and the sill is
    // the horizontal the eye uses to measure the room.
    const sillRing = new T.Mesh(new T.RingGeometry(R - 0.2, R - 0.005, 48, 1), trim);
    sillRing.rotation.x = -Math.PI / 2; sillRing.position.y = 0.835;
    sillRing.receiveShadow = true; pod.add(sillRing);
    const sillLip = mesh(new T.TorusGeometry(R - 0.2, 0.026, 5, 56), trim, 0, 0.835, 0);
    sillLip.rotation.x = Math.PI / 2; pod.add(sillLip);
    const bay = Math.PI * 2 / 8;
    for (let i = 0; i < 8; i++) {
      const a = i * bay;
      const px = Math.sin(a) * (R - 0.045), pz = Math.cos(a) * (R - 0.045);
      const pillar = mesh(new T.BoxGeometry(0.32, 2.66, 0.2), hull, px, 1.35, pz);
      pillar.rotation.y = a; pillar.castShadow = true; pod.add(pillar);
      // bright inner edge so the pillar separates from the dark hull
      const edge = mesh(new T.BoxGeometry(0.03, 2.6, 0.045), trim,
        Math.sin(a) * (R - 0.135), 1.35, Math.cos(a) * (R - 0.135));
      edge.rotation.y = a; pod.add(edge);
      // two bolt lines up the inner face
      for (let b = 0; b < 7; b++) {
        const y = 0.55 + b * 0.32;
        for (const s of [-1, 1]) {
          pod.add(mesh(new T.SphereGeometry(0.017, 6, 5), rivetMat,
            Math.sin(a) * (R - 0.15) + Math.cos(a) * 0.095 * s, y,
            Math.cos(a) * (R - 0.15) - Math.sin(a) * 0.095 * s));
        }
      }
      // gusset under the sill: a small brace at every pillar foot
      const gus = mesh(new T.BoxGeometry(0.06, 0.12, 0.16), trim,
        Math.sin(a) * (R - 0.16), 0.76, Math.cos(a) * (R - 0.16));
      gus.rotation.y = a; gus.rotation.x = 0.5; pod.add(gus);
    }
    // The upper band is painted steel, not polished: at trim metalness it became
    // the brightest line in every wide shot and pulled the eye off the room.
    const bandMat = POD.mat(0x4c6168, { metalness: 0.62, roughness: 0.44 });
    for (const [y, tube, m] of [[0.8, 0.05, trim], [2.35, 0.045, bandMat]]) {
      const ring = mesh(new T.TorusGeometry(R - 0.065, tube, 6, 64), m, 0, y, 0);
      ring.rotation.x = Math.PI / 2; pod.add(ring);
    }

    // subtle window streaks
    const streak = document.createElement('canvas');
    streak.width = 64; streak.height = 256;
    const sg = streak.getContext('2d');
    const lg = sg.createLinearGradient(0, 0, 0, 256);
    lg.addColorStop(0, 'rgba(180,245,255,0)');
    lg.addColorStop(0.42, 'rgba(200,250,255,.24)');
    lg.addColorStop(1, 'rgba(180,245,255,0)');
    sg.fillStyle = lg; sg.fillRect(0, 0, 64, 256);
    const stex = new T.CanvasTexture(streak);
    stex.colorSpace = T.SRGBColorSpace;
    const smat = new T.MeshBasicMaterial({ map: stex, transparent: true, opacity: 0.5,
      depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7 + 0.26;
      const s = mesh(new T.PlaneGeometry(0.34, 2.4), smat,
        Math.sin(a) * (R - 0.02), 1.6, Math.cos(a) * (R - 0.02));
      s.rotation.y = a + Math.PI; pod.add(s);
    }

    // ceiling: a panelled dome with dark ribs, a small vent and a hub light.
    // Bright radial beams made it read as a tent; on a real ceiling the ribs
    // are darker than the panels and the detail lives in the seams.
    const ceilMat = POD.mat(0x33464d, { metalness: 0.38, roughness: 0.74 });
    const ceilSeam = POD.mat(0x141f24, { metalness: 0.4, roughness: 0.7 });
    const ceil = mesh(new T.CylinderGeometry(R, R, 0.16, 40), ceilMat, 0, H + 0.08, 0);
    ceil.receiveShadow = true; pod.add(ceil);
    // a cool perimeter cove so the ceiling reads as a lit surface, not a void
    const ceilStrip = new T.Mesh(new T.TorusGeometry(R - 0.28, 0.032, 6, 56),
      POD.glowMat(0xa8f0ff, 0.2, { roughness: 0.5 }));
    ceilStrip.rotation.x = Math.PI / 2;
    ceilStrip.position.y = H - 0.07;
    pod.add(ceilStrip);
    // concentric and radial seams, plus eight dark ribs that tie into them
    for (const rr of [1.0, 1.8]) {
      const s = mesh(new T.TorusGeometry(rr, 0.013, 4, 56), ceilSeam, 0, H - 0.006, 0);
      s.rotation.x = Math.PI / 2; pod.add(s);
    }
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const seam = mesh(new T.BoxGeometry(0.03, 0.014, R - 0.55), ceilSeam,
        Math.sin(a) * (R - 0.55) / 2, H - 0.005, Math.cos(a) * (R - 0.55) / 2);
      seam.rotation.y = a; pod.add(seam);
      const rib = mesh(new T.BoxGeometry(0.08, 0.05, R - 0.9), hullDark,
        Math.sin(a) * (R - 0.9) / 2, H - 0.045, Math.cos(a) * (R - 0.9) / 2);
      rib.rotation.y = a; pod.add(rib);
      const lip = mesh(new T.BoxGeometry(0.012, 0.018, R - 0.9), trim,
        Math.sin(a) * (R - 0.9) / 2, H - 0.012, Math.cos(a) * (R - 0.9) / 2);
      lip.rotation.y = a; pod.add(lip);
    }
    // hub plate with a grille and a warm downlight
    const hubMat = POD.mat(0x1b282d, { metalness: 0.45, roughness: 0.62 });
    const hub = mesh(new T.CylinderGeometry(0.36, 0.42, 0.14, 20), hubMat, 0, H - 0.06, 0);
    pod.add(hub);
    const grilleMat = POD.mat(0x0f191d, { roughness: 0.8 });
    for (let i = 0; i < 5; i++) {
      const bar = mesh(new T.BoxGeometry(0.62, 0.012, 0.022), grilleMat, 0, H - 0.135, 0);
      bar.rotation.y = i * Math.PI / 5; pod.add(bar);
    }
    const hubLamp = mesh(new T.CylinderGeometry(0.075, 0.095, 0.035, 14),
      POD.glowMat(0xffb877, 0.16, { roughness: 0.62 }), 0, H - 0.152, 0);
    pod.add(hubLamp);
    const hubHalo = POD.halo(0xffb877, 0.5, 0.11);
    hubHalo.rotation.x = Math.PI / 2; hubHalo.position.set(0, H - 0.2, 0);
    pod.add(hubHalo);
    const hubRim = new T.Mesh(new T.TorusGeometry(0.14, 0.016, 5, 18), hubMat);
    hubRim.rotation.x = Math.PI / 2; hubRim.position.y = H - 0.16; pod.add(hubRim);
    const lampMat = POD.glowMat(0xffd09a, 0.8, { roughness: 0.4 });
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 8;
      const x = Math.sin(a) * 1.5, z = Math.cos(a) * 1.5;
      const housing = mesh(new T.CylinderGeometry(0.17, 0.12, 0.14, 12), hullDark, x, H - 0.02, z);
      pod.add(housing);
      const lamp = mesh(new T.CylinderGeometry(0.1, 0.13, 0.06, 12), lampMat, x, H - 0.11, z);
      pod.add(lamp);
      const rim = new T.Mesh(new T.TorusGeometry(0.145, 0.018, 5, 16), trim, x, H - 0.115, z);
      rim.rotation.x = Math.PI / 2; pod.add(rim);
    }
    // ceiling vent, hugging the ceiling and small enough to read as a fitting
    const vent = new T.Group();
    const ventRim = new T.Mesh(new T.TorusGeometry(0.42, 0.026, 6, 28), hullDark);
    ventRim.rotation.x = Math.PI / 2; vent.add(ventRim);
    const bladeMat = POD.mat(0x2a3a40, { metalness: 0.55, roughness: 0.5 });
    for (let i = 0; i < 5; i++) {
      const blade = new T.Mesh(new T.BoxGeometry(0.34, 0.01, 0.09), bladeMat);
      blade.position.x = Math.cos(i * Math.PI / 5) * 0.19;
      blade.position.z = Math.sin(i * Math.PI / 5) * 0.19;
      blade.rotation.y = -i * Math.PI / 5;
      vent.add(blade);
    }
    vent.position.set(0, H - 0.07, 0);
    vent.userData.tick = (t) => { vent.rotation.y = t * 0.08; };
    pod.add(vent);

    // rear bulkhead with a working-looking hatch
    const bulk = mesh(new T.BoxGeometry(3.3, H, 0.14), hull, 0, H / 2, 2.58);
    bulk.receiveShadow = true; pod.add(bulk);
    // top conduit trim, kept above the wall slots so a hanging prop is not cut
    const bulkTrim = mesh(new T.BoxGeometry(3.42, 0.08, 0.18), trim, 0, 2.76, 2.56);
    pod.add(bulkTrim);
    for (const sx of [-1.5, 1.5]) pod.add(mesh(new T.BoxGeometry(0.08, H, 0.18), trim, sx, H / 2, 2.56));

    // panel seams, rivets and a kick band: without them the bulkhead is one
    // flat 3.3 m sheet and reads as unfinished next to the detailed props
    const seamMat = POD.mat(0x22333a, { metalness: 0.55, roughness: 0.55 });
    for (const sx of [-0.82, 0.82]) {
      pod.add(mesh(new T.BoxGeometry(0.035, 2.56, 0.012), seamMat, sx, 1.34, 2.505));
      for (let i = 0; i < 10; i++) {
        const rivet = new T.Mesh(new T.SphereGeometry(0.016, 6, 5), rivetMat);
        rivet.position.set(sx + 0.045, 0.24 + i * 0.25, 2.505);
        pod.add(rivet);
      }
    }
    pod.add(mesh(new T.BoxGeometry(3.3, 0.035, 0.012), seamMat, 0, 1.06, 2.505));
    pod.add(mesh(new T.BoxGeometry(3.3, 0.035, 0.012), seamMat, 0, 2.28, 2.505));
    // lower kick band and two recessed vent grilles
    pod.add(mesh(new T.BoxGeometry(3.3, 0.34, 0.02), POD.mat(0x1a282e, { roughness: 0.8 }), 0, 0.17, 2.505));
    for (const sx of [-1.05, 1.05]) {
      pod.add(mesh(new T.BoxGeometry(0.44, 0.22, 0.015), POD.mat(0x121d22, { roughness: 0.9 }), sx, 0.42, 2.5));
      for (let i = 0; i < 4; i++) {
        pod.add(mesh(new T.BoxGeometry(0.4, 0.016, 0.02), rivetMat, sx, 0.35 + i * 0.05, 2.505));
      }
    }

    const hatch = new T.Group();
    // Painted steel, not chrome: at metalness 0.8 / roughness 0.35 the door face
    // took the hatch light as one huge white ball and the wheel vanished into it.
    const door = mesh(new T.CylinderGeometry(0.46, 0.46, 0.1, 32), POD.mat(0x3c5259, { metalness: 0.55, roughness: 0.54 }), 0, 0, 0);
    door.rotation.x = Math.PI / 2; hatch.add(door);
    const ring = mesh(new T.TorusGeometry(0.46, 0.06, 8, 36), trim, 0, 0, 0);
    ring.rotation.x = 0; hatch.add(ring);
    const win = mesh(new T.CircleGeometry(0.14, 22), glass, 0, 0, -0.06);
    win.rotation.y = Math.PI; hatch.add(win);
    hatch.add(new T.Mesh(new T.TorusGeometry(0.145, 0.018, 6, 20), trim));
    const hazard = new T.Mesh(new T.TorusGeometry(0.54, 0.012, 5, 36), POD.mat(0xd8a33c, { metalness: 0.4, roughness: 0.5 }));
    hazard.position.z = -0.01; hatch.add(hazard);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      hatch.add(mesh(new T.SphereGeometry(0.018, 6, 5), trim, Math.sin(a) * 0.54, Math.cos(a) * 0.54, -0.02));
    }
    const wheel = new T.Group();
    wheel.add(new T.Mesh(new T.TorusGeometry(0.18, 0.022, 6, 24), brass));
    for (let i = 0; i < 5; i++) {
      const sp = new T.Mesh(new T.BoxGeometry(0.03, 0.36, 0.026), brass);
      sp.rotation.z = i * Math.PI / 5; wheel.add(sp);
    }
    wheel.position.z = -0.1; hatch.add(wheel);
    hatch.position.set(0, 1.15, 2.5);
    pod.add(hatch);
    hatch.children.forEach(c => { c.castShadow = true; });

    // airlock sign
    const signCv = document.createElement('canvas');
    signCv.width = 256; signCv.height = 64;
    const sctx = signCv.getContext('2d');
    sctx.fillStyle = '#07171b'; sctx.fillRect(0, 0, 256, 64);
    sctx.strokeStyle = '#d8a33c'; sctx.lineWidth = 3; sctx.strokeRect(5, 5, 246, 54);
    sctx.fillStyle = '#ffd27a'; sctx.font = '700 24px ui-monospace,monospace';
    sctx.textAlign = 'center'; sctx.textBaseline = 'middle';
    sctx.fillText('AIRLOCK 01', 128, 33);
    const signTex = new T.CanvasTexture(signCv);
    signTex.colorSpace = T.SRGBColorSpace;
    const sign = new T.Mesh(new T.PlaneGeometry(0.62, 0.155),
      new T.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false }));
    sign.position.set(0, 1.84, 2.49); sign.rotation.y = Math.PI;
    pod.add(sign);
    wheel.userData.tick = (t) => { wheel.rotation.z = Math.sin(t * 0.12) * 0.05; };

    // hatch-side beacon. The gauge row that used to sit here is gone: the
    // bulkhead wall slots own that height now, and a fixed row of gauges would
    // collide with whatever the model hangs there.
    const lampCup = POD.mat(0x1a272c, { metalness: 0.55, roughness: 0.5 });
    for (const [x, color, r] of [[-1.24, 0xd23a26, 0.052], [1.24, 0x53e39a, 0.04]]) {
      const cup = mesh(new T.CylinderGeometry(r * 1.5, r * 1.9, 0.05, 12), lampCup, x, 2.15, 2.5);
      cup.rotation.x = Math.PI / 2; pod.add(cup);
      const lamp = POD.statusLamp(color, r);
      lamp.position.set(x, 2.15, 2.47); pod.add(lamp);
    }

    // ceiling pipes and cables
    // A horizontal conduit at ceiling height crossed the dome in every upward
    // view and read as a bar through the glass. The room keeps the wall riser
    // and the clamped drop instead; the horizontal runs are gone.
    pod.add(POD.pipe([[-2.88, 2.55, -0.6], [-2.88, 1.15, -0.62], [-2.84, 0.62, -0.4]], 0.04, 0x6d7f84));
    pod.add(POD.pipe([[-2.8, 2.4, 0.75], [-2.84, 1.2, 0.7]], 0.028, 0x9a6b45));
    const cable = POD.pipe([[2.62, 2.7, 1.9], [2.55, 2.4, 0.6], [2.35, 2.0, -1.2], [2.05, 1.5, -2.1]], 0.016, 0x11181b);
    cable.material = rubber; pod.add(cable);

    // default furniture: console bank, seats, lockers, crates, railings
    const props = ctx.props;
    const solid = (o) => { props.add(o); ctx.solids.add(o); return o; };

    const bank = new T.Group();
    // flat, untextured: a 3 m panel stretches any tiling map into wood grain
    const deskMat = POD.mat(0x3a4f58, { metalness: 0.5, roughness: 0.46, surface: false });
    const top = mesh(new T.BoxGeometry(3.1, 0.09, 0.72), deskMat, 0, 0.92, 0);
    top.castShadow = top.receiveShadow = true; bank.add(top);
    bank.add(mesh(new T.BoxGeometry(3.14, 0.025, 0.76), POD.mat(0x6f858c, { metalness: 0.85, roughness: 0.3 }), 0, 0.985, 0));
    bank.add(mesh(new T.BoxGeometry(3.0, 0.02, 0.02), POD.glowMat(0xffb35c, 0.9), 0, 0.9, -0.36));
    const kickMat = POD.mat(0x2b3d45, { metalness: 0.55, roughness: 0.55, surface: false });
    const kick = mesh(new T.BoxGeometry(2.8, 0.86, 0.12), kickMat, 0, 0.43, 0.3);
    bank.add(kick);
    // panel seams and a warm strip under the desk: the knee space was one black sheet
    for (const x of [-0.94, 0, 0.94]) {
      bank.add(mesh(new T.BoxGeometry(0.02, 0.84, 0.02), POD.mat(0x16232a, { roughness: 0.8, surface: false }), x, 0.43, 0.365));
    }
    bank.add(mesh(new T.BoxGeometry(2.7, 0.02, 0.02), POD.glowMat(0xffb35c, 0.55), 0, 0.06, 0.37));
    bank.add(mesh(new T.BoxGeometry(2.82, 0.03, 0.14), POD.mat(0x5b6f75, { metalness: 0.7, roughness: 0.4 }), 0, 0.875, 0.3));
    for (const x of [-1.45, 1.45]) {
      const leg = mesh(new T.BoxGeometry(0.1, 0.9, 0.6), trim, x, 0.45, 0);
      bank.add(leg);
    }
    for (let i = -1; i <= 1; i++) {
      const cu = POD.consoleUnit(0.72, 0.38, 0.3, i === 0 ? 0x64e8ff : 0xffb35c);
      cu.position.set(i * 0.95, 0.96, -0.06);
      cu.rotation.x = -0.18;
      bank.add(cu);
    }
    // animated screens above the desk, mounted on one instrument spine so they
    // read as an installed console instead of three floating panels
    const spine = mesh(new T.BoxGeometry(2.34, 0.82, 0.1), POD.mat(0x22333b, { metalness: 0.5, roughness: 0.6, surface: false }), 0, 1.32, 0.16);
    bank.add(spine);
    bank.add(mesh(new T.BoxGeometry(2.38, 0.04, 0.13), trim, 0, 1.73, 0.16));
    bank.add(mesh(new T.BoxGeometry(2.38, 0.04, 0.13), trim, 0, 0.92, 0.16));
    for (const x of [-1.16, 1.16]) bank.add(mesh(new T.BoxGeometry(0.05, 0.84, 0.12), trim, x, 1.32, 0.16));
    for (let i = 0; i < 5; i++) {
      bank.add(mesh(new T.BoxGeometry(2.2, 0.012, 0.02), POD.mat(0x3b5259, { metalness: 0.6, roughness: 0.45 }),
        0, 1.62 + i * 0.002, 0.115));
    }
    const s1 = POD.screen(0.72, 0.42, '#5ff0dd', 'wave');
    s1.position.set(-0.72, 1.42, 0.22); bank.add(s1);
    const s2 = POD.screen(0.62, 0.38, '#ffb35c', 'bars');
    s2.position.set(0.62, 1.4, 0.22); s2.rotation.y = 0.08; bank.add(s2);
    const s3 = POD.screen(0.46, 0.46, '#7cd6ff', 'radar');
    s3.position.set(0.02, 1.42, 0.22); bank.add(s3);
    for (let i = 0; i < 3; i++) {
      const lamp = POD.statusLamp(i === 0 ? 0x65ff9c : i === 1 ? 0xffc75c : 0xff5b5b, 0.028);
      lamp.position.set(-1.25 + i * 0.1, 1.03, 0.36); bank.add(lamp);
    }
    // front fascia, vents and a glowing service strip
    const fascia = mesh(new T.BoxGeometry(2.86, 0.58, 0.07), POD.mat(0x1b292f, { metalness: 0.4, roughness: 0.66 }), 0, 0.55, 0.345);
    bank.add(fascia);
    for (let i = 0; i < 7; i++) {
      bank.add(mesh(new T.BoxGeometry(0.34, 0.018, 0.02), POD.mat(0x40575e, { metalness: 0.5, roughness: 0.5 }),
        -0.95 + (i % 3) * 0.95, 0.36 + Math.floor(i / 3) * 0.06, 0.385));
    }
    for (let i = 0; i < 6; i++) {
      bank.add(mesh(new T.BoxGeometry(0.035, 0.035, 0.018),
        POD.glowMat([0x64f0d8, 0xffb35c, 0xff5b5b][i % 3], 1.4), -0.8 + i * 0.32, 0.66, 0.385));
    }
    bank.add(mesh(new T.BoxGeometry(2.7, 0.02, 0.02), POD.glowMat(0x54d8e8, 1.2), 0, 0.28, 0.385));
    // keyboards, a mouse and a throttle
    for (let i = -1; i <= 1; i++) {
      const kb = mesh(new T.BoxGeometry(0.34, 0.018, 0.15), POD.mat(0x1d2b31, { roughness: 0.55 }), i * 0.92, 0.985, 0.14);
      kb.rotation.x = -0.09; bank.add(kb);
      for (let k = 0; k < 6; k++) {
        bank.add(mesh(new T.BoxGeometry(0.042, 0.008, 0.018), POD.mat(0x5d7379, { metalness: 0.3, roughness: 0.5 }),
          i * 0.92 - 0.12 + k * 0.048, 0.996, 0.12));
      }
    }
    const throttle = new T.Group();
    throttle.add(mesh(new T.BoxGeometry(0.12, 0.05, 0.18), POD.mat(0x202f35, { roughness: 0.6 }), 0, 0, 0));
    const lever = mesh(new T.CylinderGeometry(0.015, 0.02, 0.16, 8), brass, 0, 0.1, 0);
    lever.rotation.x = -0.35; throttle.add(lever);
    throttle.add(mesh(new T.SphereGeometry(0.035, 8, 6), POD.mat(0x202f35, { roughness: 0.5 }), 0, 0.18, 0.05));
    throttle.position.set(1.3, 0.99, 0.16); bank.add(throttle);
    bank.position.set(0, 0, -2.06);
    solid(bank);

    const seatA = POD.seat(0.62, 0.95, 0.6, seatColor);
    seatA.position.set(-1.05, 0, -1.12); seatA.rotation.y = 0; solid(seatA);
    const seatB = POD.seat(0.62, 0.95, 0.6, seatColor);
    seatB.position.set(1.05, 0, -1.12); seatB.rotation.y = 0; solid(seatB);

    // Everything else — lockers, crates, bench, tanks, tool board, life support,
    // railings, pendant lamp — is a slot in tools/scene_layout.py and is built by
    // assets/chunks.js, so the model can choose what stands where.

    // metal backing panels behind the side equipment, so wall units do not float on glass
    const backPanelMat = POD.mat(0x223036, { metalness: 0.5, roughness: 0.62 });
    for (const ang of [-1.11, 1.11]) {
      const pg = new T.CylinderGeometry(R - 0.13, R - 0.13, 1.6, 12, 1, true, ang - 0.31, 0.62);
      const panel = new T.Mesh(pg, backPanelMat.clone());
      panel.material.side = T.DoubleSide; panel.position.y = 1.5;
      pod.add(panel);
      for (const y of [0.72, 2.28]) {
        const rail = new T.Mesh(new T.TorusGeometry(R - 0.12, 0.025, 5, 24, 0.62), trim);
        rail.rotation.x = Math.PI / 2; rail.rotation.z = -ang + Math.PI / 2 - 0.31;
        rail.position.y = y; pod.add(rail);
      }
    }

    // recessed service panels and vents along the lower hull
    for (let i = 0; i < 8; i++) {
      const a = 0.62 + i * Math.PI / 4;
      const pnl = new T.Group();
      pnl.add(mesh(new T.BoxGeometry(1.0, 0.44, 0.05), POD.mat(0x1a272c, { metalness: 0.45, roughness: 0.65 }), 0, 0, 0));
      for (let j = 0; j < 3; j++) pnl.add(mesh(new T.BoxGeometry(0.72, 0.022, 0.02), POD.mat(0x4a6168, { metalness: 0.6, roughness: 0.5 }), 0, -0.1 + j * 0.1, 0.035));
      pnl.add(mesh(new T.BoxGeometry(0.16, 0.035, 0.02), POD.glowMat(0xd8a33c, 0.5), 0.36, 0.16, 0.035));
      pnl.position.set(Math.sin(a) * (R - 0.13), 0.4, Math.cos(a) * (R - 0.13));
      pnl.rotation.y = a;
      pod.add(pnl);
    }
    // a life-support stub on the port side is now a slot (workbench / shelf)
    // recessed service panels and vents along the lower hull
    const floorCaustic = new T.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new T.Color(0x58d8d0) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: [
        'uniform float uTime; uniform vec3 uColor; varying vec2 vUv;',
        'void main(){',
        ' vec2 p=vUv*14.0;',
        ' float c=0.0;',
        ' for(int i=0;i<3;i++){',
        '  float f=float(i)+1.0;',
        '  c+=sin(p.x*1.6*f+uTime*0.6*f+sin(p.y*1.4*f-uTime*0.5))*0.5+0.5;',
        '  c+=cos(p.y*1.8*f-uTime*0.52*f+cos(p.x*1.2*f+uTime*0.4))*0.5+0.5;',
        ' }',
        ' c=pow(clamp(c/6.0,0.0,1.0),2.4);',
        ' float r=length(vUv-0.5)*2.0;',
        ' gl_FragColor=vec4(uColor*c*(1.0-smoothstep(0.55,1.0,r))*0.32, c*(1.0-smoothstep(0.55,1.0,r))*0.32);',
        '}'
      ].join('\n'),
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    });
    const pool = mesh(new T.CircleGeometry(2.95, 40), floorCaustic, 0, 0.035, 0);
    pool.rotation.x = -Math.PI / 2;
    pool.userData.tick = (t) => { floorCaustic.uniforms.uTime.value = t; };
    pod.add(pool);

    // dust motes inside the pod
    const dust = POD.particleField(180, [5.2, 2.5, 4.4], 0xbfefff);
    dust.material.size = 0.012; dust.material.opacity = 0.32;
    dust.position.set(0, 1.55, 0);
    dust.userData.tick = (t) => {
      dust.rotation.y = t * 0.008;
      dust.position.y = 1.55 + Math.sin(t * 0.12) * 0.05;
    };
    pod.add(dust);

    // wall colliders: 12 tangent boxes round the pod plus the bulkhead
    const wallMat = new T.MeshBasicMaterial({ visible: false });
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      const w = mesh(new T.BoxGeometry(1.66, H, 0.12), wallMat,
        Math.sin(a) * (R - 0.06), H / 2, Math.cos(a) * (R - 0.06));
      w.rotation.y = a; pod.add(w);
      ctx.colliders.push(new T.Box3().setFromObject(w));
    }
    const bulkBox = new T.Box3(new T.Vector3(-1.7, 0, 2.48), new T.Vector3(1.7, H, 2.66));
    ctx.colliders.push(bulkBox);

    // spawn faces the console bank and the front glass
    return pod;
  }

  // ── exterior ───────────────────────────────────────────────────────────
  function buildExterior(ctx) {
    const root = ctx.exterior;
    const rnd = POD.rng(9137);
    const SEABED = -4.9;
    const seabed = new T.PlaneGeometry(150, 150, 48, 48);
    seabed.rotateX(-Math.PI / 2);
    const p = seabed.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const d = Math.sqrt(x * x + z * z);
      const y = Math.sin(x * 0.23) * Math.cos(z * 0.19) * 0.55 +
        Math.sin(x * 0.07 + z * 0.11) * 0.9 - d * 0.01;
      p.setY(i, y + SEABED);
    }
    seabed.computeVertexNormals();
    const sand = new T.Mesh(seabed, POD.mat(0x2e4448, { roughness: 0.98, metalness: 0 }));
    sand.receiveShadow = true;
    root.add(sand);

    // caustic sheet over the sand
    const causticMat = new T.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new T.Color(0x4fd8d0) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: [
        'uniform float uTime; uniform vec3 uColor; varying vec2 vUv;',
        'void main(){',
        ' vec2 p=vUv*18.0;',
        ' float c=0.0;',
        ' for(int i=0;i<3;i++){',
        '  float f=float(i)+1.0;',
        '  c+=sin(p.x*1.7*f+uTime*0.55*f+sin(p.y*1.3*f-uTime*0.4))*0.5+0.5;',
        '  c+=cos(p.y*1.9*f-uTime*0.47*f+cos(p.x*1.1*f+uTime*0.33))*0.5+0.5;',
        ' }',
        ' c=pow(clamp(c/6.0,0.0,1.0),2.6);',
        ' float edge=smoothstep(0.0,0.12,vUv.x)*smoothstep(1.0,0.88,vUv.x)*smoothstep(0.0,0.12,vUv.y)*smoothstep(1.0,0.88,vUv.y);',
        ' gl_FragColor=vec4(uColor*c*edge*0.5, c*edge*0.5);',
        '}'
      ].join('\n'),
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    });
    const caustics = mesh(new T.PlaneGeometry(60, 60), causticMat, 0, SEABED + 0.08, 0);
    caustics.rotation.x = -Math.PI / 2;
    root.add(caustics);
    root.userData.caustics = causticMat;

    // foreground reef shelves: they put coral and kelp at eye level in the glass
    const shelfAngles = [0.7, 2.5, 4.4, 5.5];
    for (let i = 0; i < shelfAngles.length; i++) {
      const a = shelfAngles[i];
      const d = 5.2 + rnd() * 1.6;
      const shelf = POD.rock(70 + i, 2.2 + rnd() * 1.4, 0x2b3a3a);
      shelf.scale.set(1.4, 0.72, 1.15);
      shelf.position.set(Math.sin(a) * d, -2.45, Math.cos(a) * d);
      shelf.rotation.y = rnd() * 6.28;
      root.add(shelf);
      for (let j = 0; j < 2; j++) {
        const k = POD.kelp(160 + i * 5 + j, j ? 0x2f8f5b : 0x4a9a6a, 4.2 + rnd() * 2.6);
        k.position.set(shelf.position.x + (rnd() - 0.5) * 2.2, -2.3, shelf.position.z + (rnd() - 0.5) * 2.2);
        root.add(k);
        const c = POD.coral(180 + i * 5 + j, [0xff7f8f, 0xffb066, 0x7f9dff][j % 3], 2.2 + rnd() * 1.2);
        c.position.set(shelf.position.x + (rnd() - 0.5) * 2.4, -2.35, shelf.position.z + (rnd() - 0.5) * 2.4);
        root.add(c);
      }
    }

    // rocks in rings, foreground to background
    for (let i = 0; i < 24; i++) {
      const a = rnd() * Math.PI * 2;
      const d = 6.5 + rnd() * 30;
      const size = 0.6 + rnd() * 3.4 * (d < 14 ? 0.8 : 1.3);
      const r = POD.rock(11 + i, size, i % 3 === 0 ? 0x3a4a46 : 0x2b383b);
      r.position.set(Math.sin(a) * d, SEABED + size * 0.3, Math.cos(a) * d);
      r.rotation.y = rnd() * 6.28;
      r.castShadow = d < 14;
      root.add(r);
    }

    // a midground reef wall in front of the pod, so the view has structure
    for (let i = 0; i < 8; i++) {
      const a = Math.PI - 0.85 + i * 0.24 + rnd() * 0.08;
      const d = 12 + rnd() * 6;
      const size = 2.2 + rnd() * 3.2;
      const wall = POD.rock(240 + i, size, i % 2 ? 0x223235 : 0x2a3d3d);
      wall.position.set(Math.sin(a) * d, -2.8 + size * 0.25, Math.cos(a) * d);
      wall.rotation.y = rnd() * 6.28;
      wall.scale.y = 1.25;
      root.add(wall);
    }

    // coral and kelp on the sand
    for (let i = 0; i < 12; i++) {
      const a = rnd() * Math.PI * 2, d = 5.2 + rnd() * 16;
      const c = POD.coral(31 + i, [0xff6f91, 0xffa45c, 0x9a7bff, 0x58e0c0][i % 4], 1.0 + rnd() * 1.8);
      c.position.set(Math.sin(a) * d, SEABED, Math.cos(a) * d);
      c.rotation.y = rnd() * 6.28;
      root.add(c);
    }
    for (let i = 0; i < 18; i++) {
      const a = rnd() * Math.PI * 2, d = 4.2 + rnd() * 12;
      const k = POD.kelp(51 + i, i % 3 ? 0x2f8f5b : 0x4a8f6a, 4.0 + rnd() * 4.0);
      k.position.set(Math.sin(a) * d, SEABED, Math.cos(a) * d);
      k.rotation.y = rnd() * 6.28;
      root.add(k);
    }

    // fish schools at three depths
    const schools = [
      POD.fishSchool(22, [9, 3, 7], 0x8fd7e6),
      POD.fishSchool(16, [6, 2, 5], 0xffc98a),
      POD.fishSchool(26, [14, 4, 10], 0x79b8d6),
    ];
    schools[0].position.set(-6, 2.2, -9);
    schools[1].position.set(7, -1.2, -6);
    schools[2].position.set(2, 6.5, -18);
    schools.forEach(s => root.add(s));
    const nearSchool = POD.fishSchool(8, [2.2, 1.0, 2.0], 0xa8e6ff);
    nearSchool.position.set(5.0, 2.1, -5.2);
    root.add(nearSchool);

    // drifting particles and vent bubbles
    const particles = POD.particleField(900, [40, 18, 40], 0x9fe8ff);
    particles.position.y = 2;
    root.add(particles);
    const particles2 = POD.particleField(260, [14, 8, 14], 0xd7fffa);
    particles2.position.set(2, -2, -4);
    root.add(particles2);
    for (const [x, z] of [[-3.5, -2.2], [4.2, 1.6], [0.8, 5.4]]) {
      const b = POD.bubbleField(110, [1.2, 9, 1.2], 9);
      b.position.set(x, SEABED, z);
      root.add(b);
    }

    // jellyfish drifting through the foreground
    for (const [x, y, z, s, col] of [[-8.2, 2.6, -7.5, 1, 0x8fe8ff], [9.4, 4.4, -11, 1.5, 0xc9a8ff]]) {
      const j = new T.Group();
      const dome = mesh(new T.SphereGeometry(0.5, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        new T.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55,
          transparent: true, opacity: 0.55, roughness: 0.3, depthWrite: false }));
      dome.scale.y = 0.7; j.add(dome);
      const tentGeos = [], tentMats = [];
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI * 2 / 8;
        const pts = [];
        for (let k = 0; k <= 4; k++) pts.push(new T.Vector3(Math.sin(a) * (0.2 + k * 0.02), -k * 0.17, Math.cos(a) * (0.2 + k * 0.02)));
        tentGeos.push(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 5, 0.007, 4, false));
        tentMats.push(POD.dummyMatrix([0, 0, 0], [0, 0, 0], [1, 1, 1]));
      }
      j.add(new T.Mesh(POD.mergeGeometries(tentGeos, tentMats),
        new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4 })));
      j.position.set(x, y, z); j.scale.setScalar(s);
      j.userData.tick = (t) => {
        j.position.y = y + Math.sin(t * 0.33 + x) * 0.35;
        j.position.x = x + Math.sin(t * 0.19 + z) * 0.55;
        j.scale.y = s * (0.94 + 0.08 * Math.sin(t * 1.15 + x));
      };
      root.add(j);
    }

    // a whale silhouette crossing the background
    const whale = new T.Group();
    const whaleMat = POD.mat(0x14252c, { roughness: 0.8, metalness: 0.05 });
    const body = mesh(new T.SphereGeometry(1, 22, 16), whaleMat, 0, 0, 0);
    body.scale.set(5.4, 1.35, 1.65); whale.add(body);
    const head = mesh(new T.SphereGeometry(1, 18, 12), whaleMat, 3.8, -0.1, 0);
    head.scale.set(2.0, 1.0, 1.2); whale.add(head);
    const tail = new T.Group();
    const tailBase = mesh(new T.ConeGeometry(0.7, 2.0, 8), whaleMat, 0, 0, 0);
    tailBase.rotation.z = Math.PI / 2; tail.add(tailBase);
    const fluke = mesh(new T.BoxGeometry(0.25, 2.8, 0.5), whaleMat, -1.1, 0, 0);
    fluke.rotation.z = 0.35; tail.add(fluke);
    tail.position.set(-5.2, 0, 0); whale.add(tail);
    for (const z of [-1.5, 1.5]) {
      const fin = mesh(new T.BoxGeometry(1.7, 0.18, 0.7), whaleMat, 1.6, -0.55, z);
      fin.rotation.z = -0.3; fin.rotation.y = z > 0 ? 0.2 : -0.2; whale.add(fin);
    }
    whale.position.set(-16, 4.2, -27);
    whale.rotation.y = 0.5;
    whale.scale.setScalar(0.9);
    whale.userData.dynamic = true;
    root.add(whale);
    root.userData.whale = whale;
    root.userData.whaleTail = tail;

    // a distant survey submarine with running lights
    const sub = new T.Group();
    const subMat = POD.mat(0x334a52, { metalness: 0.6, roughness: 0.45 });
    const hull = mesh(new T.CylinderGeometry(1.1, 1.1, 6, 20), subMat, 0, 0, 0);
    hull.rotation.z = Math.PI / 2; sub.add(hull);
    const nose = mesh(new T.SphereGeometry(1.1, 18, 12), subMat, 3.0, 0, 0); sub.add(nose);
    const tower = mesh(new T.BoxGeometry(1.6, 1.1, 0.9), subMat, 0.2, 1.2, 0); sub.add(tower);
    const subLamp = POD.statusLamp(0xffd27a, 0.14);
    subLamp.position.set(3.6, 0.1, 0.7); sub.add(subLamp);
    const subLamp2 = POD.statusLamp(0x66f0ff, 0.1);
    subLamp2.position.set(-2.2, 0.9, 0); sub.add(subLamp2);
    sub.position.set(24, 9, -34);
    sub.rotation.y = -0.4;
    sub.userData.dynamic = true;
    root.add(sub);
    root.userData.sub = sub;

    // light shafts from the surface
    const shafts = [];
    for (let i = 0; i < 7; i++) {
      const s = POD.lightShaft(0x9fe8ff, 1.2 + rnd() * 2.4, 22);
      s.position.set(-16 + i * 5.2, 8, -10 - rnd() * 14);
      s.material.opacity = 0.035 + rnd() * 0.03;
      s.rotation.z = (rnd() - 0.5) * 0.2;
      s.userData.dynamic = true;
      root.add(s); shafts.push(s);
    }
    root.userData.shafts = shafts;

    // tall rock spires framing the view
    for (const [x, z, sc] of [[-8.5, -6.5, 1.5], [9.5, -8.0, 1.2], [-12, 5.5, 1.1]]) {
      const spire = POD.rock(97 + Math.round(x * 10), 2.6, 0x223033);
      spire.scale.set(0.7, 2.4, 0.7); spire.position.set(x, -3.2, z);
      root.add(spire);
    }

    return root;
  }

  // ── controls ───────────────────────────────────────────────────────────
  function bindControls(canvas) {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      look.down = true; look.id = e.pointerId;
      look.x = e.clientX; look.y = e.clientY;
      canvas.classList.add('dragging');
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!look.down || e.pointerId !== look.id) return;
      const dx = e.clientX - look.x, dy = e.clientY - look.y;
      look.x = e.clientX; look.y = e.clientY;
      yaw -= dx * 0.0026;
      pitch = clamp(pitch - dy * 0.0026, -1.18, 1.18);
    });
    const endLook = (e) => {
      if (e.pointerId !== look.id) return;
      look.down = false; look.id = null;
      canvas.classList.remove('dragging');
    };
    canvas.addEventListener('pointerup', endLook);
    canvas.addEventListener('pointercancel', endLook);

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; });
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

    const joy = document.getElementById('joy');
    const knob = document.getElementById('knob');
    const pad = document.getElementById('look');
    if (joy) {
      joy.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        touch.move.active = true; touch.move.id = e.pointerId;
        touch.move.x = e.clientX; touch.move.y = e.clientY;
        joy.setPointerCapture(e.pointerId);
      });
      joy.addEventListener('pointermove', (e) => {
        if (!touch.move.active || e.pointerId !== touch.move.id) return;
        const dx = clamp((e.clientX - touch.move.x) / 46, -1, 1);
        const dy = clamp((e.clientY - touch.move.y) / 46, -1, 1);
        touch.move.dx = dx; touch.move.dy = dy;
        if (knob) knob.style.transform = 'translate(' + (dx * 34) + 'px,' + (dy * 34) + 'px)';
      });
      const stop = (e) => {
        if (e.pointerId !== touch.move.id) return;
        touch.move.active = false; touch.move.id = null;
        touch.move.dx = touch.move.dy = 0;
        if (knob) knob.style.transform = 'translate(0,0)';
      };
      joy.addEventListener('pointerup', stop);
      joy.addEventListener('pointercancel', stop);
    }
    if (pad) {
      pad.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        touch.look.active = true; touch.look.id = e.pointerId;
        touch.look.x = e.clientX; touch.look.y = e.clientY;
        pad.setPointerCapture(e.pointerId);
      });
      pad.addEventListener('pointermove', (e) => {
        if (!touch.look.active || e.pointerId !== touch.look.id) return;
        const dx = e.clientX - touch.look.x, dy = e.clientY - touch.look.y;
        touch.look.x = e.clientX; touch.look.y = e.clientY;
        yaw -= dx * 0.004;
        pitch = clamp(pitch - dy * 0.004, -1.18, 1.18);
      });
      const stop = (e) => {
        if (e.pointerId !== touch.look.id) return;
        touch.look.active = false; touch.look.id = null;
      };
      pad.addEventListener('pointerup', stop);
      pad.addEventListener('pointercancel', stop);
    }
  }

  function inputVector() {
    let f = 0, s = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1;
    if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD || keys.ArrowRight) s += 1;
    if (keys.KeyA || keys.ArrowLeft) s -= 1;
    if (touch.move.active) { f += -touch.move.dy; s += touch.move.dx; }
    const len = Math.hypot(f, s);
    if (len > 1) { f /= len; s /= len; }
    return { f, s };
  }

  function stepPlayer(dt) {
    const { f, s } = inputVector();
    const sprint = keys.ShiftLeft || keys.ShiftRight ? 1.6 : 1;
    const speed = 2.15 * sprint;
    const dirX = Math.cos(yaw) * s - Math.sin(yaw) * f;
    const dirZ = -Math.sin(yaw) * s - Math.cos(yaw) * f;
    let dist = Math.hypot(dirX, dirZ) * speed * dt;
    if (dist < 0.00001) return;
    const steps = Math.max(1, Math.ceil(dist / 0.1));
    const dx = dirX * speed * dt / steps, dz = dirZ * speed * dt / steps;
    const cam = state.camera;
    for (let i = 0; i < steps; i++) {
      POD.moveWithCollision(cam.position, dx, dz, 0.27, state.colliders, state.bounds);
      cam.position.y = EYE;
    }
    walkPhase += dist * 7.5;
    cam.position.y = EYE + Math.sin(walkPhase) * 0.012;
  }

  // ── frame loop ─────────────────────────────────────────────────────────
  // Station readout: a fixed survey depth (the pod is on the seabed) plus the
  // live heading and pitch. Cheap DOM writes, throttled to ~8 Hz.
  const readout = { depth: 0, press: 0, hdg: 0, trim: 0, t: -1, el: null };
  function updateReadout(t) {
    if (!readout.el) {
      readout.el = {
        depth: document.getElementById('ro-depth'),
        press: document.getElementById('ro-press'),
        hdg: document.getElementById('ro-hdg'),
        trim: document.getElementById('ro-trim'),
      };
      if (!readout.el.depth) return;
    }
    readout.depth = 24.5 + (state.camera.position.y - EYE) * 2;
    const press = 1.013 + readout.depth / 10.06;
    let hdg = (-yaw * 180 / Math.PI) % 360;
    if (hdg < 0) hdg += 360;
    readout.hdg = Math.round(hdg);
    readout.trim = pitch * 180 / Math.PI;
    if (readout.el.depth) readout.el.depth.textContent = readout.depth.toFixed(1) + ' m';
    if (readout.el.press) readout.el.press.textContent = press.toFixed(2) + ' bar';
    if (readout.el.hdg) readout.el.hdg.textContent = ('00' + readout.hdg).slice(-3) + '\u00b0';
    if (readout.el.trim) readout.el.trim.textContent = (readout.trim < 0 ? '-' : '+')
      + Math.abs(readout.trim).toFixed(1) + '\u00b0';
  }

  function updateCamera() {
    state.camera.rotation.order = 'YXZ';
    state.camera.rotation.set(pitch, yaw, 0);
  }

  function frame() {
    requestAnimationFrame(frame);
    if (!state.clock) return;
    // Large cap + collision substeps: at 5 fps the player still moves at the
    // intended speed instead of crawling because each frame was clamped to 50 ms.
    const dt = Math.min(state.clock.getDelta(), 0.25);
    const t = state.clock.elapsedTime;

    if (!state.paused) {
      stepPlayer(dt);
      if (state.rig) state.rig.update(t);
      updateExterior(t, dt);
      POD.updateLife(state.scene, t);
      POD.tick(state.scene, t);
      for (const cb of frameCb) { try { cb(state.ctx, dt, t); } catch (e) { console.warn('frame hook failed', e); } }
      if (state.app && typeof state.app.update === 'function') state.app.update(state.ctx, dt, t);
    }
    updateCamera();
    state.renderer.render(state.scene, state.camera);
    if (t - readout.t > 0.12) { readout.t = t; updateReadout(t); }
    state.frames++;
    if (!bootDone && state.frames > 2) {
      bootDone = true;
      requestAnimationFrame(() => { if (window.__POD_BOOT) window.__POD_BOOT.done(); });
    }
  }

  function updateExterior(t, dt) {
    const ext = state.exterior;
    if (!ext) return;
    if (ext.userData.caustics) ext.userData.caustics.uniforms.uTime.value = t;
    const whale = ext.userData.whale;
    if (whale) {
      whale.position.x = -16 + Math.sin(t * 0.035) * 7;
      whale.position.z = -27 + Math.cos(t * 0.028) * 3;
      whale.rotation.y = 0.5 + Math.sin(t * 0.035) * 0.12;
      const tail = ext.userData.whaleTail;
      if (tail) tail.rotation.y = Math.sin(t * 0.6) * 0.14;
    }
    const sub = ext.userData.sub;
    if (sub) {
      sub.position.x = 24 + Math.sin(t * 0.02) * 6;
      sub.position.y = 9 + Math.sin(t * 0.11) * 0.4;
    }
    const shafts = ext.userData.shafts;
    if (shafts) for (let i = 0; i < shafts.length; i++) {
      shafts[i].material.opacity = 0.03 + 0.035 * (0.5 + 0.5 * Math.sin(t * 0.22 + i * 1.7));
    }
  }

  // ── quality / UI ───────────────────────────────────────────────────────
  function applyQuality(q) {
    state.quality = clamp(q, 0, 2);
    // Low drops the surface maps: measured 60 -> 41 fps in software GL with
    // them on, so the cheapest quality level has to give that back first.
    if (POD.setSurfaceLevel) POD.setSurfaceLevel(state.quality > 0 ? 1 : 0);
    const pr = [1, 1.35, 1.75][state.quality];
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pr));
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    const label = document.getElementById('quality');
    if (label) label.textContent = (window.innerWidth < 600 ? 'Q: ' : 'Quality: ') + QNAMES[state.quality];
    for (const cb of qualityCb) { try { cb(state.quality); } catch (e) { console.warn('quality hook failed', e); } }
    toast(QNAMES[state.quality] + ' quality');
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg; el.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('on'), 1400);
  }

  function bindUI() {
    const reset = document.getElementById('reset');
    const pause = document.getElementById('pause');
    const quality = document.getElementById('quality');
    if (reset) reset.addEventListener('click', () => resetView());
    if (pause) pause.addEventListener('click', () => setPaused(!state.paused));
    if (quality) quality.addEventListener('click', () => applyQuality((state.quality + 1) % 3));
    window.addEventListener('resize', () => {
      state.renderer.setSize(window.innerWidth, window.innerHeight);
      state.camera.aspect = window.innerWidth / window.innerHeight;
      state.camera.fov = cameraFov();
      state.camera.updateProjectionMatrix();
      applyPixelRatio();
    });
    window.addEventListener('orientationchange', () => setTimeout(() => {
      state.renderer.setSize(window.innerWidth, window.innerHeight);
      state.camera.aspect = window.innerWidth / window.innerHeight;
      state.camera.fov = cameraFov();
      state.camera.updateProjectionMatrix();
    }, 250));
  }

  function applyPixelRatio() {
    const pr = [1, 1.35, 1.75][state.quality];
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pr));
  }

  function setPaused(p) {
    state.paused = !!p;
    const b = document.getElementById('pause');
    if (b) b.textContent = state.paused ? 'Resume' : 'Pause';
    if (state.clock) state.clock.getDelta();
    toast(state.paused ? 'Paused' : 'Running');
  }

  function resetView() {
    state.camera.position.copy(state.spawn);
    state.camera.position.y = EYE;
    yaw = state.yaw; pitch = state.pitch;
    walkPhase = 0;
    for (const k in keys) keys[k] = false;
    touch.move.active = false; touch.look.active = false;
    if (document.getElementById('knob')) document.getElementById('knob').style.transform = 'translate(0,0)';
    setPaused(false);
    updateCamera();
    toast('View reset');
  }

  // ── public start ───────────────────────────────────────────────────────
  function start(config = {}) {
    if (state.ready) return state.ctx;
    const canvas = document.getElementById('c');
    if (!canvas) throw new Error('missing canvas#c');
    state.app = config;
    state.quality = config.quality == null ? 2 : clamp(config.quality, 0, 2);
    state.renderer = makeRenderer(canvas);
    state.scene = new T.Scene();
    state.scene.background = new T.Color(0x041820);
    state.scene.fog = new T.FogExp2(0x062631, 0.031);
    state.scene.environment = envTexture();

    const camera = new T.PerspectiveCamera(cameraFov(), window.innerWidth / window.innerHeight, 0.05, 180);
    camera.position.copy(config.spawn ? new T.Vector3().fromArray(config.spawn) : state.spawn);
    camera.position.y = config.spawn ? camera.position.y : EYE;
    state.camera = camera;
    state.spawn.copy(camera.position);
    state.yaw = config.yaw || 0;
    state.pitch = config.pitch || 0;
    yaw = state.yaw; pitch = state.pitch;

    state.rig = POD.lighting(state.scene, state.quality);
    state.pod = new T.Group(); state.pod.name = 'pod';
    state.exterior = new T.Group(); state.exterior.name = 'exterior';
    state.props = new T.Group(); state.props.name = 'props';
    state.solids = new T.Group(); state.solids.name = 'solids';
    state.scene.add(state.pod, state.exterior);
    state.pod.add(state.props);
    state.props.add(state.solids);

    state.ctx = {
      THREE: T, POD,
      scene: state.scene, camera, renderer: state.renderer, rig: state.rig,
      pod: state.pod, exterior: state.exterior, props: state.props, solids: state.solids,
      bounds: state.bounds, spawn: state.spawn,
      colliders: state.colliders,
      quality: state.quality,
      add(obj, opts = {}) {
        (opts.exterior ? state.exterior : state.props).add(obj);
        if (opts.solid) state.solids.add(obj);
        return obj;
      },
      solid(obj) { state.props.add(obj); state.solids.add(obj); return obj; },
      station(side = -1, z = -0.35, color = 0x64e8ff) { return buildSideStation(state.ctx, side, z, color); },
      reef(angle = 0, distance = 7, seed = 1) { return buildReef(state.ctx, angle, distance, seed); },
      screen: POD.screen, gauge: POD.gauge, lamp: POD.statusLamp,
      toast, onQuality(fn) { qualityCb.push(fn); return ctx(); },
      onFrame(fn) { frameCb.push(fn); return ctx(); },
    };
    const ctx = () => state.ctx;

    // guaranteed baseline: shell and exterior exist before the app adds detail
    try {
      buildShell(state.ctx);
      buildExterior(state.ctx);
      if (typeof config.build === 'function') config.build(state.ctx);
    } catch (err) {
      console.error('scene build failed:', err);
      if (window.__POD_BOOT) window.__POD_BOOT.fail(err && err.message ? err.message : String(err));
      throw err;
    }
    // collect prop colliders once, after the app has placed its furniture
    const propBoxes = POD.collidersFrom(state.solids);
    for (const b of propBoxes) state.colliders.push(b);

    // One draw call per material instead of one per bolt. Colliders are already
    // computed, so baking the static meshes is safe; anything animated is kept.
    if (config.compact !== false) {
      try {
        POD.compactWorld(state.pod);
        POD.compactWorld(state.props);
        POD.compactWorld(state.exterior);
      } catch (err) {
        console.warn('static merge skipped:', err && err.message ? err.message : err);
      }
    }

    bindControls(canvas);
    bindUI();
    applyQuality(state.quality);

    state.clock = new T.Clock();
    state.clock.start();
    state.renderer.render(state.scene, camera);
    state.ready = true;
    requestAnimationFrame(frame);

    window.__POD = {
      get ready() { return state.ready; },
      get position() { return state.camera.position.toArray(); },
      get rotation() { return [yaw, pitch]; },
      get paused() { return state.paused; },
      get quality() { return state.quality; },
      get frames() { return state.frames; },
      get colliderCount() { return state.colliders.length; },
      scene: state.scene, camera: state.camera, renderer: state.renderer,
      spawn: state.spawn.toArray(), bounds: state.bounds,
      setView(y, p) { yaw = y; pitch = clamp(p, -1.18, 1.18); updateCamera(); },
      setPosition(x, y, z) { state.camera.position.set(x, y, z); },
      key(code, down) { keys[code] = !!down; },
      step(dx, dz) { POD.moveWithCollision(state.camera.position, dx, dz, 0.27, state.colliders, state.bounds); },
      reset: resetView,
      pause: setPaused,
      setQuality: applyQuality,
    };
    return state.ctx;
  }

  return {
    start, setPaused, resetView, applyQuality,
    get state() { return state; },
  };
})();
