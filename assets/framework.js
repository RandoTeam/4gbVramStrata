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
    renderer.toneMappingExposure = 1.02;
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
    const hull = POD.mat(0x2b3c43, { metalness: 0.62, roughness: 0.46 });
    const hullDark = POD.mat(0x162227, { metalness: 0.55, roughness: 0.55 });
    const trim = POD.mat(0x71878d, { metalness: 0.88, roughness: 0.28 });
    const brass = POD.mat(0xb98a52, { metalness: 0.75, roughness: 0.35 });
    const rubber = POD.mat(0x11191d, { metalness: 0.1, roughness: 0.92 });
    const glass = POD.glassMaterial({ opacity: 0.13 });

    // floor with a radial grating
    const floor = mesh(new T.CylinderGeometry(R, R, 0.16, 40), hullDark, 0, -0.08, 0);
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
    // central drain
    const drain = mesh(new T.CylinderGeometry(0.34, 0.34, 0.03, 24), hullDark, 0, 0.012, 0);
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

    // mullions and rings
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      const m = mesh(new T.BoxGeometry(0.1, H, 0.15), trim,
        Math.sin(a) * (R - 0.03), H / 2, Math.cos(a) * (R - 0.03));
      m.rotation.y = a; m.castShadow = true; pod.add(m);
    }
    for (const y of [0.815, 2.35]) {
      const ring = mesh(new T.TorusGeometry(R - 0.04, 0.055, 6, 64), trim, 0, y, 0);
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

    // ceiling with ribs and practical lamps
    const ceil = mesh(new T.CylinderGeometry(R, R, 0.16, 40), hullDark, 0, H + 0.08, 0);
    pod.add(ceil);
    const hubMat = POD.mat(0x1b282d, { metalness: 0.45, roughness: 0.62 });
    const hub = mesh(new T.CylinderGeometry(0.4, 0.5, 0.2, 20), hubMat, 0, H - 0.03, 0);
    pod.add(hub);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const beam = mesh(new T.BoxGeometry(0.07, 0.09, R - 0.5), trim, Math.sin(a) * (R - 0.5) / 2, H - 0.1, Math.cos(a) * (R - 0.5) / 2);
      beam.rotation.y = a; pod.add(beam);
    }
    const lampMat = POD.glowMat(0xffd09a, 0.8, { roughness: 0.4 });
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const x = Math.sin(a) * 1.15, z = Math.cos(a) * 1.15;
      const housing = mesh(new T.CylinderGeometry(0.17, 0.12, 0.14, 12), hullDark, x, H - 0.02, z);
      pod.add(housing);
      const lamp = mesh(new T.CylinderGeometry(0.1, 0.13, 0.06, 12), lampMat, x, H - 0.11, z);
      pod.add(lamp);
      const rim = mesh(new T.TorusGeometry(0.145, 0.018, 5, 16), trim, x, H - 0.115, z);
      rim.rotation.x = Math.PI / 2; pod.add(rim);
    }
    // ceiling vent with slowly turning blades
    const vent = new T.Group();
    const ventRim = new T.Mesh(new T.TorusGeometry(0.72, 0.035, 6, 28), trim);
    ventRim.rotation.x = Math.PI / 2; vent.add(ventRim);
    for (let i = 0; i < 6; i++) {
      const blade = new T.Mesh(new T.BoxGeometry(0.54, 0.012, 0.1), POD.mat(0x2a3a40, { metalness: 0.55, roughness: 0.5 }));
      blade.position.x = Math.cos(i * Math.PI / 3) * 0.35;
      blade.position.z = Math.sin(i * Math.PI / 3) * 0.35;
      blade.rotation.y = -i * Math.PI / 3;
      vent.add(blade);
    }
    vent.position.set(0, H - 0.18, 0);
    vent.userData.tick = (t) => { vent.rotation.y = t * 0.08; };
    pod.add(vent);

    // rear bulkhead with a working-looking hatch
    const bulk = mesh(new T.BoxGeometry(3.3, H, 0.14), hull, 0, H / 2, 2.58);
    bulk.receiveShadow = true; pod.add(bulk);
    const bulkTrim = mesh(new T.BoxGeometry(3.42, 0.08, 0.18), trim, 0, 2.3, 2.56);
    pod.add(bulkTrim);
    for (const sx of [-1.5, 1.5]) pod.add(mesh(new T.BoxGeometry(0.08, H, 0.18), trim, sx, H / 2, 2.56));

    const hatch = new T.Group();
    const door = mesh(new T.CylinderGeometry(0.46, 0.46, 0.1, 32), POD.mat(0x40565c, { metalness: 0.8, roughness: 0.35 }), 0, 0, 0);
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

    // hatch side gauges and a warning beacon
    for (let i = 0; i < 3; i++) {
      const g = POD.gauge(0.095, 0x9fe8ef);
      g.position.set(-0.95 + i * 0.26, 2.04, 2.49); g.rotation.y = Math.PI;
      pod.add(g);
    }
    const beacon = POD.statusLamp(0xff5b3c, 0.075);
    beacon.position.set(1.22, 2.15, 2.47); pod.add(beacon);
    const beacon2 = POD.statusLamp(0x66ffb0, 0.05);
    beacon2.position.set(1.38, 2.04, 2.47); pod.add(beacon2);

    // ceiling pipes and cables
    const copper = POD.mat(0x9a6b45, { metalness: 0.8, roughness: 0.36 });
    pod.add(POD.pipe([[-2.3, 2.62, 2.35], [-2.55, 2.62, 0.4], [-1.7, 2.62, -2.1], [0.4, 2.62, -2.55]], 0.055, 0x9a6b45));
    pod.add(POD.pipe([[2.4, 2.58, 2.3], [2.6, 2.58, 0.1], [2.1, 2.58, -2.0]], 0.045, 0x6d7f84));
    pod.add(POD.pipe([[-2.7, 2.48, -0.6], [-2.7, 1.0, -0.62]], 0.04, 0x6d7f84));
    for (let i = 0; i < 5; i++) {
      const a = -0.9 + i * 0.42;
      pod.add(POD.pipe([[Math.sin(a) * 2.8, 2.7, Math.cos(a) * 2.8], [Math.sin(a) * 2.55, 2.5, Math.cos(a) * 2.55]], 0.018, 0x222b2f));
    }
    const cable = POD.pipe([[2.55, 2.72, 1.9], [2.35, 2.35, 0.6], [2.1, 1.9, -0.9], [1.7, 1.35, -1.7]], 0.022, 0x11181b);
    cable.material = rubber; pod.add(cable);

    // default furniture: console bank, seats, lockers, crates, railings
    const props = ctx.props;
    const solid = (o) => { props.add(o); ctx.solids.add(o); return o; };

    const bank = new T.Group();
    const deskMat = POD.mat(0x263a41, { metalness: 0.5, roughness: 0.5 });
    const top = mesh(new T.BoxGeometry(3.1, 0.09, 0.72), deskMat, 0, 0.92, 0);
    top.castShadow = top.receiveShadow = true; bank.add(top);
    const kick = mesh(new T.BoxGeometry(2.8, 0.86, 0.12), hullDark, 0, 0.43, 0.3);
    bank.add(kick);
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
    // animated screens above the desk
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

    const seatA = POD.seat(0.62, 0.95, 0.6, 0x3c4e55);
    seatA.position.set(-1.05, 0, -1.18); seatA.rotation.y = Math.PI; solid(seatA);
    const seatB = POD.seat(0.62, 0.95, 0.6, 0x3c4e55);
    seatB.position.set(1.05, 0, -1.18); seatB.rotation.y = Math.PI; solid(seatB);

    const lockL = POD.locker(0.78, 2.0, 0.46, 0x35474e);
    lockL.position.set(-2.34, 0, 1.16); lockL.rotation.y = -Math.PI / 2; solid(lockL);
    const lockR = POD.locker(0.78, 2.0, 0.46, 0x35474e);
    lockR.position.set(2.34, 0, 1.16); lockR.rotation.y = Math.PI / 2; solid(lockR);

    const crate1 = mesh(new T.BoxGeometry(0.62, 0.5, 0.52), POD.mat(0x6b5a3e, { roughness: 0.86 }), 2.1, 0.25, -0.9);
    crate1.castShadow = crate1.receiveShadow = true; solid(crate1);
    const crate2 = mesh(new T.BoxGeometry(0.48, 0.4, 0.42), POD.mat(0x4e5f45, { roughness: 0.9 }), 2.12, 0.7, -1.0);
    crate2.rotation.y = 0.2; solid(crate2);
    const crate3 = mesh(new T.BoxGeometry(0.4, 0.34, 0.4), POD.mat(0x6a4a3a, { roughness: 0.9 }), 2.16, 0.17, -0.28);
    solid(crate3);

    const railL = POD.railing(1.35, 0.92, 0x8fa4a8);
    railL.position.set(-2.25, 0, -0.55); railL.rotation.y = Math.PI / 2; solid(railL);
    const railR = POD.railing(1.35, 0.92, 0x8fa4a8);
    railR.position.set(2.25, 0, -0.55); railR.rotation.y = Math.PI / 2; solid(railR);

    // wall pipes behind the lockers and a fire extinguisher
    const ext = new T.Group();
    ext.add(mesh(new T.CylinderGeometry(0.09, 0.1, 0.5, 12), POD.mat(0xa63b32, { metalness: 0.35, roughness: 0.5 }), 0, 0.28, 0));
    ext.add(mesh(new T.CylinderGeometry(0.03, 0.03, 0.14, 8), brass, 0, 0.58, 0));
    ext.position.set(-2.52, 0, -0.15); props.add(ext);

    // metal backing panels behind the lockers, so they do not float on glass
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
    // a life-support cabinet on the port side
    const support = new T.Group();
    support.add(mesh(new T.BoxGeometry(0.42, 1.05, 0.55), POD.mat(0x2a3c42, { metalness: 0.55, roughness: 0.5 }), 0, 0.525, 0));
    support.add(mesh(new T.BoxGeometry(0.36, 0.3, 0.02), POD.mat(0x1d2b30, { roughness: 0.7 }), 0, 0.7, 0.285));
    support.add(mesh(new T.BoxGeometry(0.28, 0.02, 0.02), POD.glowMat(0x5ee8d8, 0.9), 0, 0.78, 0.3));
    for (let i = 0; i < 4; i++) support.add(mesh(new T.BoxGeometry(0.3, 0.022, 0.02), POD.mat(0x4d6469, { metalness: 0.5 }), 0, 0.18 + i * 0.07, 0.3));
    support.add(POD.gauge(0.08, 0x8fe8ef));
    support.children[support.children.length - 1].position.set(0.09, 0.92, 0.3);
    support.add(mesh(new T.CylinderGeometry(0.055, 0.055, 0.04, 10), POD.glowMat(0xff5b3c, 1.2), -0.1, 0.94, 0.3));
    support.position.set(-2.52, 0, -0.75);
    support.rotation.y = Math.PI / 2;
    solid(support);

    // tool board, life ring and first-aid box on the bulkhead
    const board = new T.Group();
    board.add(mesh(new T.BoxGeometry(1.05, 0.72, 0.05), POD.mat(0x1d2b30, { roughness: 0.85 }), 0, 0, 0));
    const peg = POD.mat(0x4b6168, { metalness: 0.3, roughness: 0.8 });
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
      board.add(mesh(new T.SphereGeometry(0.012, 5, 4), peg, -0.4 + i * 0.2, -0.22 + j * 0.22, -0.03));
    }
    const toolMat = POD.mat(0x9fb2b6, { metalness: 0.85, roughness: 0.3 });
    const wrench = new T.Group();
    wrench.add(mesh(new T.BoxGeometry(0.035, 0.3, 0.02), toolMat, 0, 0, 0));
    for (const sy of [-1, 1]) {
      const jaw = new T.Mesh(new T.TorusGeometry(0.045, 0.012, 5, 10, Math.PI), toolMat);
      jaw.rotation.z = sy > 0 ? Math.PI : 0; jaw.position.y = sy * 0.15; wrench.add(jaw);
    }
    wrench.position.set(-0.34, -0.02, -0.045); wrench.rotation.z = 0.2; board.add(wrench);
    const hammer = new T.Group();
    hammer.add(mesh(new T.BoxGeometry(0.03, 0.3, 0.02), POD.mat(0x6b4a2e, { roughness: 0.8 }), 0, 0, 0));
    hammer.add(mesh(new T.BoxGeometry(0.16, 0.05, 0.05), toolMat, 0, 0.15, 0));
    hammer.position.set(-0.08, -0.02, -0.05); hammer.rotation.z = -0.15; board.add(hammer);
    for (let i = 0; i < 3; i++) {
      board.add(mesh(new T.BoxGeometry(0.022, 0.18, 0.018), POD.mat([0xd05a3a, 0x4f9fd0, 0xd0b03a][i], { roughness: 0.5 }),
        0.2 + i * 0.06, -0.02, -0.045));
    }
    board.add(mesh(new T.BoxGeometry(0.2, 0.26, 0.012), POD.mat(0xc8d6d2, { roughness: 0.9 }), 0.42, 0.03, -0.04));
    board.position.set(-1.72, 1.62, 2.495);
    props.add(board);

    const lifeRing = new T.Group();
    lifeRing.add(new T.Mesh(new T.TorusGeometry(0.21, 0.055, 8, 22), POD.mat(0xd06a32, { roughness: 0.72 })));
    for (let i = 0; i < 4; i++) {
      const band = new T.Mesh(new T.TorusGeometry(0.21, 0.058, 8, 6, 0.5), POD.mat(0xe8e2d0, { roughness: 0.7 }));
      band.rotation.z = i * Math.PI / 2 + 0.2; lifeRing.add(band);
    }
    lifeRing.position.set(1.62, 1.72, 2.48); props.add(lifeRing);

    const aid = new T.Group();
    aid.add(mesh(new T.BoxGeometry(0.34, 0.26, 0.11), POD.mat(0xc9c3b4, { roughness: 0.7 }), 0, 0, 0));
    aid.add(mesh(new T.BoxGeometry(0.2, 0.05, 0.012), POD.mat(0xc03a30, { roughness: 0.6 }), 0, 0.02, -0.06));
    aid.add(mesh(new T.BoxGeometry(0.05, 0.2, 0.012), POD.mat(0xc03a30, { roughness: 0.6 }), 0, 0.02, -0.06));
    aid.position.set(1.72, 2.42, 2.5); props.add(aid);

    // oxygen bottles and a bench by the hatch
    const tankMat = POD.mat(0x5a7d4f, { metalness: 0.55, roughness: 0.45 });
    const tanks = new T.Group();
    for (const x of [-0.16, 0.16]) {
      tanks.add(mesh(new T.CylinderGeometry(0.11, 0.11, 0.82, 14), tankMat, x, 0.44, 0));
      tanks.add(mesh(new T.SphereGeometry(0.11, 12, 8), tankMat, x, 0.85, 0));
      tanks.add(mesh(new T.CylinderGeometry(0.025, 0.025, 0.1, 8), brass, x, 0.94, 0));
      tanks.add(mesh(new T.TorusGeometry(0.055, 0.012, 5, 10), brass, x, 0.98, 0));
    }
    tanks.position.set(2.2, 0, 2.15); solid(tanks);

    const bench = new T.Group();
    bench.add(mesh(new T.BoxGeometry(1.0, 0.09, 0.36), POD.mat(0x35464d, { roughness: 0.7 }), 0, 0.43, 0));
    bench.add(mesh(new T.BoxGeometry(0.9, 0.3, 0.08), POD.mat(0x28383e, { roughness: 0.8 }), 0, 0.27, -0.15));
    for (const x of [-0.4, 0.4]) bench.add(mesh(new T.BoxGeometry(0.06, 0.42, 0.3), trim, x, 0.21, 0));
    bench.position.set(-1.55, 0, 2.28); solid(bench);
    const mug = mesh(new T.CylinderGeometry(0.045, 0.04, 0.09, 10), POD.mat(0xd8cfae, { roughness: 0.6 }), -1.3, 0.52, 2.22);
    props.add(mug);
    const mugHandle = new T.Mesh(new T.TorusGeometry(0.035, 0.01, 5, 8), mug.material);
    mugHandle.position.set(-1.24, 0.52, 2.22); mugHandle.rotation.y = Math.PI / 2; props.add(mugHandle);

    // pendant lamp over the console bank
    const pendant = new T.Group();
    pendant.position.set(0, 2.9, -1.45);
    pendant.add(mesh(new T.CylinderGeometry(0.008, 0.008, 0.46, 6), rubber, 0, -0.23, 0));
    pendant.add(mesh(new T.ConeGeometry(0.21, 0.17, 18, 1, true), POD.mat(0x2f4a45, { metalness: 0.5, roughness: 0.5, side: T.DoubleSide }), 0, -0.5, 0));
    pendant.add(mesh(new T.SphereGeometry(0.05, 10, 8), POD.glowMat(0xffd9a0, 2.0), 0, -0.57, 0));
    props.add(pendant);
    pendant.userData.tick = (t) => { pendant.rotation.z = Math.sin(t * 0.5) * 0.018; };

    // caustic light pool on the floor
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

    // ready-made side stations (the model can add more with ctx.station)
    buildSideStation(ctx, -1, -0.45, 0x64e8ff);
    buildSideStation(ctx, 1, -0.45, 0xffb35c);

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
    const sand = new T.Mesh(seabed, POD.mat(0x24383a, { roughness: 0.98, metalness: 0 }));
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
    const nearSchool = POD.fishSchool(10, [3.2, 1.2, 2.6], 0xa8e6ff);
    nearSchool.position.set(4.2, 1.9, -3.8);
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
    root.add(sub);
    root.userData.sub = sub;

    // light shafts from the surface
    const shafts = [];
    for (let i = 0; i < 7; i++) {
      const s = POD.lightShaft(0x9fe8ff, 1.2 + rnd() * 2.4, 22);
      s.position.set(-16 + i * 5.2, 8, -10 - rnd() * 14);
      s.material.opacity = 0.035 + rnd() * 0.03;
      s.rotation.z = (rnd() - 0.5) * 0.2;
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
