// Procedural asset pack for the single-file Three.js scene.
// Runs after the Three.js r160 UMD build; uses the global THREE namespace.
// Everything is generated from code: no GLTF, no external textures, no network.

const POD = (() => {
  const T = THREE;
  const V = (x, y, z) => new T.Vector3(x, y, z);

  function rng(seed = 1) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Accept a number, [x,y,z] or THREE.Vector3 wherever an extent is expected.
  // The model often passes a Vector3 to a "spread" argument; without this the
  // multiplication produces NaN positions and three.js logs a NaN radius.
  function extent3(value, fallback = 1) {
    if (typeof value === 'number' && Number.isFinite(value)) return [value, value, value];
    if (Array.isArray(value)) {
      return [Number(value[0] ?? fallback), Number(value[1] ?? fallback), Number(value[2] ?? fallback)];
    }
    if (value && typeof value === 'object') {
      return [Number(value.x ?? fallback), Number(value.y ?? fallback), Number(value.z ?? fallback)];
    }
    return [fallback, fallback, fallback];
  }

  function seedOf(value, salt = 0) {
    const [x, y, z] = extent3(value, 1);
    return (salt + Math.round(Math.abs(x) * 13 + Math.abs(y) * 7 + Math.abs(z) * 3)) >>> 0;
  }

  // Merge simple geometries into one buffer so a coral, a kelp or a fish is one
  // draw call instead of 5-15. This is what keeps the scene playable on 4 GB.
  function mergeGeometries(geometries, matrices = null) {
    const names = ['position', 'normal', 'uv'];
    const chunks = { position: [], normal: [], uv: [] };
    let total = 0;
    for (let i = 0; i < geometries.length; i++) {
      let g = geometries[i];
      if (g.index) g = g.toNonIndexed();
      if (matrices && matrices[i]) {
        g = g.clone();
        g.applyMatrix4(matrices[i]);
      }
      total += g.attributes.position.count;
      for (const name of names) {
        const attr = g.attributes[name];
        if (attr) chunks[name].push(attr.array);
        else chunks[name].push(new Float32Array(g.attributes.position.count * 3));
      }
    }
    const out = new T.BufferGeometry();
    for (const name of names) {
      const itemSize = name === 'uv' ? 2 : 3;
      const arr = new Float32Array(total * itemSize);
      let off = 0;
      for (const chunk of chunks[name]) { arr.set(chunk, off); off += chunk.length; }
      out.setAttribute(name, new T.BufferAttribute(arr, itemSize));
    }
    return out;
  }

  function dummyMatrix(pos, rot, scale) {
    const d = new T.Object3D();
    d.position.set(pos[0], pos[1], pos[2]);
    d.rotation.set(rot[0], rot[1], rot[2]);
    d.scale.set(scale[0], scale[1], scale[2]);
    d.updateMatrix();
    return d.matrix.clone();
  }

  function mat(color, opts = {}) {
    if (color && color.isMaterial) return color;
    // A polished metal under this rig mirrors the bright env gradient and clips to
    // white, which is how the trim bands turned into light bars. Metals reflect the
    // environment at half strength; dielectrics keep the full map.
    if (opts.envMapIntensity == null) {
      opts = { envMapIntensity: (opts.metalness || 0) >= 0.45 ? 0.5 : 1, ...opts };
    }
    return new T.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.08, ...opts });
  }
  function glowMat(color, intensity = 1.4, opts = {}) {
    if (color && color.isMaterial) return color;
    return new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4, metalness: 0.1, ...opts });
  }

  // Shared material cache. The merge pass can only fold meshes that use the
  // same material instance, so every prop in the library asks for materials
  // through these two functions instead of creating a new one per part.
  const matCache = new Map();
  function cachedMat(color, opts = {}) {
    const key = color + '|' + JSON.stringify(opts);
    let m = matCache.get(key);
    if (!m) { m = mat(color, opts); matCache.set(key, m); }
    return m;
  }
  function cachedGlow(color, intensity = 1.2, opts = {}) {
    const key = 'g' + color + '|' + intensity + '|' + JSON.stringify(opts);
    let m = matCache.get(key);
    if (!m) { m = glowMat(color, intensity, opts); matCache.set(key, m); }
    return m;
  }
  function box(w, h, d, material, x = 0, y = 0, z = 0) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
  }
  function cyl(rTop, rBottom, h, material, x = 0, y = 0, z = 0, seg = 14) {
    const m = new T.Mesh(new T.CylinderGeometry(rTop, rBottom, h, seg), material);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
  }
  function sphere(r, material, x = 0, y = 0, z = 0, seg = 16) {
    const m = new T.Mesh(new T.SphereGeometry(r, seg, Math.max(8, seg >> 1)), material);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
  }

  function rock(seed = 1, size = 1, color = 0x4b5a60) {
    const r = rng(seed), geo = new T.IcosahedronGeometry(size, 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + 0.24 * Math.sin(x * 4.1 + seed) * Math.cos(y * 3.7 - seed) + 0.12 * (r() - 0.5);
      p.setXYZ(i, x * n, y * n * 0.78, z * n);
    }
    geo.computeVertexNormals();
    const m = new T.Mesh(geo, mat(color, { roughness: 0.95, flatShading: true }));
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  function coral(seed = 1, color = 0xff6f91, height = 1.1) {
    const r = rng(seed), geos = [], mats = [];
    geos.push(new T.CylinderGeometry(0.035, 0.075, height, 6));
    mats.push(dummyMatrix([0, height / 2, 0], [0, 0, 0], [1, 1, 1]));
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2, h = height * (0.35 + r() * 0.45), len = 0.2 + r() * 0.35;
      const x = Math.cos(a) * h * 0.35, y = height * (0.35 + r() * 0.55), z = Math.sin(a) * h * 0.35;
      geos.push(new T.CylinderGeometry(0.022, 0.042, len, 5));
      mats.push(dummyMatrix([x, y, z], [Math.sin(a) * 0.7, 0, Math.cos(a) * 0.7], [1, 1, 1]));
      geos.push(new T.SphereGeometry(0.05 + r() * 0.035, 6, 5));
      mats.push(dummyMatrix([x + Math.cos(a) * 0.12, y + 0.13, z + Math.sin(a) * 0.12], [0, 0, 0], [1, 1, 1]));
    }
    const geo = mergeGeometries(geos, mats);
    const m = new T.Mesh(geo, glowMat(color, 0.3, { roughness: 0.84 }));
    m.castShadow = false; m.receiveShadow = true;
    m.scale.setScalar(0.8 + r() * 0.6);
    return m;
  }

  function kelp(seed = 1, color = 0x2f8f5b, height = 2.2) {
    const r = rng(seed), geos = [], mats = [];
    for (let i = 0; i < 4; i++) {
      const h = height * (0.5 + r() * 0.7), seg = 5, curve = new T.CatmullRomCurve3([]);
      for (let j = 0; j <= seg; j++) {
        const t = j / seg;
        curve.points.push(V(Math.sin(t * 5 + i) * 0.12, t * h, Math.cos(t * 4 + i) * 0.1));
      }
      geos.push(new T.TubeGeometry(curve, 6, 0.018 + r() * 0.02, 4, false));
      mats.push(dummyMatrix([0, 0, 0], [0, 0, 0], [1, 1, 1]));
    }
    const m = new T.Mesh(mergeGeometries(geos, mats), mat(color, { roughness: 0.9 }));
    m.userData.phase = r() * 6.28;
    m.userData.sway = 0.05 + r() * 0.08;
    m.castShadow = false; m.receiveShadow = true;
    return m;
  }

  function fishGeometry(lod = 0) {
    const g = new T.Group();
    const body = new T.Mesh(new T.SphereGeometry(0.18, lod ? 8 : 12, lod ? 6 : 8), mat(0x9fd8e6, { roughness: 0.5 }));
    body.scale.set(1.8, 0.7, 0.55); g.add(body);
    const tail = new T.Mesh(new T.ConeGeometry(0.16, 0.32, 5), mat(0x76bfd3, { roughness: 0.5, side: T.DoubleSide }));
    tail.rotation.z = Math.PI / 2; tail.position.x = -0.36; g.add(tail);
    const eye = sphere(0.035, glowMat(0xfff0b0, 0.5), 0.22, 0.05, 0.11, 6); g.add(eye);
    return g;
  }

  function fishGeometryMerged() {
    const body = new T.SphereGeometry(0.18, 8, 6);
    const tail = new T.ConeGeometry(0.16, 0.32, 5);
    return mergeGeometries([body, tail], [
      dummyMatrix([0, 0, 0], [0, 0, 0], [1.8, 0.7, 0.55]),
      dummyMatrix([-0.36, 0, 0], [0, 0, Math.PI / 2], [1, 1, 1]),
    ]);
  }

  // One InstancedMesh per school: a 20-fish school costs one draw call, not 60.
  function fishSchool(count = 24, spread = 6, color = 0x8fd7e6) {
    const [sx, sy, sz] = extent3(spread, 6);
    const r = rng(seedOf(spread, count * 17));
    const mesh = new T.InstancedMesh(fishGeometryMerged(), mat(color, { roughness: 0.55 }), count);
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    const params = [];
    for (let i = 0; i < count; i++) {
      params.push({
        base: V((r() - 0.5) * sx, (r() - 0.5) * sy * 0.45, (r() - 0.5) * sz),
        scale: 0.55 + r() * 0.65,
        phase: r() * 6.28,
        speed: 0.35 + r() * 0.7,
        radius: 0.35 + r() * Math.max(0.6, sx * 0.12),
      });
    }
    const dummy = new T.Object3D();
    const update = (t) => {
      for (let i = 0; i < count; i++) {
        const p = params[i];
        const x = p.base.x + Math.sin(t * p.speed + p.phase) * p.radius;
        const z = p.base.z + Math.cos(t * p.speed * 0.8 + p.phase) * p.radius * 0.8;
        const y = p.base.y + Math.sin(t * p.speed * 1.3 + p.phase) * 0.12;
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, Math.atan2(-(z - p.base.z), x - p.base.x), 0);
        dummy.scale.setScalar(p.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    update(0);
    mesh.userData.tick = update;
    mesh.userData.kind = 'fishSchool';
    return mesh;
  }

  // Round, soft sprites for the dust and bubble fields. Without a map every
  // particle is a hard square, which is exactly what a 4 cm cube in mid-air
  // looks like when one of them drifts close to the camera.
  let dotTex = null;
  function softDot() {
    if (dotTex) return dotTex;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 32;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 32, 32);
    dotTex = new T.CanvasTexture(cv);
    dotTex.colorSpace = T.SRGBColorSpace;
    return dotTex;
  }

  function bubbleField(count = 180, spread = 8, height = 7) {
    const [sx, , sz] = extent3(spread, 8);
    const h = Math.max(0.05, height || 7);
    const r = rng(seedOf(spread, count)), pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (r() - 0.5) * sx;
      pos[i * 3 + 1] = r() * h;
      pos[i * 3 + 2] = (r() - 0.5) * sz;
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const m = new T.Points(geo, new T.PointsMaterial({ color: 0xc9f7ff, size: 0.05, map: softDot(), transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending }));
    m.userData = { kind: 'bubbles', height: h, spread: sx };
    return m;
  }

  function particleField(count = 600, spread = 16, color = 0x9fe8ff) {
    const [sx, sy, sz] = extent3(spread, 16);
    const r = rng(seedOf(spread, count * 3)), pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (r() - 0.5) * sx;
      pos[i * 3 + 1] = (r() - 0.5) * sy;
      pos[i * 3 + 2] = (r() - 0.5) * sz;
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    return new T.Points(geo, new T.PointsMaterial({ color, size: 0.03, map: softDot(), transparent: true, opacity: 0.45, depthWrite: false, blending: T.AdditiveBlending }));
  }

  function pipe(points, radius = 0.045, color = 0x8a9aa2) {
    const curve = new T.CatmullRomCurve3(points.map(p => (p && p.isVector3) ? p.clone() : V(...p)));
    const material = (color && color.isMaterial) ? color : mat(color, { metalness: 0.65, roughness: 0.4 });
    const m = new T.Mesh(new T.TubeGeometry(curve, Math.max(8, points.length * 6), radius, 7, false), material);
    m.castShadow = true; return m;
  }

  function consoleUnit(w = 1.2, h = 0.9, d = 0.5, screenColor = 0x58e0d4) {
    const g = new T.Group();
    g.add(box(w, h, d, mat(0x2a3a40, { metalness: 0.55, roughness: 0.5 }), 0, h / 2, 0));
    g.add(box(w * 0.72, h * 0.42, 0.025, glowMat(screenColor, 0.9, { roughness: 0.25 }), 0, h * 0.68, -d / 2 - 0.014));
    g.add(box(w * 0.55, 0.08, 0.02, glowMat(0xffb648, 0.8), 0, h * 0.28, -d / 2 - 0.014));
    for (let i = 0; i < 4; i++) g.add(cyl(0.035, 0.035, 0.03, glowMat(i % 2 ? 0xff5b5b : 0x67f5a1, 0.8), (i - 1.5) * w * 0.18, h * 0.16, -d / 2 - 0.02, 10));
    return g;
  }

  function locker(w = 0.9, h = 2.1, d = 0.55, color = 0x40545a) {
    const g = new T.Group(), m = mat(color, { metalness: 0.7, roughness: 0.42 });
    const dark = mat(0x1d2a2f, { metalness: 0.5, roughness: 0.6 });
    g.add(box(w, h, d, m, 0, h / 2, 0));
    g.add(box(w * 0.86, 0.035, 0.02, glowMat(0xbff3f1, 0.25), 0, h * 0.62, -d / 2 - 0.012));
    g.add(box(w * 0.06, 0.22, 0.03, mat(0xb9c9cc, { metalness: 0.9 }), w * 0.34, h * 0.52, -d / 2 - 0.02));
    for (let i = 0; i < 5; i++) {
      g.add(box(w * 0.5, 0.018, 0.012, dark, -w * 0.04, h * 0.34 + i * 0.045, -d / 2 - 0.012));
    }
    g.add(box(w * 0.3, 0.055, 0.012, mat(0x8fa4a8, { metalness: 0.6, roughness: 0.5 }), -w * 0.18, h * 0.72, -d / 2 - 0.012));
    for (const y of [h * 0.18, h * 0.82]) {
      g.add(box(0.035, 0.09, 0.025, mat(0xaabdc0, { metalness: 0.85 }), -w * 0.46, y, -d / 2 - 0.015));
    }
    return g;
  }

  function seat(w = 1.0, h = 1.1, d = 0.8, color = 0x3a4c54) {
    const g = new T.Group();
    const m = mat(color, { roughness: 0.7, metalness: 0.06 });
    const trimC = mat(0x1a2327, { roughness: 0.85 });
    const metal = mat(0x71858b, { metalness: 0.82, roughness: 0.34 });
    // pedestal, foot ring and a skirt so the seat is not a slab on a stick
    g.add(cyl(0.3, 0.34, 0.055, metal, 0, 0.028, 0, 18));
    g.add(cyl(0.055, 0.075, h * 0.42, metal, 0, h * 0.23, 0, 10));
    g.add(cyl(0.16, 0.2, 0.05, trimC, 0, h * 0.47, 0, 14));
    g.add(box(w, 0.14, d * 0.92, m, 0, h * 0.55, 0));
    // piping round the cushion edge
    g.add(box(w + 0.01, 0.018, d * 0.93, trimC, 0, h * 0.615, 0));
    // back with two stitch seams and a headrest
    const back = box(w * 0.94, h * 0.62, d * 0.13, m, 0, h * 0.82, d * 0.38);
    back.rotation.x = -0.13; g.add(back);
    // rounded edges: a slab with square corners reads as a bench, not a seat
    const backRoll = cyl(0.055, 0.055, w * 0.94, m, 0, h * 1.13, d * 0.38, 12);
    backRoll.rotation.z = Math.PI / 2; backRoll.rotation.x = -0.13; g.add(backRoll);
    const seatRoll = cyl(0.06, 0.06, w, m, 0, h * 0.55, d * 0.46, 12);
    seatRoll.rotation.z = Math.PI / 2; g.add(seatRoll);
    for (const sx of [-0.3, 0.3]) {
      const seam = box(0.012, h * 0.5, 0.015, trimC, sx * w, h * 0.83, d * 0.44);
      seam.rotation.x = -0.13; g.add(seam);
    }
    const head = box(w * 0.68, 0.16, d * 0.12, m, 0, h * 1.14, d * 0.34);
    head.rotation.x = -0.13; g.add(head);
    const headSeam = box(w * 0.7, 0.016, d * 0.13, trimC, 0, h * 1.06, d * 0.35);
    headSeam.rotation.x = -0.13; g.add(headSeam);
    // arms with a padded top
    for (const sx of [-1, 1]) {
      g.add(cyl(0.03, 0.03, 0.05, metal, sx * w * 0.48, h * 0.72, d * 0.06, 8));
      g.add(box(0.07, 0.05, d * 0.5, trimC, sx * w * 0.48, h * 0.74, d * 0.06));
      g.add(box(0.075, 0.03, d * 0.42, m, sx * w * 0.48, h * 0.775, d * 0.06));
    }
    g.add(box(w * 0.9, 0.04, 0.05, metal, 0, h * 0.63, d * 0.44));
    return g;
  }

  function hatch(radius = 0.8, color = 0x71858b) {
    const g = new T.Group();
    const ring = new T.Mesh(new T.TorusGeometry(radius, 0.07, 8, 24), mat(color, { metalness: 0.85, roughness: 0.3 }));
    ring.rotation.x = Math.PI / 2; g.add(ring);
    const door = new T.Mesh(new T.CylinderGeometry(radius * 0.92, radius * 0.92, 0.08, 24), mat(0x34464c, { metalness: 0.7, roughness: 0.5 }));
    door.rotation.x = Math.PI / 2; g.add(door);
    g.add(cyl(0.09, 0.09, 0.1, glowMat(0xffb648, 0.6), radius * 0.58, radius * 0.58, 0.08, 10));
    return g;
  }

  function railing(length = 3, h = 1.0, color = 0x7f979d) {
    const g = new T.Group(), m = mat(color, { metalness: 0.85, roughness: 0.3 });
    g.add(cyl(0.035, 0.035, length, m, 0, h, 0, 10).rotateZ(Math.PI / 2));
    for (let i = 0; i <= 3; i++) g.add(cyl(0.025, 0.035, h, m, -length / 2 + length * i / 3, h / 2, 0, 8));
    return g;
  }

  function lightShaft(color = 0x7fe8ff, radius = 1.5, height = 12) {
    const geo = new T.CylinderGeometry(radius * 0.25, radius, height, 18, 1, true);
    const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.055, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }));
    m.rotation.z = 0.12; return m;
  }

  function glassMaterial(opts = {}) {
    // No `transmission`: in three r160 it renders the whole scene a second time
    // through a transmission target, which cost ~4x on this laptop. Reflections,
    // clearcoat and a low opacity read as glass for a fraction of the cost.
    return new T.MeshPhysicalMaterial({
      color: 0x9feef7, transparent: true, opacity: 0.13, roughness: 0.06, metalness: 0,
      clearcoat: 1, clearcoatRoughness: 0.07, envMapIntensity: 1.2,
      side: T.DoubleSide, depthWrite: false, ...opts,
    });
  }

  // A lit interior without a lighting artist: cool fill from the water, a warm
  // practical over the console bank and a cyan practical by the hatch. Returns
  // a rig with update(t) for slow flicker and a drifting caustic tint.
  function lighting(scene, quality = 1) {
    const g = new T.Group();
    const hemi = new T.HemisphereLight(0xa8ecff, 0x14303a, 1.05);
    const ambient = new T.AmbientLight(0x3c6675, 0.55);
    const sun = new T.DirectionalLight(0xb8f0ff, 2.1);
    sun.position.set(7, 14, 5);
    sun.castShadow = quality > 0;
    if (sun.castShadow) {
      sun.shadow.mapSize.set(1024, 1024);
      const c = sun.shadow.camera;
      c.left = -12; c.right = 12; c.top = 12; c.bottom = -12; c.near = 0.5; c.far = 45;
      sun.shadow.bias = -0.0008;
    }
    const warm = new T.PointLight(0xffc27a, 11.5, 6.0, 2);
    warm.position.set(0.15, 1.55, -1.1);
    const cool = new T.PointLight(0x62e9ff, 9.5, 8, 2);
    cool.position.set(-2.0, 1.95, 1.45);
    const consoleGlow = new T.PointLight(0x54ffe0, 8, 5, 2);
    consoleGlow.position.set(1.6, 1.35, -1.6);
    // two practicals that lift the shell instead of leaving the ceiling black
    const ceiling = new T.PointLight(0xffd9a8, 6.5, 6.5, 2);
    ceiling.position.set(0, 2.45, 0.6);
    // the wall sits ~0.6 m from this lamp, so at 6.0 it washed the whole bulkhead
    const hatch = new T.PointLight(0x9fe8ff, 3.2, 4.2, 2);
    hatch.position.set(0, 2.1, 2.0);
    g.add(hemi, ambient, sun, warm, cool, consoleGlow, ceiling, hatch);
    scene.add(g);
    return {
      group: g, hemi, ambient, sun, warm, cool, consoleGlow, ceiling, hatch,
      sunBase: sun.intensity, warmBase: warm.intensity, coolBase: cool.intensity,
      ceilingBase: ceiling.intensity,
      update(t) {
        const swell = 0.5 + 0.5 * Math.sin(t * 0.31);
        sun.intensity = this.sunBase * (0.92 + 0.08 * Math.sin(t * 0.17));
        warm.intensity = this.warmBase * (0.88 + 0.12 * Math.sin(t * 2.1 + 1.4));
        cool.intensity = this.coolBase * (0.86 + 0.14 * swell);
        hemi.intensity = 1.0 + 0.08 * Math.sin(t * 0.23);
        this.ceiling.intensity = this.ceilingBase * (0.93 + 0.07 * Math.sin(t * 1.1));
        this.consoleGlow.intensity = this.consoleGlow.intensity * 0.94 + 6 * 0.06 * (0.7 + 0.3 * Math.sin(t * 3.7));
      },
    };
  }

  // CanvasTexture screen with a cheap animated trace. Returns a mesh whose
  // userData.tick(t) redraws at ~8 fps; no external image, no network.
  function screen(width = 0.8, height = 0.45, color = '#58e0d4', kind = 'wave') {
    if (typeof color === 'number') color = '#' + color.toString(16).padStart(6, '0');
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = Math.max(96, Math.round(256 * height / Math.max(0.01, width)));
    const ctx = cv.getContext('2d');
    const tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    tex.minFilter = T.LinearFilter;
    tex.magFilter = T.LinearFilter;
    const material = new T.MeshBasicMaterial({ map: tex, toneMapped: false });
    const mesh = new T.Mesh(new T.PlaneGeometry(width, height), material);
    mesh.userData.tick = (t) => {
      const w = cv.width, h = cv.height;
      ctx.fillStyle = '#04181c'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(80,220,210,.18)'; ctx.lineWidth = 1;
      for (let x = 0; x <= w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y <= h; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      if (kind === 'bars') {
        for (let i = 0; i < 12; i++) {
          const v = 0.2 + 0.8 * Math.abs(Math.sin(t * 1.7 + i * 0.9));
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.25 + 0.6 * Math.abs(Math.sin(t * 0.7 + i));
          ctx.fillRect(12 + i * 19, h - 14 - v * (h - 42), 11, v * (h - 42));
        }
        ctx.globalAlpha = 1;
      } else if (kind === 'radar') {
        ctx.beginPath(); ctx.arc(w / 2, h / 2, h * 0.38, 0, Math.PI * 2); ctx.stroke();
        const a = t * 1.3;
        ctx.beginPath(); ctx.moveTo(w / 2, h / 2);
        ctx.lineTo(w / 2 + Math.cos(a) * h * 0.38, h / 2 + Math.sin(a) * h * 0.38); ctx.stroke();
      } else {
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
          const y = h * 0.55 + Math.sin(x * 0.06 + t * 5.3) * h * 0.14 *
                    Math.sin(x * 0.013 - t * 1.7) + Math.sin(x * 0.17 + t * 9) * 3;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(180,255,245,.75)';
      ctx.font = '600 11px ui-monospace,monospace';
      ctx.fillText('DEEP STATION 7  //  ' + (kind === 'bars' ? 'POWER' : 'SONAR'), 12, 18);
      ctx.fillStyle = color;
      ctx.fillText((kind === 'bars' ? '84%' : (3.2 + Math.sin(t * 0.4) * 0.4).toFixed(1) + ' bar'), w - 58, h - 10);
      tex.needsUpdate = true;
    };
    mesh.userData.tick(0);
    mesh.userData.tickable = true;
    return mesh;
  }

  function statusLamp(color = 0xff4d4d, radius = 0.06) {
    const m = new T.Mesh(new T.SphereGeometry(radius, 10, 8),
      new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2, roughness: 0.35 }));
    m.userData.tick = (t) => {
      const pulse = 0.5 + 0.5 * Math.sin(t * 3.1 + m.position.x * 2.3);
      m.material.emissiveIntensity = 0.5 + pulse * 2.4;
    };
    return m;
  }

  function gauge(radius = 0.11, color = 0x8fe8ef) {
    const g = new T.Group();
    const face = new T.Mesh(new T.CircleGeometry(radius, 20),
      new T.MeshStandardMaterial({ color: 0x0b2228, emissive: color, emissiveIntensity: 0.12, roughness: 0.4 }));
    g.add(face);
    const rim = new T.Mesh(new T.TorusGeometry(radius, radius * 0.09, 6, 22),
      mat(0x9fb3b8, { metalness: 0.85, roughness: 0.3 }));
    g.add(rim);
    const needle = new T.Mesh(new T.BoxGeometry(radius * 0.06, radius * 0.82, 0.01),
      glowMat(0xffb648, 1.2));
    needle.position.y = radius * 0.18;
    needle.geometry.translate(0, radius * 0.41, 0);
    needle.userData.tick = (t) => {
      needle.rotation.z = -0.5 + Math.sin(t * 0.7 + radius * 90) * 0.55;
    };
    g.add(needle);
    g.userData.tick = (t) => needle.userData.tick(t);
    return g;
  }

  // A cheap bloom substitute: one additive sprite with a radial falloff behind
  // a screen, lamp or beacon. Costs one draw call and reads as a glow halo,
  // unlike a real bloom pass which is far too expensive on the AMD iGPU.
  let haloTex = null;
  function halo(color = 0x64e8ff, size = 1, opacity = 0.5) {
    if (!haloTex) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const g = cv.getContext('2d');
      const grad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.35, 'rgba(255,255,255,.55)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
      haloTex = new T.CanvasTexture(cv);
      haloTex.colorSpace = T.SRGBColorSpace;
    }
    const s = new T.Sprite(new T.SpriteMaterial({
      map: haloTex, color, transparent: true, opacity,
      blending: T.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    s.scale.set(size, size, 1);
    return s;
  }

  // Stencilled plate: a canvas texture with a border and one or two lines.
  // Signs are the cheapest way to make a procedural room look authored.
  function sign(text, width = 0.5, height = 0.14, opts = {}) {
    const bg = opts.bg || '#0b1a1e';
    const fg = opts.fg || '#ffd27a';
    const border = opts.border || fg;
    const px = 512, py = Math.max(64, Math.round(px * height / Math.max(0.02, width)));
    const cv = document.createElement('canvas');
    cv.width = px; cv.height = py;
    const g = cv.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, px, py);
    if (border) {
      g.strokeStyle = border; g.lineWidth = Math.max(2, py * 0.05);
      g.globalAlpha = 0.85; g.strokeRect(py * 0.06, py * 0.06, px - py * 0.12, py - py * 0.12);
      g.globalAlpha = 1;
    }
    g.fillStyle = fg;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const sub = opts.sub || '';
    const size = py * (sub ? 0.34 : 0.46);
    g.font = '700 ' + Math.round(size) + 'px ui-monospace,monospace';
    g.fillText(String(text).toUpperCase(), px / 2, py * (sub ? 0.4 : 0.52));
    if (sub) {
      g.globalAlpha = 0.72;
      g.font = '600 ' + Math.round(py * 0.2) + 'px ui-monospace,monospace';
      g.fillText(String(sub).toUpperCase(), px / 2, py * 0.74);
    }
    const tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    tex.minFilter = T.LinearFilter;
    const m = new T.Mesh(new T.PlaneGeometry(width, height),
      new T.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
    return m;
  }

  // Collapse every static mesh under `root` into one mesh per material.
  // This is what lets the asset library stay detailed (hundreds of bolts,
  // seams and plates) without hundreds of draw calls: 30 props become ~8.
  // Anything with userData.tick (screens, fans, gauges) and anything flagged
  // `dynamic` is re-parented instead of merged, so it keeps animating.
  function compactWorld(root) {
    if (!root) return root;
    root.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(root.matrixWorld).invert();
    const buckets = new Map();
    const statics = [];
    const rel = new T.Matrix4();
    (function walk(o, dyn) {
      const own = !!(o.userData && (o.userData.dynamic === true || typeof o.userData.tick === 'function'));
      const next = dyn || own;
      if (o !== root && next) {
        if (o.parent !== root) {
          rel.multiplyMatrices(inv, o.matrixWorld).decompose(o.position, o.quaternion, o.scale);
          o.parent.remove(o);
          root.add(o);
        }
        return;
      }
      if (o.isMesh && o.geometry && o.material && !Array.isArray(o.material) &&
          !o.isInstancedMesh && !o.isSprite && !o.isPoints) {
        const b = buckets.get(o.material) || { g: [], m: [] };
        b.g.push(o.geometry);
        b.m.push(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld));
        buckets.set(o.material, b);
        statics.push(o);
        return;
      }
      for (const c of o.children.slice()) walk(c, next);
    })(root, false);
    for (const o of statics) if (o.parent) o.parent.remove(o);
    for (const [material, b] of buckets) {
      const mesh = new T.Mesh(mergeGeometries(b.g, b.m), material);
      mesh.castShadow = false; mesh.receiveShadow = true;
      root.add(mesh);
    }
    return root;
  }

  function collidersFrom(root) {
    const out = [];
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if (!o.isMesh || o.userData.noCollide) return;
      if (o.geometry && o.geometry.type === 'SphereGeometry' && o.material && o.material.transparent) return;
      const b = new T.Box3().setFromObject(o);
      if (isFinite(b.min.x) && b.max.x - b.min.x < 20) out.push(b);
    });
    return out;
  }

  function moveWithCollision(pos, dx, dz, radius, colliders, bounds) {
    const test = (x, z) => {
      if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return false;
      for (const b of colliders) {
        if (x > b.min.x - radius && x < b.max.x + radius && pos.y > b.min.y - 0.1 && pos.y < b.max.y + 1.7 &&
            z > b.min.z - radius && z < b.max.z + radius) return false;
      }
      return true;
    };
    if (test(pos.x + dx, pos.z)) pos.x += dx;
    if (test(pos.x, pos.z + dz)) pos.z += dz;
  }

  function tick(root, t) {
    root.traverse(o => { if (typeof o.userData.tick === 'function') o.userData.tick(t); });
  }

  function updateLife(root, t) {
    root.traverse(o => {
      if (o.userData.kind === 'bubbles') {
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          let y = p.getY(i) + 0.006 + (i % 7) * 0.0008;
          if (y > o.userData.height) y = 0;
          p.setY(i, y);
        }
        p.needsUpdate = true;
      }
      if (o.userData.phase !== undefined && o.userData.base) {
        o.position.x = o.userData.base.x + Math.sin(t * o.userData.speed + o.userData.phase) * o.userData.radius;
        o.position.z = o.userData.base.z + Math.cos(t * o.userData.speed * 0.8 + o.userData.phase) * o.userData.radius;
        o.rotation.y = Math.atan2(o.position.x - o.userData.base.x, o.position.z - o.userData.base.z);
      } else if (o.userData.sway) {
        o.rotation.z = Math.sin(t * 1.1 + (o.userData.phase || 0)) * o.userData.sway;
      }
    });
  }

  return { T, V, rng, extent3, mergeGeometries, dummyMatrix, mat, glowMat, box, cyl, sphere, rock, coral, kelp, fishGeometry, fishGeometryMerged, fishSchool,
           bubbleField, particleField, pipe, consoleUnit, locker, seat, hatch, railing, lightShaft,
           glassMaterial, lighting, screen, statusLamp, gauge, cachedMat, cachedGlow, halo, sign,
           collidersFrom, moveWithCollision, tick, updateLife, compactWorld };
})();
