(function () {
  'use strict';

  HARNESS.start({
    spawn: [0, 1.62, 1.0],
    yaw: 0,
    quality: 2,

    build(ctx) {
      // side-wall status panel
      const panel = new THREE.Group();
      const plate = POD.box(0.9, 0.55, 0.06, POD.mat(0x2c3d43, { metalness: 0.6, roughness: 0.5 }), 0, 0, 0);
      panel.add(plate);
      const radar = ctx.screen(0.42, 0.3, '#79e8ff', 'radar');
      radar.position.set(-0.18, 0.05, -0.04);
      radar.rotation.y = Math.PI;
      panel.add(radar);
      const gauge = ctx.gauge(0.1, 0x9fe8ef);
      gauge.position.set(0.24, 0.06, -0.04);
      gauge.rotation.y = Math.PI;
      panel.add(gauge);
      panel.position.set(1.9, 1.55, 2.49);
      ctx.props.add(panel);

      // a pipe run and a valve wheel on the bulkhead
      ctx.props.add(POD.pipe([[1.35, 2.58, 2.45], [2.35, 2.2, 1.3], [2.55, 1.25, 0.2]], 0.035, 0x8a9aa2));
      const valve = new THREE.Group();
      valve.add(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 6, 18), POD.mat(0x9a6b45, { metalness: 0.8, roughness: 0.4 })));
      for (let i = 0; i < 4; i++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.26, 0.02), POD.mat(0x9a6b45, { metalness: 0.8, roughness: 0.4 }));
        spoke.rotation.z = i * Math.PI / 4; valve.add(spoke);
      }
      valve.position.set(-1.95, 2.1, 2.47);
      ctx.props.add(valve);
      valve.userData.tick = (t) => { valve.rotation.z = Math.sin(t * 0.3) * 0.12; };

      // jellyfish drifting outside the port side
      const jelly = new THREE.Group();
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x8fe8ff, emissive: 0x2a8fa8, emissiveIntensity: 0.7, transparent: true, opacity: 0.65, roughness: 0.3 }));
      dome.scale.y = 0.75; jelly.add(dome);
      for (let i = 0; i < 7; i++) {
        const a = i * Math.PI * 2 / 7;
        const pts = [];
        for (let j = 0; j <= 4; j++) pts.push(new THREE.Vector3(Math.sin(a) * 0.22, -j * 0.16, Math.cos(a) * 0.22));
        const tent = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 5, 0.008, 4, false),
          new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.5 }));
        jelly.add(tent);
      }
      jelly.position.set(-7, 3.2, -6);
      ctx.exterior.add(jelly);
      jelly.userData.tick = (t) => {
        jelly.position.y = 3.2 + Math.sin(t * 0.4) * 0.35;
        jelly.position.x = -7 + Math.sin(t * 0.23) * 0.8;
        jelly.scale.y = 0.9 + Math.sin(t * 1.1) * 0.08;
      };
    },

    update(ctx, dt, t) {
      // the framework already animates screens, lamps, gauges, life and exterior.
    },
  });
})();
