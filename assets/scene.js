// Deterministic scene compiler for the slot-based harness.
//
// The model never writes geometry or coordinates. It fills named slots:
//
//   { "slot": "port-mid", "asset": "workbench", "accent": "warm" }
//
// This file owns everything that is easy to get wrong: world position, wall
// orientation, grounding, scale, collision, palette, failure reporting and the
// final merge pass. If a slot names a missing asset, the slot keeps its
// default and the failure is reported instead of producing a broken object.

const SCENE = (() => {
  const T = THREE;

  const HEX = (v, fallback) => {
    if (Array.isArray(v)) return v;
    if (typeof v !== 'string') return fallback;
    const h = v.replace('#', '').trim();
    if (!/^[0-9a-f]{6}$/i.test(h)) return fallback;
    return parseInt(h, 16);
  };

  // A plan is free to choose a dark hull, but below a relative luminance of about
  // 0.05 every prop built from it reads as a black silhouette against a lit room
  // (the 2026-11-17 run chose #141e28 and the lockers and racks became holes).
  // Lerp toward a slate until the floor is met, and stop at 75 % so the plan's
  // own dark mood survives instead of being replaced by the default palette.
  function floorHex(hex, target, minLum) {
    const lum = (c) => {
      const ch = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * ch((c >> 16) & 255) + 0.7152 * ch((c >> 8) & 255) + 0.0722 * ch(c & 255);
    };
    let out = hex;
    for (let i = 1; i <= 15 && lum(out) < minLum; i++) {
      const t = i * 0.05;
      const mix = (a, b) => Math.round(a + (b - a) * t);
      out = (mix((hex >> 16) & 255, (target >> 16) & 255) << 16)
        | (mix((hex >> 8) & 255, (target >> 8) & 255) << 8)
        | mix(hex & 255, target & 255);
    }
    return out;
  }

  const ACCENTS = {
    primary: null, warm: null, secondary: null,
    green: 0x6cffab, red: 0xff5b4a, violet: 0xc9a8ff, amber: 0xffd166,
  };

  function report() {
    if (!window.__SCENE) {
      window.__SCENE = { placed: [], failed: [], recovered: [], slots: 0, defaults: 0, meshes: 0, chunks: 0 };
    }
    return window.__SCENE;
  }

  function slotMap(spec) {
    const out = Object.create(null);
    const list = spec.slots || [];
    for (const s of list) out[s.id] = s;
    return out;
  }

  function build(ctx, spec) {
    const rep = report();
    spec = spec || {};
    const pal = spec.palette || {};
    const hull = floorHex(HEX(pal.hull, 0x35484f), 0x3d525a, 0.052);
    const accent = HEX(pal.accent, 0x64e8ff);
    const warm = HEX(pal.warm, 0xffb35c);
    const secondary = HEX(pal.secondary, 0xff6f91);
    const slots = slotMap(spec);

    const interior = new T.Group(); interior.name = 'scene-interior';
    const exterior = new T.Group(); exterior.name = 'scene-exterior';
    ctx.props.add(interior);
    ctx.exterior.add(exterior);
    rep.slots = Object.keys(slots).length;

    // Every slot starts from its default; the model's choice replaces it. If the
    // model's choice fails at build time the default is restored, so a bad answer
    // can never leave a hole in the room.
    const chosen = Object.create(null);
    for (const id in slots) {
      const s = slots[id];
      if (s.default) {
        chosen[id] = { slot: id, asset: s.default, accent: s.accent || 'primary', _default: true };
      }
    }
    for (const a of (spec.assignments || [])) {
      if (!a || !a.slot) continue;
      if (!slots[a.slot]) { rep.failed.push({ slot: a.slot, asset: a.asset, error: 'unknown slot' }); continue; }
      chosen[a.slot] = {
        slot: a.slot, asset: a.asset, accent: a.accent || 'primary',
        scale: a.scale, yaw: a.yaw,
      };
    }

    const place = (a) => {
      const slot = slots[a.slot];
      const name = String(a.asset || '');
      if (!CHUNKS.has(name)) { rep.failed.push({ slot: a.slot, asset: name, error: 'unknown asset' }); return false; }
      const meta = CHUNKS.registry[name];
      if (slot.mount !== 'water' && meta.mount !== slot.mount) {
        rep.failed.push({ slot: a.slot, asset: name, error: 'mount ' + meta.mount + ' does not fit ' + slot.mount });
        return false;
      }
      const accName = a.accent || slot.accent || 'primary';
      const accColor = accName === 'primary' ? accent
        : accName === 'warm' ? warm
        : accName === 'secondary' ? secondary
        : (ACCENTS[accName] || accent);
      let g;
      try {
        g = CHUNKS.build(name, {
          color: hull, accent: accColor, warm: warm,
          seed: (slot.seed || 1) + (a._default ? 0 : 17),
        });
      } catch (err) {
        rep.failed.push({ slot: a.slot, asset: name, error: 'build threw: ' + (err && err.message ? err.message : err) });
        return false;
      }
      if (!g) { rep.failed.push({ slot: a.slot, asset: name, error: 'builder returned nothing' }); return false; }

      const scale = Math.max(0.8, Math.min(1.12, Number(a.scale) || 1));
      g.scale.setScalar(scale);
      g.position.set(slot.pos[0], slot.pos[1], slot.pos[2]);
      g.rotation.y = (slot.rot || 0) + (Number(a.yaw) || 0);
      g.updateMatrixWorld(true);

      if (slot.mount === 'water') {
        exterior.add(g);
      } else {
        interior.add(g);
        if (meta.mount === 'floor') {
          const box = new T.Box3().setFromObject(g);
          if (isFinite(box.min.x) && isFinite(box.max.x)) ctx.colliders.push(box);
        }
      }
      rep.placed.push({ slot: a.slot, asset: name, accent: accName });
      if (a._default) rep.defaults++;
      return true;
    };

    for (const id in chosen) {
      const a = chosen[id];
      const mark = rep.failed.length;
      if (!place(a) && !a._default) {
        const s = slots[id];
        if (s.default) {
          // the model's choice failed but the slot has a fallback: that is a
          // recovered slot, not a hole, so it must not fail the gate
          for (const e of rep.failed.splice(mark)) rep.recovered.push(e);
          place({ slot: id, asset: s.default, accent: s.accent || 'primary', _default: true });
        }
      }
    }

    // deterministic dressing that does not depend on the model
    dress(ctx, interior, { accent, warm, hull, secondary });

    // one draw call per material instead of one per bolt
    POD.compactWorld(interior);
    POD.compactWorld(exterior);

    let meshes = 0;
    interior.traverse(o => { if (o.isMesh) meshes++; });
    exterior.traverse(o => { if (o.isMesh) meshes++; });
    rep.meshes = meshes;
    rep.chunks = rep.placed.length;
    if (ctx.diagnostics) ctx.diagnostics.report = rep;
    return rep;
  }

  // A few authored details that make the room read as one place: a hazard
  // stripe at the hatch, cable runs across the ceiling, a floor stencil.
  function dress(ctx, root, p) {
    const rubber = POD.cachedMat(0x101719, { roughness: 0.94 });
    const trim = POD.cachedMat(0x93a7ac, { metalness: 0.8, roughness: 0.32 });
    // Cable bundle down one window bay. A run that crossed the room at 2.7 m read
    // as a bar through the glass in every upward view; these follow the wall.
    for (let i = 0; i < 3; i++) {
      const a = 1.05 + i * 0.06;
      const r = 2.92;
      root.add(POD.pipe([
        [Math.sin(a) * r, 2.62, Math.cos(a) * r],
        [Math.sin(a) * r, 1.55, Math.cos(a) * r],
        [Math.sin(a) * (r - 0.03), 1.2, Math.cos(a) * (r - 0.03)],
      ], i ? 0.01 : 0.014, i ? rubber : POD.cachedMat(0x1d2a2e, { roughness: 0.8 })));
    }
    root.add(POD.box(0.16, 0.05, 0.05, trim, Math.sin(1.08) * 2.86, 1.62, Math.cos(1.08) * 2.86));
    // pipe riser at the rear corner
    root.add(POD.pipe([[2.55, 2.6, 1.9], [2.6, 1.4, 1.95], [2.55, 0.2, 1.9]], 0.04, trim));
    // floor hazard stripes in front of the hatch
    const stripeMat = POD.cachedMat(0xc9a227, { roughness: 0.8 });
    for (let i = 0; i < 5; i++) {
      const s = POD.box(0.5, 0.01, 0.08, stripeMat, -0.85 + i * 0.42, 0.015, 1.82);
      s.rotation.y = 0.42;
      root.add(s);
    }
    // drain stencil on the floor
    const st = POD.sign('DECK 1', 0.5, 0.5, { bg: '#0d1d22', fg: '#4d7c86', border: '#2b4c54' });
    st.rotation.x = -Math.PI / 2;
    st.position.set(-1.35, 0.02, 0.9);
    root.add(st);
  }

  return { build: build, report: report };
})();
