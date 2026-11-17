// Composite prop library ("chunks") for the underwater station.
// A chunk is a fully detailed, correctly oriented prop assembled from the POD
// primitives. The model never places individual boxes: it names a chunk and a
// slot, and assets/scene.js puts it on the floor, wall or ceiling.
// Every chunk is authored around its anchor:
//   floor   origin at the floor, geometry grows +Y, front faces +Z
//   wall    origin at the mounting face, geometry grows +Z, top is +Y
//   ceiling origin at the ceiling, geometry grows -Y, front faces +Z
//   water   origin at the anchor point, no ground contact

const CHUNKS = (() => {
  const T = THREE;
  const REG = Object.create(null);

  function reg(name, meta, fn) {
    REG[name] = Object.assign({ name: name, mount: 'floor', size: [1, 1, 1], tags: [], desc: '' }, meta, { fn: fn });
  }

  // ── kit ────────────────────────────────────────────────────────────────
  function palette(o) {
    o = o || {};
    return {
      hull: o.color == null ? 0x35484f : o.color,
      accent: o.accent == null ? 0x64e8ff : o.accent,
      warm: o.warm == null ? 0xffb35c : o.warm,
      seed: o.seed == null ? 1 : o.seed,
    };
  }

  function kit(o) {
    const P = palette(o);
    const root = new T.Group();
    const M = {
      hull: POD.cachedMat(P.hull, { metalness: 0.6, roughness: 0.48 }),
      hull2: POD.cachedMat(P.hull, { metalness: 0.35, roughness: 0.78 }),
      dark: POD.cachedMat(0x1d2b31, { metalness: 0.38, roughness: 0.66 }),
      trim: POD.cachedMat(0x7f9297, { metalness: 0.7, roughness: 0.42 }),
      brass: POD.cachedMat(0xbb8a4e, { metalness: 0.8, roughness: 0.34 }),
      rubber: POD.cachedMat(0x0e1416, { metalness: 0.05, roughness: 0.95 }),
      accent: POD.cachedMat(P.accent, { metalness: 0.4, roughness: 0.42 }),
      // Off-white, not white: under a 1.1 exposure plus emissive accents a pure
      // 0xffffff plate clips to a flat blob. This keeps the paper/plate read
      // while staying inside the tonemapped range.
      white: POD.cachedMat(0x9aa8a3, { metalness: 0.08, roughness: 0.88 }),
      paper: POD.cachedMat(0x646f6a, { metalness: 0.02, roughness: 0.96 }),
      red: POD.cachedMat(0x9c3a2c, { metalness: 0.3, roughness: 0.6 }),
      orange: POD.cachedMat(0xc4581f, { metalness: 0.25, roughness: 0.66 }),
      glow: POD.cachedGlow(P.accent, 1.25),
      warm: POD.cachedGlow(P.warm, 1.3),
      ledR: POD.cachedGlow(0xff5b4a, 1.6),
      ledG: POD.cachedGlow(0x6cffab, 1.4),
    };
    const rnd = POD.rng((P.seed * 2654435761) >>> 0);
    const k = {
      P: P, M: M, root: root, rnd: rnd,
      b(w, h, d, m, x, y, z, ry) {
        const e = POD.box(w, h, d, m, x || 0, y || 0, z || 0);
        if (ry) e.rotation.y = ry;
        root.add(e); return e;
      },
      c(rt, rb, h, m, x, y, z, seg) {
        const e = POD.cyl(rt, rb, h, m, x || 0, y || 0, z || 0, seg || 12);
        root.add(e); return e;
      },
      s(r, m, x, y, z) {
        const e = POD.sphere(r, m, x || 0, y || 0, z || 0, 10);
        root.add(e); return e;
      },
      t(r, tube, m, x, y, z, rx, ry) {
        const e = new T.Mesh(new T.TorusGeometry(r, tube, 6, 20), m);
        e.position.set(x || 0, y || 0, z || 0);
        if (rx) e.rotation.x = rx;
        if (ry) e.rotation.y = ry;
        root.add(e); return e;
      },
      screen(w, h, color, kind, x, y, z, ry) {
        const e = POD.screen(w, h, color, kind);
        e.position.set(x, y, z);
        if (ry) e.rotation.y = ry;
        root.add(e); return e;
      },
      sign(text, w, h, x, y, z, ry, opts) {
        const e = POD.sign(text, w, h, opts);
        e.position.set(x, y, z);
        if (ry) e.rotation.y = ry;
        root.add(e); return e;
      },
      glow(color, size, x, y, z, op) {
        const e = POD.halo(color, size, op == null ? 0.42 : op);
        e.position.set(x, y, z);
        root.add(e); return e;
      },
      lamp(color, r, x, y, z) {
        const m = color === 'r' ? M.ledR : color === 'g' ? M.ledG : color === 'w' ? M.warm : M.glow;
        k.s(r, m, x, y, z);
        k.glow(m.color ? m.color.getHex() : 0x64e8ff, r * 14, x, y, z + 0.01, 0.3);
      },
      pipe(points, r, m) {
        const e = POD.pipe(points, r, m || M.dark);
        root.add(e); return e;
      },
      // A rivet line: tiny spheres merge into the same material.
      rivets(n, w, h, m, x, y, z) {
        for (let i = 0; i < n; i++) {
          k.s(0.012, m, x + (i / Math.max(1, n - 1) - 0.5) * w, y, z);
        }
      },
      vents(n, w, h, m, x, y, z) {
        for (let i = 0; i < n; i++) k.b(w, h, 0.012, m, x, y + i * (h * 2.1), z);
      },
      done(size, solid) {
        root.userData.size = size || [1, 1, 1];
        root.userData.solid = !!solid;
        return root;
      },
    };
    return k;
  }

  // ── storage ────────────────────────────────────────────────────────────
  reg('locker-double', {
    mount: 'floor', size: [1.5, 2.42, 0.75], tags: ['storage'],
    desc: 'Two full-height lockers, vent slats, handles, stencil labels, boots and a helmet on top',
  }, function (o) {
    const k = kit(o), M = k.M;
    k.b(1.46, 2.0, 0.52, M.hull, 0, 1.0, 0.26);
    k.b(1.5, 0.07, 0.56, M.trim, 0, 2.02, 0.26);
    k.b(1.5, 0.06, 0.56, M.dark, 0, 0.03, 0.26);
    for (const sx of [-0.37, 0.37]) {
      k.b(0.69, 1.78, 0.03, M.hull2, sx, 1.03, 0.53);
      // dark gasket: a recessed shadow line round the leaf
      k.b(0.03, 1.82, 0.012, M.dark, sx - 0.355, 1.03, 0.548);
      k.b(0.03, 1.82, 0.012, M.dark, sx + 0.355, 1.03, 0.548);
      k.b(0.73, 0.03, 0.012, M.dark, sx, 1.94, 0.548);
      k.b(0.73, 0.03, 0.012, M.dark, sx, 0.12, 0.548);
      k.b(0.05, 0.14, 0.04, M.trim, sx + 0.27, 1.05, 0.56);
      k.vents(5, 0.42, 0.012, M.dark, sx, 0.32, 0.55);
      k.b(0.3, 0.05, 0.014, M.accent, sx, 1.72, 0.55);
      k.sign(sx < 0 ? 'A-01' : 'A-02', 0.2, 0.06, sx, 1.52, 0.555, 0, { fg: '#bff3f1', border: '#3d6a72' });
      k.rivets(6, 0.62, 0, M.trim, sx, 0.12, 0.545);
    }
    k.b(1.1, 0.08, 0.36, M.hull2, 0, 2.09, 0.25);
    k.b(0.16, 0.05, 0.02, M.ledG, 0.3, 2.13, 0.42);
    // the lockers are seen from the side most of the time, so the side panels
    // get an inset plate, a front-edge seam and a stencil instead of one flat slab
    for (const sx of [-1, 1]) {
      const x = sx * 0.738;
      k.b(0.012, 1.86, 0.44, M.hull2, x, 1.02, 0.26);
      k.b(0.02, 1.92, 0.035, M.trim, x, 1.01, 0.505);
      k.b(0.02, 1.92, 0.035, M.trim, x, 1.01, 0.02);
      k.b(0.016, 0.36, 0.02, M.dark, x, 0.55, 0.2);
      k.b(0.016, 0.36, 0.02, M.dark, x, 0.55, 0.32);
      const st = k.sign('A-0' + (sx < 0 ? '1' : '2'), 0.26, 0.08, x + sx * 0.008, 1.62, 0.26,
        sx * Math.PI / 2, { fg: '#bff3f1', border: '#3d6a72' });
      st.position.x = x + sx * 0.01;
    }
    // boots and a dive helmet on top read as "someone works here"
    k.b(0.13, 0.26, 0.24, M.dark, -0.42, 0.13, 0.62);
    k.b(0.13, 0.26, 0.24, M.dark, -0.24, 0.13, 0.62);
    const helmet = k.s(0.15, M.orange, 0.36, 2.25, 0.3);
    helmet.scale.set(1, 0.9, 1.02);
    const visor = k.c(0.075, 0.075, 0.03, M.trim, 0.36, 2.25, 0.44, 14);
    visor.rotation.x = Math.PI / 2;
    k.t(0.078, 0.011, M.brass, 0.36, 2.25, 0.452, 0, 0);
    k.c(0.12, 0.14, 0.05, M.trim, 0.36, 2.15, 0.3, 14);
    k.b(0.05, 0.05, 0.03, M.glow, 0.36, 2.3, 0.44);
    k.sign('DIVE LOCKERS', 0.6, 0.11, 0, 1.92, 0.56, 0, { fg: '#ffd27a' });
    return k.done([1.5, 2.3, 0.7], true);
  });

  reg('locker-gear', {
    mount: 'floor', size: [0.85, 2.0, 0.65], tags: ['storage'],
    desc: 'One open locker with shelves, gloves, a wetsuit hood and a name plate',
  }, function (o) {
    const k = kit(o), M = k.M;
    k.b(0.82, 1.98, 0.5, M.hull, 0, 0.99, 0.25);
    k.b(0.86, 0.06, 0.54, M.trim, 0, 2.0, 0.25);
    k.b(0.86, 0.05, 0.54, M.dark, 0, 0.025, 0.25);
    // door ajar
    const door = new T.Group();
    const d = POD.box(0.78, 1.8, 0.03, M.hull2, 0.39, 1.05, 0.02);
    door.add(d);
    door.add(POD.box(0.04, 0.14, 0.05, M.trim, 0.72, 1.05, 0.06));
    door.position.set(-0.4, 0, 0.5);
    door.rotation.y = -0.42;
    k.root.add(door);
    k.b(0.7, 0.04, 0.4, M.dark, 0.39, 1.55, 0.24);
    k.b(0.7, 0.04, 0.4, M.dark, 0.39, 0.95, 0.24);
    k.b(0.34, 0.16, 0.26, M.orange, 0.3, 0.2, 0.24);
    k.b(0.3, 0.12, 0.26, M.dark, 0.5, 1.62, 0.25);
    k.b(0.22, 0.2, 0.2, M.white, 0.36, 1.02, 0.26);
    k.sign('HARRIS', 0.26, 0.07, 0.4, 1.86, 0.52, 0, { fg: '#cfe8e6', border: '#3d6a72' });
    k.lamp('g', 0.022, 0.1, 1.75, 0.52);
    return k.done([0.95, 2.1, 0.95], true);
  });

  reg('crate-stack', {
    mount: 'floor', size: [1.15, 1.2, 0.85], tags: ['storage'],
    desc: 'Three strapped crates, a tarp, stencilled codes and a toolbox on top',
  }, function (o) {
    const k = kit(o), M = k.M;
    const crate = (w, h, d, m, x, y, z, ry) => {
      k.b(w, h, d, m, x, y, z, ry);
      k.b(w + 0.02, 0.05, d + 0.02, M.dark, x, y + h * 0.28, z, ry);
      k.b(w + 0.02, 0.05, d + 0.02, M.dark, x, y - h * 0.28, z, ry);
      for (const sx of [-1, 1]) k.b(0.04, h, 0.04, M.trim, x + sx * (w / 2 - 0.03), y, z + d / 2, ry);
    };
    crate(0.78, 0.5, 0.6, M.hull2, -0.1, 0.25, 0.1, 0.06);
    crate(0.6, 0.4, 0.5, M.orange, 0.16, 0.72, 0.04, -0.12);
    crate(0.44, 0.32, 0.4, M.hull, -0.34, 1.08, 0.12, 0.2);
    k.b(0.5, 0.02, 0.34, M.rubber, 0.1, 0.52, 0.02, 0.1);
    k.b(0.26, 0.18, 0.3, M.trim, 0.34, 1.33, 0.1, 0.1);
    k.b(0.04, 0.02, 0.3, M.dark, 0.34, 1.43, 0.1);
    k.sign('FRAGILE', 0.28, 0.08, 0.16, 0.72, 0.3, 0, { fg: '#ffd27a', bg: '#3a2a12' });
    k.sign('S-114', 0.2, 0.06, -0.12, 0.34, 0.41, 0.06, { fg: '#bff3f1', border: '#3d6a72' });
    return k.done([1.15, 1.5, 0.85], true);
  });

  reg('shelf-unit', {
    mount: 'floor', size: [1.25, 1.9, 0.5], tags: ['storage'],
    desc: 'Four-shelf steel rack with boxes, sample jars, a rope coil and canisters',
  }, function (o) {
    const k = kit(o), M = k.M;
    for (const sx of [-0.58, 0.58]) {
      k.b(0.05, 1.88, 0.05, M.trim, sx, 0.94, 0.06);
      k.b(0.05, 1.88, 0.05, M.trim, sx, 0.94, 0.44);
      k.b(0.06, 0.04, 0.42, M.dark, sx, 0.02, 0.25);
    }
    for (const y of [0.28, 0.72, 1.16, 1.6, 1.86]) {
      k.b(1.24, 0.04, 0.46, M.hull, 0, y, 0.25);
    }
    k.b(0.3, 0.26, 0.3, M.hull2, -0.35, 0.43, 0.24);
    k.b(0.26, 0.2, 0.26, M.orange, -0.33, 0.92, 0.22);
    k.b(0.2, 0.34, 0.2, M.white, 0.36, 0.9, 0.24);
    for (let i = 0; i < 3; i++) {
      k.c(0.05, 0.05, 0.18, M.glow, 0.34 + i * 0.13, 1.25, 0.24, 8);
      k.c(0.05, 0.05, 0.03, M.trim, 0.34 + i * 0.13, 1.35, 0.24, 8);
    }
    k.t(0.16, 0.045, M.brass, 0.3, 1.72, 0.24, Math.PI / 2, 0);
    k.t(0.11, 0.04, M.rubber, 0.3, 1.72, 0.25, Math.PI / 2, 0);
    k.b(0.34, 0.22, 0.28, M.dark, -0.32, 1.71, 0.24);
    k.sign('SPARES', 0.36, 0.09, -0.32, 1.82, 0.39, 0, { fg: '#ffd27a' });
    k.sign('B-07', 0.16, 0.05, 0.4, 1.5, 0.44, 0, { fg: '#bff3f1', border: '#3d6a72' });
    return k.done([1.25, 1.95, 0.55], true);
  });

  reg('workbench', {
    mount: 'floor', size: [1.5, 1.75, 0.7], tags: ['work'],
    desc: 'Workbench: vise, tool tray, parts, pegboard back, task lamp and a stool',
  }, function (o) {
    const k = kit(o), M = k.M;
    k.b(1.46, 0.08, 0.68, M.hull, 0, 0.92, 0.34);
    k.b(1.4, 0.05, 0.62, M.dark, 0, 0.86, 0.34);
    for (const sx of [-0.64, 0.64]) {
      k.b(0.07, 0.9, 0.06, M.trim, sx, 0.46, 0.08);
      k.b(0.07, 0.9, 0.06, M.trim, sx, 0.46, 0.6);
      k.b(0.3, 0.05, 0.06, M.trim, sx, 0.14, 0.34);
    }
    k.b(1.2, 0.24, 0.03, M.dark, 0, 0.24, 0.3);
    // vise
    k.b(0.2, 0.12, 0.18, M.trim, -0.42, 1.03, 0.3);
    k.b(0.08, 0.2, 0.08, M.brass, -0.42, 1.13, 0.3);
    // parts and tools on the top
    k.b(0.3, 0.06, 0.2, M.hull2, 0.15, 0.99, 0.3);
    for (let i = 0; i < 4; i++) k.c(0.02, 0.02, 0.09, M.trim, 0.06 + i * 0.06, 1.03, 0.3, 6);
    k.b(0.04, 0.03, 0.26, M.trim, 0.44, 1.0, 0.32, 0.4);
    k.c(0.06, 0.05, 0.12, M.orange, 0.2, 1.02, 0.48, 8);
    // back board and lamp
    k.b(1.3, 0.62, 0.04, M.hull2, 0, 1.42, 0.04);
    for (let i = 0; i < 4; i++) k.b(0.03, 0.4, 0.02, M.trim, -0.5 + i * 0.16, 1.42, 0.07);
    k.c(0.012, 0.012, 0.5, M.trim, 0.62, 1.62, 0.12, 6);
    k.c(0.1, 0.16, 0.12, M.dark, 0.62, 1.38, 0.16, 10);
    k.s(0.05, M.warm, 0.62, 1.32, 0.16);
    k.glow(0xffb35c, 0.55, 0.62, 1.3, 0.2, 0.32);
    k.sign('WORK ORDER 114', 0.5, 0.1, 0, 1.62, 0.075, 0, { fg: '#bff3f1', border: '#3d6a72' });
    return k.done([1.55, 1.75, 0.72], true);
  });

  reg('tool-wall', {
    mount: 'wall', size: [1.2, 1.0, 0.16], tags: ['work', 'wall'],
    desc: 'Pegboard with wrench, hammer, screwdrivers, tape, rag and a stencil',
  }, function (o) {
    const k = kit(o), M = k.M;
    k.b(1.24, 1.0, 0.05, M.dark, 0, 0, 0.025);
    k.b(1.16, 0.92, 0.02, M.hull2, 0, 0, 0.06);
    for (let i = 0; i < 9; i++) for (let j = 0; j < 7; j++) {
      k.s(0.012, M.dark, -0.5 + i * 0.125, -0.34 + j * 0.11, 0.075);
    }
    // wrench
    k.b(0.04, 0.34, 0.02, M.trim, -0.4, 0.06, 0.09);
    k.t(0.05, 0.014, M.trim, -0.4, 0.25, 0.09, 0, 0);
    // hammer
    k.b(0.03, 0.3, 0.02, M.hull2, -0.2, 0.0, 0.09);
    k.b(0.16, 0.05, 0.045, M.trim, -0.2, 0.16, 0.09);
    // screwdrivers
    for (let i = 0; i < 3; i++) k.b(0.03, 0.22, 0.02, i === 1 ? M.orange : M.accent, 0.03 + i * 0.06, -0.04, 0.09);
    // tape and rag
    k.t(0.06, 0.025, M.warm, 0.32, 0.12, 0.09, 0, 0);
    k.b(0.18, 0.2, 0.012, M.paper, 0.32, -0.16, 0.08);
    k.sign('TOOLS', 0.34, 0.08, 0.05, 0.38, 0.08, 0, { fg: '#ffd27a' });
    return k.done([1.25, 1.0, 0.2], false);
  });

  // ── pipes, cables, power ──────────────────────────────────────────────
  reg('pipe-valve', {
    mount: 'wall', size: [0.5, 1.9, 0.34], tags: ['pipe', 'wall'],
    desc: 'Vertical pipe with brackets, a big valve wheel, pressure gauge and drip',
  }, function (o) {
    const k = kit(o), M = k.M;
    k.b(0.32, 1.9, 0.05, M.dark, 0, 0, 0.025);
    k.c(0.055, 0.055, 1.86, M.trim, 0, 0, 0.13, 12);
    k.c(0.075, 0.075, 0.08, M.hull, 0, 0.55, 0.13, 12);
    k.c(0.075, 0.075, 0.08, M.hull, 0, -0.55, 0.13, 12);
    k.b(0.3, 0.04, 0.06, M.hull, 0, 0.86, 0.08);
    k.b(0.3, 0.04, 0.06, M.hull, 0, -0.86, 0.08);
    // valve
    k.t(0.18, 0.022, M.brass, 0, 0.35, 0.22, 0, 0);
    for (let i = 0; i < 5; i++) {
      const spoke = k.b(0.03, 0.34, 0.02, M.brass, 0, 0.35, 0.2);
      spoke.rotation.z = i * Math.PI / 5;
    }
    k.c(0.035, 0.035, 0.18, M.brass, 0, 0.35, 0.16, 8);
    // gauge + label
    const g = POD.gauge(0.075, 0x8fe8ef);
    g.position.set(0, -0.3, 0.24);
    k.root.add(g);
    k.sign('HP-3', 0.2, 0.06, 0, -0.05, 0.2, 0, { fg: '#ffd27a' });
    k.sign('DO NOT CLOSE', 0.36, 0.08, 0, 0.95, 0.12, 0, { fg: '#ff9c8a', border: '#8a2f24' });
    return k.done([0.5, 1.95, 0.36], false);
  });

  reg('pipe-manifold', {
    mount: 'wall', size: [1.4, 0.6, 0.32], tags: ['pipe', 'wall'],
    desc: 'Horizontal manifold with four valves, two gauges, brackets and a plate',
  }, function (o) {
    const k = kit(o), M = k.M;
    k.b(1.4, 0.5, 0.05, M.dark, 0, 0, 0.025);
    k.c(0.06, 0.06, 1.36, M.trim, 0, 0.06, 0.15, 12).rotation.z = Math.PI / 2;
    k.c(0.07, 0.07, 1.36, M.hull, 0, -0.12, 0.15, 12).rotation.z = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const x = -0.5 + i * 0.33;
      k.c(0.05, 0.05, 0.16, M.brass, x, -0.02, 0.2, 10);
      k.t(0.07, 0.015, M.brass, x, 0.08, 0.26, Math.PI / 2, 0);
      k.b(0.02, 0.12, 0.02, M.brass, x, 0.08, 0.25);
    }
    for (const x of [-0.62, 0.62]) k.b(0.08, 0.3, 0.06, M.hull, x, -0.06, 0.09);
    const g1 = POD.gauge(0.075, 0x8fe8ef); g1.position.set(-0.2, 0.12, 0.3); k.root.add(g1);
    const g2 = POD.gauge(0.06, 0xffb35c); g2.position.set(0.2, 0.12, 0.3); k.root.add(g2);
    k.sign('BALLAST 2', 0.4, 0.08, 0.48, -0.18, 0.08, 0, { fg: '#ffd27a' });
    return k.done([1.4, 0.62, 0.34], false);
  });

  reg('cable-loom', {
    mount: 'wall', size: [1.7, 0.6, 0.22], tags: ['cable', 'wall'],
    desc: 'Four cables with sag, clamps and a hanging tag',
  }, function (o) {
    const k = kit(o), M = k.M;
    for (let i = 0; i < 4; i++) {
      const y = 0.16 - i * 0.1, sag = 0.05 + i * 0.015;
      k.pipe([[-0.8, y, 0.09], [-0.3, y - sag, 0.11], [0.25, y - sag * 0.7, 0.11], [0.8, y, 0.09]],
        i === 0 ? 0.024 : 0.017, i % 2 ? M.rubber : M.dark);
    }
    for (const x of [-0.65, 0.0, 0.65]) {
      k.b(0.06, 0.34, 0.03, M.trim, x, 0.02, 0.07);
      k.s(0.02, M.trim, x, 0.19, 0.09);
    }
    k.b(0.16, 0.22, 0.012, M.paper, 0.28, -0.26, 0.13);
    k.sign('C-12', 0.13, 0.05, 0.28, -0.22, 0.14, 0, { fg: '#1a2b2f', bg: '#cfd9d6', border: '#8fa3a0' });
    return k.done([1.7, 0.6, 0.24], false);
  });

  reg('power-box', {
    mount: 'wall', size: [0.7, 0.8, 0.28], tags: ['power', 'wall'],
    desc: 'Breaker box with gauges, labelled switches, warning sticker and conduit',
  }, function (o) {
    const k = kit(o), M = k.M;
    k.b(0.66, 0.76, 0.16, M.hull, 0, 0, 0.08);
    k.b(0.6, 0.68, 0.02, M.hull2, 0, 0, 0.17);
    k.b(0.5, 0.03, 0.02, M.dark, 0, 0.24, 0.185);
    for (let i = 0; i < 4; i++) {
      k.b(0.05, 0.12, 0.04, M.trim, -0.18 + i * 0.12, 0.08, 0.19);
      k.b(0.05, 0.04, 0.03, i === 2 ? M.ledR : M.ledG, -0.18 + i * 0.12, 0.19, 0.19);
    }
    k.sign('POWER', 0.24, 0.06, -0.12, -0.26, 0.19, 0, { fg: '#bff3f1', border: '#3d6a72' });
    k.sign('380V', 0.14, 0.1, 0.2, -0.26, 0.19, 0, { fg: '#ff5b4a', border: '#8a2f24' });
    k.pipe([[0, -0.38, 0.1], [0, -0.7, 0.1]], 0.035, M.trim);
    return k.done([0.7, 0.8, 0.3], false);
  });

  // ── control surfaces ──────────────────────────────────────────────────
  reg('console-wall', {
    mount: 'wall', size: [1.3, 0.9, 0.34], tags: ['control', 'wall'],
    desc: 'Angled wall console: backplate, screen, two gauges, keypad, lamp row',
  }, function (o) {
    const k = kit(o), M = k.M;
    k.b(1.28, 0.88, 0.05, M.dark, 0, 0, 0.025);
    k.b(1.16, 0.5, 0.26, M.hull, 0, -0.1, 0.15);
    k.b(1.18, 0.05, 0.3, M.trim, 0, 0.16, 0.15);
    // recessed screen
    k.b(0.62, 0.34, 0.02, M.hull2, -0.22, 0.02, 0.29).rotation.x = -0.18;
    k.screen(0.54, 0.28, '#63e8ff', 'wave', -0.22, 0.03, 0.305, 0).rotation.x = -0.18;
    k.glow(0x63e8ff, 0.9, -0.22, 0.02, 0.34, 0.22);
    // gauges and keypad
    for (let i = 0; i < 2; i++) {
      const g = POD.gauge(0.075, i ? 0xffb35c : 0x8fe8ef);
      g.position.set(0.3 + i * 0.19, 0.04, 0.3);
      k.root.add(g);
    }
    for (let i = 0; i < 6; i++) k.b(0.05, 0.03, 0.01, M.trim, 0.24 + (i % 3) * 0.07, -0.18 - Math.floor(i / 3) * 0.05, 0.29);
    k.b(0.44, 0.04, 0.06, M.accent, 0, -0.3, 0.28);
    for (let i = 0; i < 4; i++) k.s(0.018, i === 0 ? M.ledR : M.ledG, -0.5 + i * 0.07, 0.32, 0.06);
    k.sign('OPS 2', 0.2, 0.06, 0.44, 0.33, 0.06, 0, { fg: '#bff3f1', border: '#3d6a72' });
    k.pipe([[-0.55, -0.44, 0.08], [-0.55, -0.7, 0.08]], 0.03, M.trim);
    return k.done([1.3, 0.92, 0.38], false);
  });

  reg('instrument-rack', {
    mount: 'floor', size: [0.95, 1.95, 0.65], tags: ['control'],
    desc: 'Floor rack: four instrument units, LED rows, one screen, cable side, feet',
  }, function (o) {
    const k = kit(o), M = k.M;
    k.b(0.92, 1.88, 0.6, M.hull, 0, 0.96, 0.3);
    k.b(0.98, 0.06, 0.66, M.trim, 0, 1.93, 0.3);
    k.b(0.98, 0.07, 0.66, M.dark, 0, 0.035, 0.3);
    for (let i = 0; i < 4; i++) {
      const y = 0.32 + i * 0.41;
      k.b(0.8, 0.3, 0.05, M.hull2, 0, y, 0.61);
      k.b(0.72, 0.04, 0.02, M.trim, 0, y + 0.1, 0.64);
      for (let j = 0; j < 5; j++) k.s(0.012, j % 2 ? M.ledG : M.ledR, -0.3 + j * 0.06, y - 0.04, 0.64);
      k.c(0.02, 0.02, 0.05, M.trim, 0.26, y - 0.05, 0.65, 8);
      k.c(0.02, 0.02, 0.05, M.brass, 0.19, y - 0.05, 0.65, 8);
    }
    k.screen(0.44, 0.22, '#7cd6ff', 'bars', 0, 1.66, 0.635);
    k.glow(0x7cd6ff, 0.8, 0, 1.66, 0.68, 0.26);
    k.pipe([[0.48, 1.7, 0.1], [0.55, 1.2, 0.2], [0.5, 0.4, 0.1]], 0.025, M.rubber);
    k.vents(4, 0.4, 0.014, M.dark, 0.3, 0.18, 0.62);
    k.sign('ANALYSER', 0.44, 0.09, -0.12, 1.79, 0.635, 0, { fg: '#ffd27a' });
    return k.done([1.0, 1.98, 0.75], true);
  });

  reg('radio-station', {
    mount: 'floor', size: [1.05, 1.55, 0.65], tags: ['control', 'comms'],
    desc: 'Comms desk: transceiver, dial, handset, antenna, logbook and a lamp',
  }, function (o) {
    const k = kit(o), M = k.M;
    k.b(1.0, 0.08, 0.58, M.hull, 0, 0.82, 0.3);
    k.b(0.9, 0.05, 0.5, M.dark, 0, 0.76, 0.3);
    for (const sx of [-0.42, 0.42]) {
      k.b(0.06, 0.8, 0.05, M.trim, sx, 0.4, 0.06);
      k.b(0.06, 0.8, 0.05, M.trim, sx, 0.4, 0.54);
      k.b(0.24, 0.04, 0.5, M.hull2, sx, 0.05, 0.3);
    }
    k.b(0.46, 0.24, 0.28, M.hull2, -0.16, 0.95, 0.3);
    k.b(0.3, 0.12, 0.02, M.glow, -0.16, 0.99, 0.45);
    k.screen(0.28, 0.1, '#ffb35c', 'bars', -0.16, 0.93, 0.45);
    k.c(0.05, 0.05, 0.04, M.trim, 0.04, 0.9, 0.45, 10);
    k.c(0.01, 0.01, 0.42, M.trim, -0.4, 1.3, 0.16, 6);
    k.s(0.03, M.ledR, 0.32, 0.98, 0.45);
    k.b(0.2, 0.02, 0.26, M.white, 0.22, 0.87, 0.3);
    k.sign('CH 16', 0.18, 0.06, -0.16, 1.09, 0.2, 0, { fg: '#bff3f1', border: '#3d6a72' });
    // handset on a hook
    k.b(0.07, 0.22, 0.06, M.rubber, 0.44, 1.0, 0.32);
    k.pipe([[0.44, 1.12, 0.32], [0.5, 1.0, 0.4], [0.4, 0.9, 0.45]], 0.012, M.rubber);
    return k.done([1.05, 1.6, 0.7], true);
  });

  reg('lab-rack', {
    mount: 'floor', size: [0.95, 1.85, 0.6], tags: ['lab'],
    desc: 'Sample rack: glowing jars, microscope, sample tray, screen and labels',
  }, function (o) {
    const k = kit(o), M = k.M;
    k.b(0.92, 1.8, 0.55, M.hull, 0, 0.92, 0.28);
    k.b(0.96, 0.05, 0.6, M.trim, 0, 1.84, 0.28);
    k.b(0.96, 0.06, 0.6, M.dark, 0, 0.04, 0.28);
    for (const y of [0.5, 0.95, 1.4]) k.b(0.86, 0.04, 0.5, M.hull2, 0, y, 0.3);
    for (let i = 0; i < 5; i++) {
      const x = -0.32 + i * 0.16;
      k.c(0.045, 0.045, 0.16, [M.glow, M.warm, M.ledG][i % 3], x, 0.6, 0.3, 8);
      k.c(0.05, 0.05, 0.02, M.trim, x, 0.69, 0.3, 8);
    }
    k.b(0.24, 0.06, 0.18, M.trim, 0.22, 1.0, 0.3);
    k.c(0.05, 0.06, 0.2, M.trim, 0.22, 1.12, 0.3, 10);
    k.b(0.05, 0.3, 0.05, M.trim, 0.22, 1.3, 0.24);
    k.b(0.18, 0.12, 0.02, M.dark, -0.22, 1.0, 0.44);
    k.screen(0.34, 0.2, '#8fe8ef', 'wave', 0.2, 1.6, 0.565);
    k.glow(0x8fe8ef, 0.7, 0.2, 1.6, 0.6, 0.22);
    k.sign('SAMPLES', 0.4, 0.08, -0.24, 1.6, 0.565, 0, { fg: '#ffd27a' });
    return k.done([1.0, 1.9, 0.68], true);
  });

  reg('med-bay', {
    mount: 'floor', size: [0.85, 1.75, 0.55], tags: ['medical'],
    desc: 'Medical cabinet: cross, drawers, bottles, lamp and a checklist',
  }, function (o) {
    const k = kit(o), M = k.M;
    k.b(0.82, 1.72, 0.5, M.hull, 0, 0.88, 0.25);
    k.b(0.86, 0.05, 0.54, M.trim, 0, 1.74, 0.25);
    k.b(0.86, 0.06, 0.54, M.dark, 0, 0.04, 0.25);
    k.b(0.66, 0.54, 0.02, M.paper, 0, 1.36, 0.51);
    k.b(0.66, 0.02, 0.03, M.hull2, 0, 1.62, 0.515);
    k.b(0.66, 0.02, 0.03, M.hull2, 0, 1.1, 0.515);
    k.b(0.2, 0.07, 0.02, M.red, 0, 1.36, 0.525);
    k.b(0.07, 0.2, 0.02, M.red, 0, 1.36, 0.525);
    for (let i = 0; i < 3; i++) {
      k.b(0.7, 0.26, 0.03, M.hull2, 0, 0.32 + i * 0.3, 0.51);
      k.b(0.14, 0.03, 0.04, M.trim, 0, 0.32 + i * 0.3, 0.54);
      k.sign('D' + (i + 1), 0.08, 0.04, -0.28, 0.32 + i * 0.3, 0.525, 0, { fg: '#bff3f1', border: '#3d6a72' });
    }
    for (let i = 0; i < 3; i++) k.c(0.035, 0.04, 0.12, M.accent, 0.26, 1.28 + i * 0.001, 0.53, 8);
    k.b(0.12, 0.16, 0.012, M.paper, 0.3, 1.04, 0.53);
    k.b(0.05, 0.1, 0.02, M.ledR, 0.3, 1.1, 0.54);
    k.lamp('w', 0.02, -0.34, 1.6, 0.54);
    k.sign('FIRST AID', 0.36, 0.08, 0, 1.62, 0.51, 0, { fg: '#ff8a7a' });
    return k.done([0.9, 1.8, 0.6], true);
  });

  // ── diving / safety ───────────────────────────────────────────────────
  reg('dive-gear', {
    mount: 'floor', size: [0.95, 1.9, 0.7], tags: ['dive'],
    desc: 'Diving helmet on a stand, suit on a hook, fins, hose coil and a tank',
  }, function (o) {
    const k = kit(o), M = k.M;
    k.b(0.8, 0.06, 0.5, M.dark, 0, 0.03, 0.3);
    k.c(0.04, 0.05, 1.2, M.trim, -0.24, 0.6, 0.3, 8);
    k.c(0.04, 0.05, 1.2, M.trim, 0.24, 0.6, 0.3, 8);
    k.b(0.56, 0.05, 0.4, M.trim, 0, 1.2, 0.3);
    // helmet
    k.s(0.17, M.orange, 0, 1.38, 0.3);
    k.c(0.17, 0.19, 0.08, M.trim, 0, 1.28, 0.3, 14);
    k.c(0.1, 0.1, 0.03, M.glass || M.accent, 0, 1.4, 0.47, 14).rotation.x = Math.PI / 2;
    k.t(0.11, 0.014, M.brass, 0, 1.4, 0.46, Math.PI / 2, 0);
    for (const a of [0.4, -0.4]) k.c(0.03, 0.03, 0.06, M.brass, a * 0.36, 1.34, 0.4, 8);
    // suit on a hook: torso, two arms, a hood and the hanger
    const suit = new T.Group();
    suit.add(POD.box(0.3, 0.66, 0.14, M.rubber, 0, 0, 0));
    for (const sx of [-1, 1]) {
      const arm = POD.box(0.09, 0.56, 0.11, M.rubber, sx * 0.19, -0.02, 0.005);
      arm.rotation.z = sx * 0.16;
      suit.add(arm);
    }
    suit.add(POD.box(0.26, 0.1, 0.12, M.dark, 0, -0.36, 0));
    suit.add(POD.box(0.13, 0.12, 0.12, M.rubber, 0, 0.39, 0.01));
    suit.add(new T.Mesh(new T.TorusGeometry(0.05, 0.01, 5, 10), M.trim));
    suit.children[suit.children.length - 1].position.set(0, 0.47, 0.01);
    suit.position.set(0.3, 1.55, 0.07);
    k.root.add(suit);
    k.c(0.02, 0.02, 0.18, M.trim, 0.3, 2.06, 0.07, 6);
    // fins + tank + hose
    k.b(0.14, 0.05, 0.44, M.dark, -0.32, 0.09, 0.55, 0.3);
    k.b(0.14, 0.05, 0.44, M.dark, -0.1, 0.09, 0.55, 0.3);
    k.c(0.1, 0.1, 0.46, M.accent, 0.34, 0.28, 0.42, 12);
    k.c(0.03, 0.03, 0.08, M.brass, 0.34, 0.54, 0.42, 8);
    k.pipe([[0.34, 1.4, 0.34], [0.42, 1.0, 0.5], [0.3, 0.6, 0.42]], 0.016, M.rubber);
    k.sign('DIVE', 0.28, 0.08, 0, 1.06, 0.52, 0, { fg: '#ffd27a' });
    return k.done([1.0, 2.05, 0.85], true);
  });

  reg('oxygen-rack', {
    mount: 'floor', size: [1.1, 1.6, 0.6], tags: ['dive', 'safety'],
    desc: 'Three oxygen cylinders, manifold, regulator, gauges and a stencil',
  }, function (o) {
    const k = kit(o), M = k.M;
    k.b(1.04, 0.06, 0.44, M.dark, 0, 0.04, 0.28);
    for (let i = 0; i < 3; i++) {
      const x = -0.34 + i * 0.34;
      k.c(0.1, 0.1, 0.92, i === 1 ? M.accent : M.hull2, x, 0.52, 0.26, 14);
      k.s(0.1, i === 1 ? M.accent : M.hull2, x, 0.98, 0.26);
      k.c(0.026, 0.026, 0.1, M.brass, x, 1.06, 0.26, 8);
      k.t(0.05, 0.012, M.brass, x, 1.1, 0.26, Math.PI / 2, 0);
      k.b(0.08, 0.02, 0.18, M.trim, x, 0.72, 0.4);
    }
    k.pipe([[-0.34, 1.12, 0.26], [0, 1.22, 0.26], [0.34, 1.12, 0.26]], 0.022, M.trim);
    k.c(0.05, 0.05, 0.12, M.brass, 0, 1.3, 0.26, 10);
    const g = POD.gauge(0.08, 0x8fe8ef); g.position.set(0, 1.36, 0.42); k.root.add(g);
    k.sign('O2 200 BAR', 0.44, 0.09, 0, 1.52, 0.26, 0, { fg: '#ffd27a' });
    k.b(0.06, 1.2, 0.04, M.trim, -0.52, 0.62, 0.05);
    k.b(0.06, 1.2, 0.04, M.trim, 0.52, 0.62, 0.05);
    k.rivets(5, 0.9, 0, M.trim, 0, 0.12, 0.5);
    return k.done([1.1, 1.65, 0.65], true);
  });

  reg('hatch-station', {
    mount: 'wall', size: [1.3, 1.2, 0.24], tags: ['safety', 'wall'],
    desc: 'Hatch side station: two gauges, beacon, wheel key, checklist and a sign',
  }, function (o) {
    const k = kit(o), M = k.M;
    k.b(1.26, 1.16, 0.05, M.dark, 0, 0, 0.025);
    k.b(1.14, 1.04, 0.03, M.hull, 0, 0, 0.06);
    for (let i = 0; i < 2; i++) {
      const g = POD.gauge(0.1, i ? 0xffb35c : 0x8fe8ef);
      g.position.set(-0.34 + i * 0.26, 0.28, 0.1);
      k.root.add(g);
    }
    k.s(0.06, M.ledR, 0.35, 0.32, 0.1);
    k.glow(0xff5b4a, 0.5, 0.35, 0.32, 0.13, 0.35);
    k.b(0.3, 0.28, 0.02, M.paper, -0.3, -0.2, 0.1);
    for (let i = 0; i < 4; i++) k.b(0.22, 0.01, 0.005, M.dark, -0.3, -0.1 - i * 0.06, 0.115);
    k.t(0.14, 0.02, M.brass, 0.3, -0.18, 0.12, 0, 0);
    k.b(0.03, 0.26, 0.02, M.brass, 0.3, -0.18, 0.11);
    k.sign('AIRLOCK CHECK', 0.5, 0.08, -0.3, -0.38, 0.06, 0, { fg: '#bff3f1', border: '#3d6a72' });
    k.sign('KEEP CLEAR', 0.34, 0.07, 0.36, 0.0, 0.08, 0, { fg: '#ff9c8a', border: '#8a2f24' });
    return k.done([1.3, 1.2, 0.26], false);
  });

  reg('emergency-station', {
    mount: 'wall', size: [1.1, 1.2, 0.24], tags: ['safety', 'wall'],
    desc: 'Extinguisher, axe, blanket roll and a life ring on a red plate',
  }, function (o) {
    const k = kit(o), M = k.M;
    k.b(1.06, 1.16, 0.05, M.red, 0, 0, 0.025);
    k.b(0.96, 1.06, 0.02, M.dark, 0, 0, 0.06);
    // extinguisher
    k.c(0.07, 0.075, 0.42, M.red, -0.3, 0.0, 0.14, 12);
    k.c(0.02, 0.02, 0.1, M.dark, -0.3, 0.24, 0.14, 8);
    k.b(0.1, 0.03, 0.02, M.trim, -0.3, 0.3, 0.14);
    // axe
    k.b(0.03, 0.34, 0.02, M.hull2, 0.05, 0.04, 0.1);
    k.b(0.15, 0.08, 0.03, M.trim, 0.05, 0.22, 0.1);
    // blanket roll
    k.c(0.08, 0.08, 0.3, M.paper, 0.3, 0.16, 0.1, 10).rotation.z = Math.PI / 2;
    // life ring: pale ring, four orange grab bands (the old code drew the
    // white torus over the orange one, so it read as a plain white donut)
    k.t(0.19, 0.05, M.paper, -0.3, -0.3, 0.1, 0, 0);
    for (let i = 0; i < 4; i++) {
      const band = new T.Mesh(new T.TorusGeometry(0.19, 0.054, 6, 6, 0.55), M.orange);
      band.rotation.z = i * Math.PI / 2 + 0.25;
      band.position.set(-0.3, -0.3, 0.1);
      k.root.add(band);
    }
    k.sign('EMERGENCY', 0.5, 0.08, 0.1, -0.44, 0.08, 0, { fg: '#ffd27a', bg: '#3a1a14' });
    return k.done([1.1, 1.2, 0.28], false);
  });

  // ── life ──────────────────────────────────────────────────────────────
  reg('galley', {
    mount: 'floor', size: [1.35, 1.8, 0.65], tags: ['life'],
    desc: 'Galley counter: sink, kettle, mugs, shelf, cupboard and a warm lamp',
  }, function (o) {
    const k = kit(o), M = k.M;
    k.b(1.3, 0.08, 0.6, M.hull, 0, 0.9, 0.3);
    k.b(1.2, 0.8, 0.52, M.hull2, 0, 0.46, 0.3);
    for (let i = 0; i < 2; i++) k.b(0.5, 0.28, 0.02, M.dark, -0.3 + i * 0.6, 0.5, 0.57);
    k.b(0.12, 0.03, 0.02, M.trim, -0.3, 0.55, 0.59);
    // sink + tap
    k.b(0.4, 0.1, 0.28, M.trim, 0.32, 0.87, 0.3);
    k.c(0.02, 0.02, 0.22, M.trim, 0.32, 1.0, 0.2, 8);
    k.b(0.02, 0.02, 0.12, M.trim, 0.32, 1.1, 0.26);
    // kettle, mugs
    k.c(0.09, 0.1, 0.18, M.trim, -0.32, 1.0, 0.3, 12);
    k.c(0.02, 0.02, 0.12, M.trim, -0.32, 1.15, 0.3, 6);
    for (let i = 0; i < 3; i++) k.c(0.045, 0.04, 0.09, [M.white, M.accent, M.orange][i], -0.05 + i * 0.12, 0.97, 0.4, 10);
    // shelf and jars: a matte top with a thin edge, not a mirror strip
    k.b(1.0, 0.035, 0.24, M.hull2, 0, 1.5, 0.2);
    k.b(1.02, 0.012, 0.26, M.trim, 0, 1.482, 0.2);
    for (let i = 0; i < 4; i++) k.c(0.05, 0.05, 0.14, [M.accent, M.warm, M.white, M.ledG][i], -0.3 + i * 0.2, 1.58, 0.2, 8);
    k.b(0.24, 0.18, 0.2, M.dark, 0.48, 1.6, 0.2);
    k.c(0.012, 0.012, 0.3, M.trim, 0.48, 1.4, 0.32, 6);
    k.s(0.06, M.warm, 0.48, 1.28, 0.32);
    k.glow(0xffb35c, 0.7, 0.48, 1.26, 0.36, 0.3);
    k.sign('GALLEY', 0.4, 0.09, -0.3, 1.22, 0.58, 0, { fg: '#ffd27a' });
    return k.done([1.35, 1.85, 0.7], true);
  });

  reg('plant-pot', {
    mount: 'floor', size: [0.65, 1.3, 0.55], tags: ['life'],
    desc: 'Hydroponic greens under a grow lamp, with a water tank',
  }, function (o) {
    const k = kit(o), M = k.M;
    k.b(0.5, 0.3, 0.4, M.hull2, 0, 0.16, 0.26);
    k.b(0.42, 0.04, 0.32, M.dark, 0, 0.32, 0.26);
    k.c(0.05, 0.05, 1.0, M.trim, -0.2, 0.62, 0.08, 8);
    k.c(0.05, 0.05, 1.0, M.trim, 0.2, 0.62, 0.08, 8);
    k.b(0.5, 0.05, 0.3, M.trim, 0, 1.14, 0.16);
    k.b(0.16, 0.14, 0.16, M.dark, 0, 1.22, 0.16);
    k.s(0.08, M.warm, 0, 1.14, 0.16);
    k.glow(0xffd9a0, 0.9, 0, 1.08, 0.2, 0.38);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05, r = 0.12 + (i % 2) * 0.06;
      k.b(0.09, 0.12, 0.02, M.ledG, Math.cos(a) * r, 0.42 + (i % 3) * 0.1, 0.26 + Math.sin(a) * r, a);
    }
    k.sign('HYDRO', 0.22, 0.06, 0, 0.62, 0.47, 0, { fg: '#bff3f1', border: '#3d6a72' });
    return k.done([0.7, 1.35, 0.6], true);
  });

  reg('bucket-mop', {
    mount: 'floor', size: [0.55, 1.45, 0.5], tags: ['life'],
    desc: 'Bucket, mop, squeegee and a wet-floor sign',
  }, function (o) {
    const k = kit(o), M = k.M;
    k.c(0.16, 0.13, 0.32, M.hull2, 0, 0.16, 0.24, 12);
    k.c(0.17, 0.17, 0.03, M.trim, 0, 0.33, 0.24, 12);
    k.c(0.02, 0.025, 1.1, M.hull2, 0.06, 0.62, 0.24, 6);
    for (let i = 0; i < 7; i++) k.b(0.02, 0.16, 0.02, M.white, -0.06 + i * 0.025, 1.18, 0.24 + (i % 2) * 0.02, i * 0.3);
    k.b(0.06, 0.04, 0.06, M.orange, 0.06, 1.22, 0.24);
    k.b(0.2, 0.03, 0.02, M.trim, -0.16, 0.8, 0.08);
    k.b(0.02, 0.5, 0.02, M.trim, -0.16, 1.02, 0.08);
    k.b(0.18, 0.24, 0.02, M.warm, -0.2, 1.24, 0.32, 0.3);
    k.sign('WET', 0.16, 0.06, -0.2, 1.26, 0.34, 0.3, { fg: '#1a1a10', bg: '#ffd27a', border: '#8a6a20' });
    return k.done([0.6, 1.5, 0.55], true);
  });

  // ── ceiling ───────────────────────────────────────────────────────────
  reg('ceiling-lamp', {
    mount: 'ceiling', size: [0.55, 0.8, 0.55], tags: ['light'],
    desc: 'Cage lamp on a cable with a warm bulb and a soft halo',
  }, function (o) {
    const k = kit(o), M = k.M;
    k.c(0.012, 0.012, 0.32, M.rubber, 0, -0.16, 0, 6);
    k.c(0.15, 0.13, 0.06, M.hull, 0, -0.32, 0, 12);
    const bulb = k.s(0.07, M.warm, 0, -0.43, 0);
    k.glow(0xffd9a0, 1.5, 0, -0.43, 0.02, 0.5);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const rod = POD.pipe([[Math.cos(a) * 0.1, -0.33, Math.sin(a) * 0.1], [Math.cos(a) * 0.13, -0.56, Math.sin(a) * 0.13]], 0.008, M.trim);
      k.root.add(rod);
    }
    k.t(0.13, 0.01, M.trim, 0, -0.56, 0, Math.PI / 2, 0);
    // a slow flicker, kept subtle
    let phase = k.rnd() * 6.28;
    bulb.userData.dynamic = true;
    bulb.userData.tick = (t) => {
      bulb.material = M.warm;
      bulb.scale.setScalar(1 + Math.sin(t * 7 + phase) * 0.02);
    };
    return k.done([0.55, 0.75, 0.55], false);
  });

  reg('ceiling-fan', {
    mount: 'ceiling', size: [0.85, 0.5, 0.85], tags: ['vent'],
    desc: 'Extractor fan in a housing with a slowly turning four-blade rotor',
  }, function (o) {
    const k = kit(o), M = k.M;
    k.c(0.09, 0.09, 0.12, M.trim, 0, -0.06, 0, 10);
    k.c(0.32, 0.32, 0.1, M.hull, 0, -0.16, 0, 18);
    k.c(0.3, 0.3, 0.02, M.dark, 0, -0.22, 0, 18);
    const rotor = new T.Group();
    for (let i = 0; i < 4; i++) {
      const b = POD.box(0.24, 0.008, 0.09, M.trim, 0.12, 0, 0);
      b.rotation.y = i * Math.PI / 2;
      rotor.add(b);
    }
    rotor.add(POD.cyl(0.04, 0.04, 0.04, M.trim, 0, 0, 0, 8));
    rotor.position.y = -0.25;
    rotor.userData.dynamic = true;
    rotor.userData.tick = (t) => { rotor.rotation.y = t * 0.9; };
    k.root.add(rotor);
    k.t(0.3, 0.012, M.trim, 0, -0.3, 0, Math.PI / 2, 0);
    return k.done([0.85, 0.55, 0.85], false);
  });

  reg('radar-dish', {
    mount: 'ceiling', size: [0.7, 0.65, 0.7], tags: ['comms'],
    desc: 'Small radar dish on a bracket, rotating, with a status lamp',
  }, function (o) {
    const k = kit(o), M = k.M;
    k.b(0.14, 0.05, 0.14, M.trim, 0, -0.03, 0);
    k.c(0.03, 0.03, 0.26, M.trim, 0, -0.18, 0, 8);
    const dish = new T.Group();
    const d = new T.Mesh(new T.SphereGeometry(0.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.hull);
    d.scale.set(1, 0.35, 1);
    d.rotation.x = Math.PI / 2;
    dish.add(d);
    dish.add(POD.cyl(0.012, 0.012, 0.26, M.trim, 0, 0, 0.14, 6).rotateX(Math.PI / 2));
    dish.add(POD.sphere(0.03, M.warm, 0, 0.02, 0.24, 6));
    dish.position.y = -0.36;
    dish.rotation.x = -0.5;
    dish.userData.dynamic = true;
    dish.userData.tick = (t) => { dish.rotation.y = t * 0.45; };
    k.root.add(dish);
    k.s(0.02, M.ledG, 0.1, -0.08, 0.06);
    return k.done([0.7, 0.75, 0.7], false);
  });

  // ── exterior ──────────────────────────────────────────────────────────
  function seabedAt() { return -4.9; }

  reg('reef-arch', {
    mount: 'water', size: [7, 6, 5], tags: ['exterior'],
    desc: 'Rock arch with two pillars, coral on the crown and kelp at the base',
  }, function (o) {
    const k = kit(o), M = k.M, r = k.rnd;
    const g = k.root;
    for (const sx of [-1.7, 1.7]) {
      const p = POD.rock(31 + Math.round(sx * 10), 1.5, 0x27383a);
      p.scale.set(1.1, 2.1, 1.0);
      p.position.set(sx, 1.6, r() * 0.4);
      g.add(p);
    }
    for (let i = 0; i < 4; i++) {
      const rock = POD.rock(50 + i, 1.5, 0x2b3d3f);
      rock.position.set(-1.2 + i * 0.8, 4.2 + (i % 2) * 0.35, 0);
      rock.scale.set(1.2, 0.8, 1.1);
      g.add(rock);
    }
    for (const [x, y, z, c] of [[-1.9, 3.4, 1.1, 0xff7f8f], [1.4, 4.6, 0.6, 0xffb066], [0.2, 5.0, -0.4, 0x9a7bff]]) {
      const coral = POD.coral(70 + Math.round(x * 7), c, 0.9);
      coral.position.set(x, y, z);
      g.add(coral);
    }
    for (const sx of [-2.3, 2.2]) {
      const kelp = POD.kelp(90 + Math.round(sx * 10), 0x2f8f5b, 3.2 + r());
      kelp.position.set(sx, 0, 0.6);
      g.add(kelp);
    }
    return k.done([7, 6, 5], false);
  });

  reg('kelp-forest', {
    mount: 'water', size: [8, 9, 6], tags: ['exterior'],
    desc: 'Seven kelp stalks in two depths with two rocks and a coral',
  }, function (o) {
    const k = kit(o);
    const r = k.rnd;
    for (let i = 0; i < 7; i++) {
      const kelp = POD.kelp(120 + i, i % 3 ? 0x2f8f5b : 0x4a9a6a, 4.5 + r() * 4.5);
      kelp.position.set((r() - 0.5) * 5, 0, (r() - 0.5) * 4);
      kelp.rotation.y = r() * 6.28;
      k.root.add(kelp);
    }
    for (let i = 0; i < 2; i++) {
      const rock = POD.rock(140 + i, 0.9 + r(), 0x2b3a3a);
      rock.position.set((r() - 0.5) * 4, 0.4, (r() - 0.5) * 3);
      k.root.add(rock);
    }
    const coral = POD.coral(150, 0xff8a7a, 1.2);
    coral.position.set(1.4, 0, -1.2);
    k.root.add(coral);
    return k.done([8, 9, 6], false);
  });

  reg('coral-garden', {
    mount: 'water', size: [7, 4, 5], tags: ['exterior'],
    desc: 'Five coral heads in mixed colours on a low rock shelf',
  }, function (o) {
    const k = kit(o), r = k.rnd;
    const shelf = POD.rock(200, 2.2, 0x263636);
    shelf.scale.set(1.6, 0.5, 1.3);
    shelf.position.y = 0.2;
    k.root.add(shelf);
    for (let i = 0; i < 5; i++) {
      const coral = POD.coral(210 + i, [0xff6f91, 0xffa45c, 0x9a7bff, 0x58e0c0, 0xffd166][i], 1.0 + r() * 1.4);
      coral.position.set((r() - 0.5) * 3.4, 0.3, (r() - 0.5) * 2.6);
      k.root.add(coral);
    }
    return k.done([7, 4, 5], false);
  });

  reg('rock-spire', {
    mount: 'water', size: [5, 12, 5], tags: ['exterior'],
    desc: 'Tall rock spire with ledges and kelp, a strong vertical silhouette',
  }, function (o) {
    const k = kit(o), r = k.rnd;
    const spire = POD.rock(300, 2.4, 0x223033);
    spire.scale.set(0.8, 3.0, 0.8);
    spire.position.y = 5.0;
    k.root.add(spire);
    for (let i = 0; i < 3; i++) {
      const ledge = POD.rock(310 + i, 1.0 + r() * 0.6, 0x2b3a3a);
      ledge.position.set((r() - 0.5) * 2.4, 2.2 + i * 2.4, (r() - 0.5) * 2.0);
      ledge.scale.set(1.2, 0.5, 1.1);
      k.root.add(ledge);
    }
    const kelp = POD.kelp(330, 0x2f8f5b, 5.5);
    kelp.position.set(1.4, 0, 0.8);
    k.root.add(kelp);
    return k.done([5, 12, 5], false);
  });

  reg('vent-field', {
    mount: 'water', size: [4, 6, 4], tags: ['exterior'],
    desc: 'Two hydrothermal chimneys with bubbles, glow and a warm point light',
  }, function (o) {
    const k = kit(o), M = k.M;
    for (let i = 0; i < 2; i++) {
      const x = -0.9 + i * 1.8;
      const h = 1.4 + i * 0.8;
      k.c(0.16 + i * 0.05, 0.42, h, M.dark, x, h / 2, 0, 9);
      k.c(0.13, 0.16, 0.18, M.hull2, x, h + 0.05, 0, 8);
      const b = POD.bubbleField(70, [0.5, 5, 0.5], 5);
      b.position.set(x, h, 0);
      k.root.add(b);
      k.glow(0xff9c5a, 0.8, x, h + 0.1, 0, 0.3);
    }
    k.s(0.03, M.warm, 0, 0.1, 0.4);
    return k.done([4, 6, 4], false);
  });

  reg('wreck', {
    mount: 'water', size: [11, 5, 6], tags: ['exterior'],
    desc: 'Broken hull section with ribs and portholes, listing on the sand',
  }, function (o) {
    const k = kit(o), M = k.M;
    const hull = new T.Mesh(new T.CylinderGeometry(1.6, 1.6, 7, 16, 1, true, 0, Math.PI), M.dark);
    hull.rotation.z = Math.PI / 2;
    hull.rotation.y = 0.2;
    hull.position.set(0, 1.2, 0);
    k.root.add(hull);
    for (let i = 0; i < 5; i++) {
      const rib = new T.Mesh(new T.TorusGeometry(1.55, 0.07, 5, 12, Math.PI), M.trim);
      rib.rotation.y = Math.PI / 2;
      rib.position.set(-3 + i * 1.5, 1.2, 0);
      k.root.add(rib);
    }
    for (let i = 0; i < 3; i++) {
      const hole = new T.Mesh(new T.CircleGeometry(0.16, 12), M.dark);
      hole.position.set(-2 + i * 1.6, 1.7, 0.62);
      k.root.add(hole);
    }
    k.b(2.2, 0.4, 0.8, M.hull2, 2.6, 0.25, 1.6, 0.4);
    k.b(1.2, 0.3, 0.5, M.dark, -3.4, 0.2, -1.2, -0.3);
    const school = POD.fishSchool(14, [4, 2, 3], 0x8fd7e6);
    school.position.set(0, 2.6, 0.5);
    k.root.add(school);
    return k.done([11, 5, 6], false);
  });

  reg('rock-cluster', {
    mount: 'water', size: [6, 3.2, 5], tags: ['exterior'],
    desc: 'Three boulders with anemones, urchins, a starfish and a small school',
  }, function (o) {
    const k = kit(o), M = k.M, r = k.rnd;
    for (let i = 0; i < 3; i++) {
      const rock = POD.rock(400 + i, 1.1 + r() * 0.9, i % 2 ? 0x2b3c3e : 0x243436);
      rock.position.set(-1.7 + i * 1.7, 0.3 + r() * 0.3, (r() - 0.5) * 1.6);
      rock.scale.set(1.1, 0.75, 1.0);
      k.root.add(rock);
    }
    const cols = [0xff7f8f, 0xffb066, 0x9a7bff, 0x58e0c0];
    for (let i = 0; i < 6; i++) {
      const a = POD.coral(420 + i, cols[i % 4], 0.5 + r() * 0.5);
      a.position.set((r() - 0.5) * 3.6, 0.7 + r() * 0.4, (r() - 0.5) * 2.2);
      k.root.add(a);
    }
    // urchins and a starfish break up the rock silhouette
    for (let i = 0; i < 5; i++) {
      const u = POD.sphere(0.07, M.dark, (r() - 0.5) * 4, 0.5 + r() * 0.5, (r() - 0.5) * 2.6, 8);
      u.scale.y = 0.7;
      for (let s = 0; s < 8; s++) {
        const a = s * Math.PI / 4;
        const spike = POD.cyl(0.004, 0.004, 0.1, M.dark, u.position.x + Math.cos(a) * 0.05,
          u.position.y + 0.07, u.position.z + Math.sin(a) * 0.05, 5);
        k.root.add(spike);
      }
    }
    const star = new T.Group();
    for (let i = 0; i < 5; i++) {
      const arm = POD.box(0.05, 0.014, 0.16, M.orange, 0, 0, 0.07);
      arm.rotation.y = i * Math.PI * 2 / 5;
      arm.position.z = 0.07;
      star.add(arm);
    }
    star.position.set(0.8, 0.52, 0.9);
    star.rotation.y = 0.4;
    k.root.add(star);
    const school = POD.fishSchool(12, [4, 1.6, 3], 0x9fe0d8);
    school.position.set(0, 1.9, 0);
    k.root.add(school);
    return k.done([6, 3.2, 5], false);
  });

  reg('anemone-field', {
    mount: 'water', size: [5, 2.4, 4], tags: ['exterior'],
    desc: 'A patch of six waving anemones on a low rock, with two clownfish',
  }, function (o) {
    const k = kit(o), M = k.M, r = k.rnd;
    const base = POD.rock(500, 1.5, 0x27383a);
    base.scale.set(1.4, 0.32, 1.1);
    base.position.y = 0.1;
    k.root.add(base);
    const cols = [0xff8fa8, 0xffc98a, 0xc9a8ff, 0x8fe8ef, 0xffd166, 0xff9c7a];
    for (let i = 0; i < 6; i++) {
      const x = -1.5 + (i % 3) * 1.4 + (r() - 0.5) * 0.3;
      const z = -0.8 + Math.floor(i / 3) * 1.5 + (r() - 0.5) * 0.3;
      const an = new T.Group();
      const col = cols[i];
      const stem = POD.cyl(0.13, 0.17, 0.16, M.dark, 0, 0.16, 0, 10);
      an.add(stem);
      for (let p = 0; p < 22; p++) {
        const a = p * Math.PI * 2 / 22;
        const len = 0.24 + r() * 0.22;
        const tent = POD.cyl(0.014, 0.008, len,
          POD.cachedGlow(col, 0.35), Math.cos(a) * 0.11, 0.24 + len / 2, Math.sin(a) * 0.11, 4);
        tent.rotation.z = Math.cos(a) * 0.45;
        tent.rotation.x = -Math.sin(a) * 0.45;
        an.add(tent);
      }
      an.position.set(x, 0.1, z);
      an.userData.dynamic = true;
      an.userData.tick = (t) => {
        an.rotation.z = Math.sin(t * 0.7 + i) * 0.07;
        an.rotation.x = Math.cos(t * 0.55 + i * 1.7) * 0.06;
      };
      k.root.add(an);
    }
    for (let i = 0; i < 2; i++) {
      const fish = new T.Group();
      const fm = POD.cachedMat(0xff9c4a, { roughness: 0.5 });
      const body = new T.Mesh(POD.fishGeometryMerged(), fm);
      body.scale.setScalar(0.85);
      fish.add(body);
      fish.position.set(-0.6 + i * 1.2, 0.7, 0.3);
      fish.userData.dynamic = true;
      fish.userData.tick = (t) => {
        fish.position.x = -0.6 + i * 1.2 + Math.sin(t * 0.5 + i * 2) * 0.4;
        fish.position.y = 0.7 + Math.sin(t * 0.9 + i) * 0.1;
        fish.rotation.y = Math.sin(t * 0.5 + i * 2) * 0.5;
      };
      k.root.add(fish);
    }
    return k.done([5, 2.4, 4], false);
  });

  reg('fish-tornado', {
    mount: 'water', size: [10, 7, 10], tags: ['exterior'],
    desc: 'Two fish schools and drifting particles, a living midground',
  }, function (o) {
    const k = kit(o);
    const a = POD.fishSchool(30, [7, 3, 6], 0x8fd7e6);
    a.position.set(0, 0, 0);
    k.root.add(a);
    const b = POD.fishSchool(18, [4, 2, 4], 0xffc98a);
    b.position.set(1.5, -1.8, 1.2);
    k.root.add(b);
    const p = POD.particleField(260, [7, 5, 7], 0xc9f7ff);
    k.root.add(p);
    return k.done([10, 7, 10], false);
  });

  reg('jelly-drift', {
    mount: 'water', size: [6, 4, 6], tags: ['exterior'],
    desc: 'Three jellyfish drifting and pulsing at different depths',
  }, function (o) {
    const k = kit(o);
    const make = (x, y, z, s, col, phase) => {
      const j = new T.Group();
      const dome = new T.Mesh(new T.SphereGeometry(0.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        new T.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6,
          transparent: true, opacity: 0.55, roughness: 0.3, depthWrite: false }));
      dome.scale.y = 0.7; j.add(dome);
      for (let i = 0; i < 7; i++) {
        const a = i * Math.PI * 2 / 7;
        const pts = [];
        for (let q = 0; q <= 4; q++) pts.push(new T.Vector3(Math.sin(a) * (0.2 + q * 0.02), -q * 0.18, Math.cos(a) * (0.2 + q * 0.02)));
        j.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 4, 0.006, 4, false),
          new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35 })));
      }
      j.position.set(x, y, z);
      j.scale.setScalar(s);
      j.userData.dynamic = true;
      j.userData.tick = (t) => {
        j.position.y = y + Math.sin(t * 0.33 + phase) * 0.35;
        j.position.x = x + Math.sin(t * 0.19 + phase) * 0.55;
        j.scale.y = s * (0.94 + 0.08 * Math.sin(t * 1.15 + phase));
      };
      k.root.add(j);
    };
    make(-1.8, 1.2, 0, 1.0, 0x8fe8ff, 0.4);
    make(1.4, 2.4, -1.2, 1.4, 0xc9a8ff, 2.1);
    make(0.2, -0.4, 1.8, 0.8, 0x8fe8ff, 4.2);
    return k.done([6, 4, 6], false);
  });

  reg('light-shafts', {
    mount: 'water', size: [10, 16, 10], tags: ['exterior'],
    desc: 'Four light shafts from the surface with drifting motes',
  }, function (o) {
    const k = kit(o);
    for (let i = 0; i < 4; i++) {
      const s = POD.lightShaft(0x9fe8ff, 1.2 + k.rnd() * 1.8, 20);
      s.position.set(-3 + i * 2, 6, (k.rnd() - 0.5) * 4);
      s.material.opacity = 0.035 + k.rnd() * 0.025;
      s.rotation.z = (k.rnd() - 0.5) * 0.2;
      k.root.add(s);
    }
    k.root.add(POD.particleField(300, [8, 12, 8], 0xbfefff));
    return k.done([10, 16, 10], false);
  });

  reg('sub-pass', {
    mount: 'water', size: [9, 4, 4], tags: ['exterior'],
    desc: 'Distant survey submarine with running lights, slowly patrolling',
  }, function (o) {
    const k = kit(o), M = k.M;
    const sub = new T.Group();
    const hull = new T.Mesh(new T.CylinderGeometry(0.8, 0.8, 5, 16), M.hull);
    hull.rotation.z = Math.PI / 2; sub.add(hull);
    sub.add(POD.sphere(0.8, M.hull, 2.5, 0, 0, 14));
    sub.add(POD.box(1.2, 0.7, 0.7, M.hull, 0.2, 0.9, 0));
    const l1 = POD.sphere(0.09, M.warm, 3.1, 0, 0.5, 8);
    sub.add(l1);
    const l2 = POD.sphere(0.07, M.ledG, -1.6, 0.5, 0, 8);
    sub.add(l2);
    sub.add(POD.halo(0xffd27a, 1.2, 0.4).translateX(3.1));
    sub.userData.dynamic = true;
    sub.userData.tick = (t) => {
      sub.position.x = Math.sin(t * 0.02 + 1.2) * 4;
      sub.position.y = Math.sin(t * 0.11) * 0.4;
      sub.rotation.y = -0.4 + Math.sin(t * 0.02) * 0.1;
    };
    k.root.add(sub);
    return k.done([9, 4, 4], false);
  });

  // ── public API ────────────────────────────────────────────────────────
  function build(name, opts) {
    const c = REG[name];
    if (!c) return null;
    const g = c.fn(opts || {});
    g.userData.kind = name;
    g.userData.mount = c.mount;
    g.userData.size = g.userData.size || c.size;
    return g;
  }

  function manifest() {
    return Object.keys(REG).sort().map((n) => ({
      name: n, mount: REG[n].mount, size: REG[n].size,
      tags: REG[n].tags, desc: REG[n].desc,
    }));
  }

  return { build: build, has: (n) => !!REG[n], manifest: manifest, registry: REG };
})();
