(function () {
  'use strict';
  const THREE = window.THREE;
  if (!THREE) { var ms = document.getElementById('menu-sub'); if (ms) ms.textContent = 'Could not load three.js (check your connection).'; return; }

  // ===================== constants =====================
  const FINISH_Z = -2600;   // "the tutorial" — a ~25-min gauntlet nobody is meant to survive
  const GATE_DOOR_Z = 120;
  const PORTAL_Z = 170;
  const GATE_TRIGGER_Z = 56;
  const WIN_Z = 156;
  const ROAD_W = 34;
  const CAR_R = 2.6;
  const MAXFWD = 118, MAXREV = -54, ACCEL = 60, BRAKE = 100, DRAG = 0.6;
  const TURN = 1.7;
  const CAM_DIST = 13.5, CAM_HEIGHT = 5.8, CAM_LOOK = 18, CAM_LAG = 5.5;

  const FOG_CALM = new THREE.Color('#1b2747');
  const FOG_BRUISE = new THREE.Color('#3c0a08');
  const FOG_COOL = new THREE.Color('#0e1330');
  const WARP_HUES = ['#c75aa3', '#19a39a', '#3146b0', '#f3a65a', '#ffe2a8', '#ffffff'];

  // ===================== state =====================
  let scene, camera, renderer, clock, sun, sunTarget;
  let car, carState;
  let gateLeft, gateRight, portal, portalGlow, homeLight, bruiseLight;
  const balls = [], fists = [], debris = [], ai = [], coins = [], smoke = [], sparks = [];
  let trex, kong;
  let state = 'menu';
  let attempts = 0, raceTime = 0, score = 0;
  let rejectedOnce = false, reverseSeen = false, gateOpen = false, gateAnim = 0;
  let crashTimer = 0, rejectTimer = 0, warpTimer = 0;
  let shake = 0, camS = 1, fov = 60, menuT = 0;
  let composer = null, bloomPass = null, useBloom = true;
  let mirrorRT = null, mirrorCam = null, mirrorScene = null, mirrorCam2D = null, mirrorOn = true;
  let shownLesson = 0;
  const TUT = ['',
    'Tutorial: welcome! This is the easy part.',
    'Lesson 2 — lovely driving. Only 47 lessons to go.',
    'Lesson 3 — most students graduate in about 20 minutes.',
    'Lesson 4 — the finish is straight ahead. It is right there.',
    'Lesson 5 — you have outlived 11 billion players. You will still lose.',
    'Lesson 6 — completion rate: 0.0000000%. You will be the first!',
    'Lesson 7 — almost there! (This is a lie. You are not.)',
    'Lesson 8 — despair is part of the curriculum.',
    'Final exam — and even if you pass, you do not graduate.'];
  let buildMode = false; const FLY = 60;
  const input = { up: false, down: false, left: false, right: false, flyUp: false, flyDown: false };

  // ===================== audio =====================
  const Audio = {
    ctx: null, master: null, engine: null, engine2: null, eg: null, lp: null, started: false, muted: false,
    radioOn: false, _static: null, _mt: null,
    start() {
      if (this.started) return;
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain(); this.master.gain.value = 0; this.master.connect(this.ctx.destination);
        this.master.gain.linearRampToValueAtTime(0.85, this.ctx.currentTime + 0.6);
        this.lp = this.ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 900; this.lp.connect(this.master);
        this.eg = this.ctx.createGain(); this.eg.gain.value = 0.06; this.eg.connect(this.lp);
        this.engine = this.ctx.createOscillator(); this.engine.type = 'sawtooth'; this.engine.frequency.value = 46; this.engine.connect(this.eg); this.engine.start();
        this.engine2 = this.ctx.createOscillator(); this.engine2.type = 'square'; this.engine2.frequency.value = 23; this.engine2.connect(this.eg); this.engine2.start();
        const d = this.ctx.createOscillator(), dg = this.ctx.createGain();
        d.type = 'sine'; d.frequency.value = 50; dg.gain.value = 0.025; d.connect(dg); dg.connect(this.master); d.start();
        this.started = true;
      } catch (e) { }
    },
    rev(s) {
      if (!this.started || this.muted) return;
      const f = 44 + Math.abs(s) * 1.7;
      this.engine.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
      this.engine2.frequency.setTargetAtTime(f * 0.5, this.ctx.currentTime, 0.05);
      this.lp.frequency.setTargetAtTime(650 + Math.abs(s) * 13, this.ctx.currentTime, 0.08);
    },
    noise(dur, freq, gain) {
      if (!this.started || this.muted) return;
      const n = this.ctx.createBufferSource(), buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate), dd = buf.getChannelData(0);
      for (let i = 0; i < dd.length; i++) dd[i] = Math.random() * 2 - 1;
      n.buffer = buf; const f = this.ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(freq, this.ctx.currentTime); f.frequency.exponentialRampToValueAtTime(110, this.ctx.currentTime + dur);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(gain, this.ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      n.connect(f); f.connect(g); g.connect(this.master); n.start();
    },
    sweep(f0, f1, dur, gain, type) {
      if (!this.started || this.muted) return;
      const o = this.ctx.createOscillator(); o.type = type || 'sawtooth';
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      g.gain.linearRampToValueAtTime(gain, this.ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      o.frequency.setValueAtTime(f0, this.ctx.currentTime); o.frequency.exponentialRampToValueAtTime(f1, this.ctx.currentTime + dur);
      o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime + dur + 0.05);
    },
    roar() { this.sweep(140, 60, 0.9, 0.3, 'sawtooth'); this.noise(0.7, 700, 0.25); },
    chord() {
      if (!this.started || this.muted) return;
      [392, 494, 587, 784].forEach((f, i) => {
        const o = this.ctx.createOscillator(); o.type = 'triangle'; const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, this.ctx.currentTime + i * 0.08);
        g.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + i * 0.08 + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 2.6);
        o.frequency.value = f; o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime + 2.8);
      });
    },
    emitMorse(text) {
      const unit = 0.085, base = this.ctx.currentTime + 0.05, map = { A: '.-', B: '-...', C: '-.-.', E: '.', G: '--.', K: '-.-', O: '---', R: '.-.', S: '...', V: '...-' };
      let t = base;
      for (const ch of text) { if (ch === ' ') { t += unit * 5; continue; } const code = map[ch] || ''; for (const sym of code) { const d = sym === '-' ? unit * 3 : unit; const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'sine'; o.frequency.value = 620; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.13, t + 0.008); g.gain.setValueAtTime(0.13, t + d - 0.012); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + d + 0.02); t += d + unit; } t += unit * 2; }
      return t - base;
    },
    startStatic() {
      if (this._static || !this.started) return;
      const n = this.ctx.createBufferSource(), buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
      n.buffer = buf; n.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.6;
      const g = this.ctx.createGain(); g.gain.value = 0.028;
      n.connect(f); f.connect(g); g.connect(this.master); n.start(); this._static = { n: n };
    },
    stopStatic() { if (this._static) { try { this._static.n.stop(); } catch (_) { } this._static = null; } },
    scheduleMorse() { if (!this.radioOn || !this.started) return; const dur = this.emitMorse('REVERSE'); this._mt = setTimeout(() => this.scheduleMorse(), (dur + 1.8) * 1000); },
    toggleRadio() { this.start(); this.radioOn = !this.radioOn; if (this.radioOn) { this.startStatic(); this.scheduleMorse(); } else { this.stopStatic(); if (this._mt) { clearTimeout(this._mt); this._mt = null; } } }
  };

  // ===================== material / texture helpers =====================
  function std(opt) { return new THREE.MeshStandardMaterial(opt); }
  function emis(color) { return new THREE.MeshBasicMaterial({ color }); }

  function skyCanvas() {
    const c = document.createElement('canvas'); c.width = 2048; c.height = 1024; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 1024);
    g.addColorStop(0.0, '#050b22'); g.addColorStop(0.32, '#0e1c45'); g.addColorStop(0.52, '#3a2f63');
    g.addColorStop(0.62, '#9a4a55'); g.addColorStop(0.69, '#ff8a3c'); g.addColorStop(0.74, '#ffd9a0');
    g.addColorStop(0.78, '#5a3a4a'); g.addColorStop(1.0, '#0a0712');
    x.fillStyle = g; x.fillRect(0, 0, 2048, 1024);
    // sun glow
    const sg = x.createRadialGradient(1024, 720, 10, 1024, 720, 360);
    sg.addColorStop(0, 'rgba(255,240,200,1)'); sg.addColorStop(0.25, 'rgba(255,180,90,0.8)'); sg.addColorStop(1, 'rgba(255,140,60,0)');
    x.fillStyle = sg; x.fillRect(0, 360, 2048, 600);
    x.fillStyle = '#fff3d6'; x.beginPath(); x.arc(1024, 720, 46, 0, 7); x.fill();
    // stars
    x.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 240; i++) { const sx = Math.random() * 2048, sy = Math.random() * 380; x.globalAlpha = Math.random() * 0.8; x.fillRect(sx, sy, 1.6, 1.6); }
    x.globalAlpha = 1;
    return c;
  }

  function windowsTex(hue) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#05060c'; x.fillRect(0, 0, 128, 256);
    const cols = 8, rows = 18;
    for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
      if (Math.random() < 0.55) {
        const lit = Math.random();
        x.fillStyle = lit > 0.7 ? hue : (lit > 0.4 ? '#ffd9a0' : '#16203a');
        x.fillRect(col * 16 + 3, r * 14 + 3, 10, 9);
      }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding; return t;
  }

  function makeSign(lines, w, h, opt) {
    opt = opt || {};
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const x = cv.getContext('2d');
    if (opt.mirror) { x.translate(512, 0); x.scale(-1, 1); }
    x.fillStyle = opt.bg || '#0c0f18'; x.fillRect(0, 0, 512, 256);
    x.strokeStyle = opt.border || '#ffcf8a'; x.lineWidth = 14; x.strokeRect(8, 8, 496, 240);
    x.fillStyle = opt.fg || '#ffe9bf'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const fs = opt.fs || 64; x.font = '700 ' + fs + 'px Georgia, serif';
    lines.forEach((l, i) => x.fillText(l, 256, 128 + (i - (lines.length - 1) / 2) * (fs + 12)));
    const tex = new THREE.CanvasTexture(cv); if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: opt.opacity || 1, side: opt.mirror ? THREE.DoubleSide : THREE.FrontSide }));
    return m;
  }

  // ===================== the DeLorean-style car =====================
  function buildCar() {
    const g = new THREE.Group();
    const steel = std({ color: '#c6cad2', metalness: 1.0, roughness: 0.22 }); steel.envMapIntensity = 1.6;
    const dark = std({ color: '#14161c', metalness: 0.6, roughness: 0.4 });
    const glass = std({ color: '#0a1118', metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.7 }); glass.envMapIntensity = 1.8;

    const lower = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.9, 8), steel); lower.position.y = 0.85; g.add(lower);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.5, 2.6), steel); hood.position.set(0, 1.2, -2.6); g.add(hood);
    const wedge = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.45, 2.2), steel); wedge.position.set(0, 1.0, -3.9); wedge.rotation.x = -0.18; g.add(wedge);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.15, 3.4), steel); cabin.position.set(0, 1.95, 0.3); g.add(cabin);
    const wind = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.95, 0.18), glass); wind.position.set(0, 2.05, -1.45); wind.rotation.x = 0.25; g.add(wind);
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 3.0), glass); sideL.position.set(-1.66, 2.0, 0.3); g.add(sideL);
    const sideR = sideL.clone(); sideR.position.x = 1.66; g.add(sideR);
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.2, 0.8), dark); spoiler.position.set(0, 1.7, 4.0); g.add(spoiler);
    // empty passenger seat — faintly warm
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 1.1), emis('#ffcf8a')); seat.material.transparent = true; seat.material.opacity = 0.35; seat.position.set(0.8, 1.7, 0.6); g.add(seat);

    const tireMat = std({ color: '#0c0c10', metalness: 0.1, roughness: 0.85 });
    const rimMat = std({ color: '#d8dce2', metalness: 1, roughness: 0.25 }); rimMat.envMapIntensity = 1.4;
    const tireGeo = new THREE.CylinderGeometry(1.05, 1.05, 0.9, 18);
    const rimGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.92, 12);
    const wheels = [];
    [[-2.05, -2.6], [2.05, -2.6], [-2.05, 2.8], [2.05, 2.8]].forEach(p => {
      const wg = new THREE.Group();
      const t = new THREE.Mesh(tireGeo, tireMat); t.rotation.z = Math.PI / 2; wg.add(t);
      const r = new THREE.Mesh(rimGeo, rimMat); r.rotation.z = Math.PI / 2; wg.add(r);
      wg.position.set(p[0], 0.95, p[1]); g.add(wg); wheels.push(wg);
    });

    const hlMat = new THREE.MeshBasicMaterial({ color: '#fff4d0' });
    [-1.2, 1.2].forEach(xx => { const h = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.2), hlMat); h.position.set(xx, 1.05, -4.9); g.add(h); });
    const tlMat = new THREE.MeshBasicMaterial({ color: '#ff3a2a' });
    [-1.2, 1.2].forEach(xx => { const h = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 0.15), tlMat); h.position.set(xx, 1.2, 4.45); g.add(h); });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(5, 9), new THREE.MeshBasicMaterial({ color: '#39d2ff', transparent: true, opacity: 0.35 }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.12; g.add(glow);

    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.userData.wheels = wheels;
    return g;
  }

  function buildRacer(color) {
    const g = new THREE.Group();
    const m = std({ color, metalness: 0.7, roughness: 0.3 }); m.envMapIntensity = 1.2;
    const b = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.1, 7), m); b.position.y = 0.9; g.add(b);
    const c = new THREE.Mesh(new THREE.BoxGeometry(3, 1.0, 3), m); c.position.set(0, 1.85, 0.3); g.add(c);
    const tireGeo = new THREE.CylinderGeometry(1, 1, 0.8, 12), tm = std({ color: '#0c0c10', roughness: 0.9 });
    [[-1.9, -2.2], [1.9, -2.2], [-1.9, 2.4], [1.9, 2.4]].forEach(p => { const w = new THREE.Mesh(tireGeo, tm); w.rotation.z = Math.PI / 2; w.position.set(p[0], 0.9, p[1]); g.add(w); });
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  function buildTrex() {
    const g = new THREE.Group();
    const skin = std({ color: '#2c3a2c', metalness: 0.2, roughness: 0.7 });
    const belly = std({ color: '#3a4a36', metalness: 0.2, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(9, 11, 20), skin); body.position.y = 24; body.rotation.x = 0.25; g.add(body);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(6, 7, 7), skin); neck.position.set(0, 33, -11); neck.rotation.x = -0.5; g.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(6.5, 6, 12), skin); head.position.set(0, 36, -18); g.add(head);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(6, 2.4, 11), belly); jaw.position.set(0, 32.5, -18); g.add(jaw);
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 8), emis('#ffdd33')); eyeL.position.set(-2.4, 38, -21); g.add(eyeL);
    const eyeR = eyeL.clone(); eyeR.position.x = 2.4; g.add(eyeR);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 18), skin); tail.position.set(0, 22, 16); tail.rotation.x = 0.4; g.add(tail);
    const legGeo = new THREE.BoxGeometry(4, 16, 5);
    const legL = new THREE.Mesh(legGeo, skin); legL.position.set(-3.5, 9, 2); g.add(legL);
    const legR = new THREE.Mesh(legGeo, skin); legR.position.set(3.5, 9, 2); g.add(legR);
    const footL = new THREE.Mesh(new THREE.BoxGeometry(5, 2.5, 8), skin); footL.position.set(-3.5, 1.2, 0); g.add(footL);
    const footR = footL.clone(); footR.position.x = 3.5; g.add(footR);
    const armGeo = new THREE.BoxGeometry(1.2, 4, 1.2);
    [-2.5, 2.5].forEach(xx => { const a = new THREE.Mesh(armGeo, skin); a.position.set(xx, 28, -8); g.add(a); });
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.userData = { legL, legR, head };
    return g;
  }

  function buildKong() {
    const g = new THREE.Group();
    const fur = std({ color: '#23201f', metalness: 0.1, roughness: 0.9 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(34, 44, 24), fur); torso.position.y = 70; g.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(22, 20, 20), fur); head.position.y = 100; g.add(head);
    const face = new THREE.Mesh(new THREE.BoxGeometry(16, 14, 4), std({ color: '#4a3f38', roughness: 0.8 })); face.position.set(0, 98, 10); g.add(face);
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 8), emis('#ffcc44')); eyeL.position.set(-5, 102, 11); g.add(eyeL);
    const eyeR = eyeL.clone(); eyeR.position.x = 5; g.add(eyeR);
    const armGeo = new THREE.BoxGeometry(11, 40, 11);
    const armL = new THREE.Mesh(armGeo, fur); armL.position.set(-22, 64, 0); g.add(armL);
    const armR = new THREE.Mesh(armGeo, fur); armR.position.set(22, 64, 0); g.add(armR);
    const legGeo = new THREE.BoxGeometry(13, 34, 13);
    [-9, 9].forEach(xx => { const l = new THREE.Mesh(legGeo, fur); l.position.set(xx, 31, 0); g.add(l); });
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.userData = { armR };
    return g;
  }

  // ===================== world =====================
  function buildWorld() {
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(FOG_CALM.clone(), 40, 620);

    // sky + environment reflections
    const sc = skyCanvas();
    const skyMap = new THREE.CanvasTexture(sc); if (THREE.sRGBEncoding) skyMap.encoding = THREE.sRGBEncoding;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1600, 40, 24), new THREE.MeshBasicMaterial({ map: skyMap, side: THREE.BackSide, depthWrite: false, fog: false }));
    scene.add(dome);
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envSrc = new THREE.CanvasTexture(sc); envSrc.mapping = THREE.EquirectangularReflectionMapping; if (THREE.sRGBEncoding) envSrc.encoding = THREE.sRGBEncoding;
      scene.environment = pmrem.fromEquirectangular(envSrc).texture;
    } catch (e) { }

    // lights
    sun = new THREE.DirectionalLight(0xffd2a0, 2.4);
    sun.position.set(-90, 110, 60); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 420;
    sun.shadow.camera.left = -90; sun.shadow.camera.right = 90; sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
    sun.shadow.bias = -0.0004;
    sunTarget = new THREE.Object3D(); scene.add(sunTarget); sun.target = sunTarget; scene.add(sun);
    scene.add(new THREE.HemisphereLight(0x3a5a9a, 0x140f18, 0.55));
    bruiseLight = new THREE.PointLight(0xff3b1e, 0, 600); bruiseLight.position.set(0, 40, -500); scene.add(bruiseLight);

    // ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), std({ color: '#0a0a10', metalness: 0.4, roughness: 0.6 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.06; ground.receiveShadow = true; scene.add(ground);

    // road (wet, reflective) — spans start to the distant finish
    const RLEN = 200 - (FINISH_Z - 80), RCEN = (200 + (FINISH_Z - 80)) / 2;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, RLEN), std({ color: '#0c0d14', metalness: 0.55, roughness: 0.28 }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0, RCEN); road.receiveShadow = true; scene.add(road);
    [-1, 1].forEach(s => { const e = new THREE.Mesh(new THREE.PlaneGeometry(0.7, RLEN), emis('#39d2ff')); e.rotation.x = -Math.PI / 2; e.position.set(s * (ROAD_W / 2 - 0.7), 0.02, RCEN); e.material.transparent = true; e.material.opacity = 0.85; scene.add(e); });
    for (let z = 200; z > FINISH_Z - 60; z -= 18) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 8), emis('#fff1cf')); d.rotation.x = -Math.PI / 2; d.position.set(0, 0.02, z); d.material.transparent = true; d.material.opacity = 0.6; scene.add(d); }

    // guard rails
    for (let z = 200; z > FINISH_Z - 60; z -= 32) {
      [-1, 1].forEach(s => { const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 4), std({ color: '#1a1d26', metalness: 0.8, roughness: 0.3 })); b.position.set(s * (ROAD_W / 2 + 2), 1.1, z); b.castShadow = true; scene.add(b); });
    }

    // NYC neon canyon — shared window-texture pool keeps the long city cheap
    const hues = ['#ff4d6d', '#39d2ff', '#7a5bff', '#ffd24d', '#36e0a0'];
    const winPool = []; for (let i = 0; i < 10; i++) { const wt = windowsTex(hues[i % hues.length]); wt.repeat.set(2, 7); winPool.push(wt); }
    for (let z = 180; z > FINISH_Z - 80; z -= 42) {
      [-1, 1].forEach(s => {
        const w = 18 + Math.random() * 26, h = 60 + Math.random() * 240, depth = 18 + Math.random() * 20;
        const off = ROAD_W / 2 + 22 + Math.random() * 100;
        const mat = std({ color: '#0a0c14', metalness: 0.85, roughness: 0.12, emissive: 0xffffff, emissiveMap: winPool[(Math.random() * winPool.length) | 0], emissiveIntensity: 1.0 }); mat.envMapIntensity = 1.0;
        const bld = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), mat);
        bld.position.set(s * off, h / 2, z + (Math.random() - 0.5) * 22); scene.add(bld);
      });
    }

    // sun strip sign far
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(150, 48), new THREE.MeshBasicMaterial({ color: '#ffe6bf', fog: false }));
    sunDisc.position.set(0, 170, FINISH_Z - 500); scene.add(sunDisc);

    // start line checker
    const cc = document.createElement('canvas'); cc.width = 256; cc.height = 32; const cx = cc.getContext('2d');
    for (let i = 0; i < 16; i++) { cx.fillStyle = i % 2 ? '#f3ecd6' : '#15151b'; cx.fillRect(i * 16, 0, 16, 32); }
    const stex = new THREE.CanvasTexture(cc);
    const sline = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 3.5), new THREE.MeshBasicMaterial({ map: stex })); sline.rotation.x = -Math.PI / 2; sline.position.y = 0.03; scene.add(sline);

    // finish banner
    const fg = new THREE.Group();
    [-1, 1].forEach(s => { const p = new THREE.Mesh(new THREE.BoxGeometry(2.4, 26, 2.4), std({ color: '#15171f', metalness: 0.7, roughness: 0.3 })); p.position.set(s * (ROAD_W / 2 + 1.5), 13, 0); p.castShadow = true; fg.add(p); });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(ROAD_W + 8, 5, 2.4), std({ color: '#15171f', metalness: 0.7, roughness: 0.3 })); bar.position.y = 24; fg.add(bar);
    const fsign = makeSign(['FINISH'], ROAD_W, 6, { bg: '#cf2f24', border: '#15151b', fg: '#fff2e2', fs: 96 }); fsign.position.set(0, 24, 1.4); fg.add(fsign);
    fg.position.z = FINISH_Z; scene.add(fg);

    // signage: the lie + the hint
    const lie = makeSign(['WIN', 'THIS WAY  ↑'], 20, 12, { bg: '#0f5a55', border: '#ffcf8a', fg: '#fdf6e3', fs: 70 }); lie.position.set(28, 9, -44); lie.rotation.y = -0.5; scene.add(lie);
    const hint = makeSign(['← THE', 'LONG WAY'], 18, 11, { bg: '#0a0e18', border: '#37507a', fg: '#7f93b8', fs: 60, opacity: 0.85 }); hint.position.set(-26, 7, 66); hint.rotation.y = 0.6; scene.add(hint);
    // only legible once you have turned around — faces back down the secret path
    const secret = makeSign(['THE FINISH WAS', 'NEVER AHEAD'], 24, 12, { bg: '#0a0e18', border: '#ffcf8a', fg: '#ffe2a8', fs: 52, mirror: true }); secret.position.set(0, 11, 100); secret.rotation.y = Math.PI; scene.add(secret);

    // "the tutorial": cheerful overhead banners that escalate from chipper to cruel
    const banners = [[-40, 'TUTORIAL', 'lesson 1 / 49'], [-320, 'LESSON 2', 'doing great!'], [-640, 'LESSON 3', 'graduates: 0'], [-1000, 'LESSON 4', '24 min to go'], [-1400, 'LESSON 5', 'keep it up!'], [-1800, 'LESSON 6', 'humility'], [-2200, 'LESSON 7', 'almost (not)'], [FINISH_Z + 130, 'FINAL EXAM', 'nobody passes']];
    banners.forEach(b => {
      const sgn = makeSign([b[1], b[2]], 26, 13, { bg: '#0b1413', border: '#7CFF9B', fg: '#e3fbe9', fs: 44 }); sgn.position.set(0, 16, b[0]); scene.add(sgn);
      [-1, 1].forEach(s => { const p = new THREE.Mesh(new THREE.BoxGeometry(1.6, 20, 1.6), std({ color: '#101810', metalness: 0.6, roughness: 0.4 })); p.position.set(s * (ROAD_W / 2 + 1), 10, b[0]); scene.add(p); });
    });

    // gate behind start
    const half = ROAD_W / 2 + 2;
    const gateMat = std({ color: '#1c2029', metalness: 0.85, roughness: 0.25 });
    gateLeft = new THREE.Mesh(new THREE.BoxGeometry(half, 14, 3), gateMat); gateLeft.position.set(-half / 2, 7, GATE_DOOR_Z); gateLeft.castShadow = true; scene.add(gateLeft);
    gateRight = new THREE.Mesh(new THREE.BoxGeometry(half, 14, 3), gateMat); gateRight.position.set(half / 2, 7, GATE_DOOR_Z); gateRight.castShadow = true; scene.add(gateRight);
    [-1, 1].forEach(s => { const p = new THREE.Mesh(new THREE.BoxGeometry(2.4, 16, 2.4), std({ color: '#101319', metalness: 0.7, roughness: 0.3 })); p.position.set(s * (ROAD_W / 2 + 2), 8, GATE_DOOR_Z); scene.add(p); });
    const gtop = new THREE.Mesh(new THREE.BoxGeometry(ROAD_W + 6, 3, 2.4), std({ color: '#101319', metalness: 0.7, roughness: 0.3 })); gtop.position.set(0, 15, GATE_DOOR_Z); scene.add(gtop);
    portalGlow = new THREE.Mesh(new THREE.CircleGeometry(15, 44), new THREE.MeshBasicMaterial({ color: '#ffcf8a', transparent: true, opacity: 0, fog: false })); portalGlow.position.set(0, 8, PORTAL_Z - 1); scene.add(portalGlow);
    portal = new THREE.Mesh(new THREE.CircleGeometry(9.5, 40), new THREE.MeshBasicMaterial({ color: '#ffe2a8', transparent: true, opacity: 0, fog: false })); portal.position.set(0, 8, PORTAL_Z); scene.add(portal);
    homeLight = new THREE.PointLight(0xffd27a, 0, 90); homeLight.position.set(0, 9, PORTAL_Z + 8); scene.add(homeLight);

    // hazards: wrecking balls down the whole length, escalating with depth
    const ballGeo = new THREE.SphereGeometry(3.4, 22, 16), ballMat = std({ color: '#2a2f38', metalness: 0.9, roughness: 0.35 }); ballMat.envMapIntensity = 1.3;
    let bi = 0;
    for (let z = -150; z > FINISH_Z + 120; z -= 132) {
      const depth = (-z) / (-FINISH_Z);
      const grp = new THREE.Group();
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 28, 6), std({ color: '#1a1d24', metalness: 0.9, roughness: 0.4 })); chain.position.y = 14; grp.add(chain);
      const ball = new THREE.Mesh(ballGeo, ballMat); ball.castShadow = true; grp.add(ball);
      grp.userData = { z: z, amp: 9 + depth * 7, freq: 0.5 + depth * 1.2, phase: bi * 1.3, ball }; grp.position.set(0, 28, z); scene.add(grp); balls.push(grp); bi++;
    }
    // slamming pillars, faster the deeper you go
    let fi = 0;
    for (let z = -430; z > FINISH_Z + 170; z -= 300) {
      const depth = (-z) / (-FINISH_Z);
      const f = new THREE.Mesh(new THREE.BoxGeometry(10, 16, 10), std({ color: '#181b22', metalness: 0.7, roughness: 0.4 })); f.position.set(0, 16, z); f.castShadow = true; scene.add(f);
      const sh = new THREE.Mesh(new THREE.CircleGeometry(8, 24), new THREE.MeshBasicMaterial({ color: '#ff2a14', transparent: true, opacity: 0.35, fog: false })); sh.rotation.x = -Math.PI / 2; sh.position.set(0, 0.05, z); scene.add(sh);
      f.userData = { z: z, phase: fi * 1.7, spd: 0.95 + depth * 0.9, shadow: sh }; fists.push(f); fi++;
    }

    // T-Rex and Kong
    trex = buildTrex(); trex.position.set(-46, 0, -1450); trex.rotation.y = 0.5; scene.add(trex);
    kong = buildKong(); kong.position.set(70, 0, FINISH_Z - 30); kong.rotation.y = -0.5; scene.add(kong);

    // rival racers
    const rc = ['#39d2ff', '#ffd24d', '#ff4d6d', '#7a5bff', '#36e0a0', '#ff8a3c', '#ffffff'];
    for (let i = 0; i < 7; i++) { const r = buildRacer(rc[i]); r.userData = { x: (Math.random() - 0.5) * (ROAD_W - 8), speed: 70 + Math.random() * 40, phase: Math.random() * 6, alive: true, t: Math.random() * 2 }; r.position.set(r.userData.x, 0, -10 - i * 8); scene.add(r); ai.push(r); }

    // coin / smoke / spark pools
    const coinGeo = new THREE.IcosahedronGeometry(0.7, 0), coinMat = std({ color: '#ffcf3a', metalness: 1, roughness: 0.25, emissive: 0x4a3500, emissiveIntensity: 0.5 }); coinMat.envMapIntensity = 1.4;
    for (let i = 0; i < 120; i++) { const m = new THREE.Mesh(coinGeo, coinMat); m.visible = false; m.castShadow = true; scene.add(m); coins.push({ mesh: m, vel: new THREE.Vector3(), life: 0 }); }
    const smGeo = new THREE.PlaneGeometry(3, 3);
    for (let i = 0; i < 70; i++) { const m = new THREE.Mesh(smGeo, new THREE.MeshBasicMaterial({ color: '#cfcfcf', transparent: true, opacity: 0, depthWrite: false })); m.visible = false; scene.add(m); smoke.push({ mesh: m, vel: new THREE.Vector3(), life: 0 }); }
    const spGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    for (let i = 0; i < 90; i++) { const m = new THREE.Mesh(spGeo, emis('#ff8a3c')); m.visible = false; scene.add(m); sparks.push({ mesh: m, vel: new THREE.Vector3(), life: 0 }); }

    // debris pool
    const dgeo = new THREE.BoxGeometry(2.6, 2.6, 2.6), dmat = std({ color: '#2a2e36', metalness: 0.5, roughness: 0.6 });
    for (let i = 0; i < 12; i++) { const d = new THREE.Mesh(dgeo, dmat); d.visible = false; d.castShadow = true; scene.add(d); debris.push({ mesh: d, active: false, vy: 0, life: 0 }); }

    // car
    car = buildCar(); scene.add(car);
    carState = { pos: new THREE.Vector3(0, 0, 8), heading: 0, speed: 0, steer: 0 };
    applyCar();
  }

  function applyCar() {
    car.position.copy(carState.pos); car.rotation.y = carState.heading;
    car.rotation.z = -carState.steer * Math.min(Math.abs(carState.speed) / MAXFWD, 1) * 0.18;
    car.rotation.x = -Math.min(Math.abs(carState.speed) / MAXFWD, 1) * 0.03 * Math.sign(carState.speed);
  }
  function fwdVec(h) { return new THREE.Vector3(Math.sin(h), 0, -Math.cos(h)); }

  // ===================== fx =====================
  function burstCoins(p) {
    let n = 0;
    for (let i = 0; i < coins.length && n < 16; i++) { const c = coins[i]; if (c.life > 0) continue; c.mesh.position.copy(p); c.mesh.position.y += 2; c.mesh.visible = true; c.vel.set((Math.random() - 0.5) * 22, Math.random() * 24 + 12, (Math.random() - 0.5) * 22); c.life = 1.6; n++; }
    Audio.sweep(700, 1600, 0.3, 0.08, 'square');
  }
  function burstSparks(p, color) {
    for (let i = 0; i < sparks.length; i++) { const s = sparks[i]; if (s.life > 0) continue; s.mesh.material.color.set(color); s.mesh.position.copy(p); s.mesh.position.y += 1.5; s.mesh.visible = true; s.vel.set((Math.random() - 0.5) * 34, Math.random() * 26 + 6, (Math.random() - 0.5) * 34); s.life = 0.9 + Math.random() * 0.4; if (i > 40) break; }
  }
  function puffSmoke(p) {
    for (let i = 0; i < smoke.length; i++) { const s = smoke[i]; if (s.life > 0) continue; s.mesh.position.copy(p); s.mesh.position.y += 0.8; s.mesh.visible = true; s.mesh.material.opacity = 0.5; s.vel.set((Math.random() - 0.5) * 4, 3 + Math.random() * 3, (Math.random() - 0.5) * 4); s.life = 1.1; return; }
  }

  // ===================== events =====================
  function setHint(t) { const el = document.getElementById('hint'); el.textContent = t; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
  function flash(color, a) { const f = document.getElementById('flash'); f.style.background = color; f.style.opacity = a; setTimeout(() => { f.style.opacity = 0; }, 90); }
  function updateAttempts() { document.getElementById('attempts').textContent = 'attempts  ' + String(attempts).padStart(2, '0'); document.getElementById('score').textContent = 'coins  ' + String(score).padStart(4, '0'); }

  function crash() {
    if (state !== 'drive') return;
    state = 'crashed'; crashTimer = 1.6; attempts++; carState.speed = 0;
    burstSparks(carState.pos, '#ff7a2c'); burstCoins(carState.pos); shake = 1.2; flash('#cf2f24', 0.55); Audio.noise(0.5, 1200, 0.5);
    updateAttempts();
    if (attempts === 1) setHint('Tutorial: do not worry — everyone fails Lesson 1.');
    else if (attempts === 2) setHint('Tutorial: …and Lesson 1. And Lesson 1. Again!');
    else if (attempts === 3) setHint('Tutorial: you are in the 0th percentile. Keep going!');
    else if (attempts < 6) setHint('Tutorial: has it occurred to you that forward is the trap?');
    else setHint('Tutorial: what direction did we never actually teach you?');
  }
  function rejectFinish() { state = 'rejected'; rejectTimer = 3.4; rejectedOnce = true; document.getElementById('reject').classList.add('show'); Audio.sweep(440, 110, 0.8, 0.18, 'sawtooth'); }
  function triggerGate() { if (gateOpen) return; gateOpen = true; gateAnim = 0; Audio.sweep(180, 1300, 1.6, 0.16, 'triangle'); setHint('A gate that was never on the map.'); flash('#ffcf8a', 0.25); }
  function win() { if (state === 'warp' || state === 'won') return; state = 'warp'; warpTimer = 0; Audio.chord(); }
  function respawn() { carState.pos.set(0, 0, 8); carState.heading = 0; carState.speed = 0; carState.steer = 0; applyCar(); state = 'drive'; }

  function startRace() {
    Audio.start();
    document.getElementById('menu').classList.add('hidden');
    document.body.classList.add('playing');
    if (renderer && renderer.domElement) { renderer.domElement.tabIndex = 0; try { renderer.domElement.focus(); } catch (e) { } }
    state = 'drive'; raceTime = 0; setHint('Straight ahead. Fast as you can. That is the whole game.');
  }
  function restart() {
    document.getElementById('won').classList.remove('show');
    attempts = 0; raceTime = 0; score = 0; shownLesson = 0; rejectedOnce = false; reverseSeen = false; gateOpen = false; gateAnim = 0;
    gateLeft.position.x = -(ROAD_W / 2 + 2) / 2; gateRight.position.x = (ROAD_W / 2 + 2) / 2;
    portal.material.opacity = 0; portalGlow.material.opacity = 0; homeLight.intensity = 0;
    document.getElementById('wrongway').classList.remove('show'); fov = 60; camS = 1;
    updateAttempts(); respawn(); setHint('Straight ahead. Fast as you can. That is the whole game.');
  }

  // ===================== update =====================
  function update(dt) {
    menuT += dt;
    if (state === 'menu') { menuCamera(); updateFx(dt); updateHazards(dt); return; }
    if (state === 'crashed') { crashTimer -= dt; if (crashTimer <= 0) respawn(); }
    if (state === 'rejected') { rejectTimer -= dt; if (rejectTimer <= 0) { document.getElementById('reject').classList.remove('show'); respawn(); setHint('You crossed the finish. It did not count. You had not understood yet.'); } }
    if (state === 'drive') { raceTime += dt; drivePhysics(dt); checkCollisions(); checkTriggers(); }
    if (state === 'warp') warpUpdate(dt);
    updateHazards(dt); updateFx(dt); updateGate(dt); chaseCamera(dt); updateSun(); updateFog(dt); updateHUD();
  }

  function drivePhysics(dt) {
    const s = carState;
    const maxF = buildMode ? 320 : MAXFWD, maxR = buildMode ? -180 : MAXREV;
    const acc = buildMode ? 150 : ACCEL, brk = buildMode ? 170 : BRAKE;
    if (input.up) s.speed += acc * dt; else if (input.down) s.speed -= brk * dt;
    s.speed -= s.speed * DRAG * dt;
    if (!input.up && !input.down && Math.abs(s.speed) < 1.2) s.speed = 0;
    s.speed = Math.max(maxR, Math.min(maxF, s.speed));
    const steerT = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    // snappy toward input, very fast self-centering on release (kills the wander)
    s.steer += (steerT - s.steer) * Math.min(1, (steerT === 0 ? 14 : 7) * dt);
    if (steerT === 0 && Math.abs(s.steer) < 0.02) s.steer = 0;
    const sf = Math.min(Math.abs(s.speed) / MAXFWD, 1);
    const grip = Math.min(Math.abs(s.speed) / 8, 1);
    s.heading += s.steer * TURN * (1 - 0.5 * sf) * dt * grip;   // speed-sensitive: calm at top end
    const f = fwdVec(s.heading);
    s.pos.addScaledVector(f, s.speed * dt);
    if (buildMode) {
      if (input.flyUp) s.pos.y += FLY * dt;
      if (input.flyDown) s.pos.y -= FLY * dt;
      s.pos.y = Math.max(0, Math.min(170, s.pos.y));
      s.pos.x = Math.max(-220, Math.min(220, s.pos.x));   // noclip: roam anywhere
    } else {
      // solid rails: stay on the road instead of drifting into the void
      const lim = ROAD_W / 2 - 1.6;
      if (s.pos.x > lim) { s.pos.x = lim; s.speed *= 0.9; if (Math.random() < 0.4) puffSmoke(new THREE.Vector3(s.pos.x, 0, s.pos.z)); }
      else if (s.pos.x < -lim) { s.pos.x = -lim; s.speed *= 0.9; if (Math.random() < 0.4) puffSmoke(new THREE.Vector3(s.pos.x, 0, s.pos.z)); }
      s.pos.y = 0;
    }
    s.pos.z = Math.max(FINISH_Z - 40, Math.min(220, s.pos.z));
    applyCar();
    car.userData.wheels.forEach(w => { w.rotation.x += s.speed * dt * 0.5; });
    Audio.rev(s.speed);
    if (!buildMode && Math.abs(s.steer) > 0.5 && Math.abs(s.speed) > 45 && Math.random() < 0.5) puffSmoke(new THREE.Vector3(s.pos.x, 0, s.pos.z + 3));
    if (!buildMode && s.pos.z < -40 && s.speed > 60 && Math.random() < dt * 1.8) spawnDebris(s.pos.z - 120 - Math.random() * 60);
    if (!reverseSeen && s.pos.z > 24) { reverseSeen = true; setHint('…oh. You turned around. The map ends here. Keep going.'); document.getElementById('wrongway').classList.add('show'); }
  }

  function spawnDebris(z) { for (let i = 0; i < debris.length; i++) { const d = debris[i]; if (d.active) continue; d.active = true; d.life = 4; d.vy = 0; d.mesh.visible = true; d.mesh.position.set((Math.random() - 0.5) * (ROAD_W - 4), 36, z); d.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3); return; } }

  function checkCollisions() {
    if (buildMode) return;   // build mode: invincible, finish never rejects
    const p = carState.pos;
    for (const g of balls) { const b = g.userData.ball; const dx = p.x - (g.position.x + b.position.x), dz = p.z - g.position.z; if (dx * dx + dz * dz < (3.4 + CAR_R) * (3.4 + CAR_R)) return crash(); }
    for (const f of fists) { if (f.position.y < 6) { const dx = p.x - f.position.x, dz = p.z - f.position.z; if (Math.abs(dx) < 6 + CAR_R && Math.abs(dz) < 6 + CAR_R) return crash(); } }
    for (const d of debris) { if (!d.active || d.mesh.position.y > 3.4) continue; const dx = p.x - d.mesh.position.x, dz = p.z - d.mesh.position.z; if (dx * dx + dz * dz < 16) return crash(); }
    if (trex.userData.stomp && Math.abs(p.x - trex.userData.footX) < 7 && Math.abs(p.z - (trex.position.z + 2)) < 8) return crash();
    if (kong.userData.smash && p.z < FINISH_Z + 60 && Math.abs(p.x) < 22) return crash();
    if (p.z < FINISH_Z + 8) return rejectFinish();
  }
  function checkTriggers() { const p = carState.pos; if (p.z > GATE_TRIGGER_Z) triggerGate(); if (gateOpen && p.z > WIN_Z) win(); }

  function updateHazards(dt) {
    const t = clock.elapsedTime;
    for (const g of balls) { g.userData.ball.position.x = Math.sin(t * g.userData.freq + g.userData.phase) * g.userData.amp; g.children[0].rotation.z = Math.sin(t * g.userData.freq + g.userData.phase) * 0.45; }
    for (const f of fists) { const cyc = (Math.sin(t * f.userData.spd + f.userData.phase) + 1) / 2, slam = Math.pow(1 - cyc, 4); f.position.y = 16 - slam * 12; f.userData.shadow.material.opacity = 0.15 + slam * 0.4; f.userData.shadow.scale.setScalar(1.3 - slam * 0.5); if (slam > 0.93 && Math.random() < 0.3) Audio.noise(0.2, 400, 0.18); }
    // T-Rex
    const tc = (Math.sin(t * 0.7) + 1) / 2, tstomp = Math.pow(Math.max(0, Math.sin(t * 0.7)), 6);
    trex.userData.legL.rotation.x = Math.sin(t * 2) * 0.3; trex.userData.legR.rotation.x = -Math.sin(t * 2) * 0.3;
    trex.position.x = -46 + tc * 30; trex.userData.footX = trex.position.x; trex.userData.stomp = tstomp > 0.5;
    trex.position.y = tstomp * 2; trex.userData.head.rotation.x = Math.sin(t * 1.3) * 0.15;
    if (tstomp > 0.6 && Math.random() < 0.04) Audio.roar();
    // Kong
    const kc = Math.sin(t * 0.5 + 1); kong.userData.armR.rotation.z = -0.4 + Math.max(0, kc) * 1.2; kong.userData.smash = kc > 0.85; kong.rotation.y = -0.5 + Math.sin(t * 0.3) * 0.1;
    if (kong.userData.smash && Math.random() < 0.05) { Audio.noise(0.4, 300, 0.25); }
    // debris
    for (const d of debris) { if (!d.active) continue; d.vy -= 62 * dt; d.mesh.position.y += d.vy * dt; d.mesh.rotation.x += dt; d.mesh.rotation.z += dt * 0.7; if (d.mesh.position.y < 1.3) { d.mesh.position.y = 1.3; d.vy = 0; } d.life -= dt; if (d.life <= 0) { d.active = false; d.mesh.visible = false; } }
    // rival racers
    for (const r of ai) {
      if (!r.userData.alive) { r.userData.t -= dt; if (r.userData.t <= 0) { r.userData.alive = true; r.visible = true; r.position.set(r.userData.x, 0, 6); } continue; }
      r.position.z -= r.userData.speed * dt; r.position.x = r.userData.x + Math.sin(t * 1.2 + r.userData.phase) * 6;
      let dead = false;
      for (const g of balls) { if (Math.abs(r.position.z - g.position.z) < 4 && Math.abs(r.position.x - g.userData.ball.position.x) < 4) dead = true; }
      for (const f of fists) { if (f.position.y < 6 && Math.abs(r.position.z - f.position.z) < 7 && Math.abs(r.position.x) < 7) dead = true; }
      if (r.position.z < FINISH_Z + 40) dead = true;
      if (dead) { r.userData.alive = false; r.visible = false; r.userData.t = 2 + Math.random() * 3; burstCoins(r.position); burstSparks(r.position, '#39d2ff'); }
    }
  }

  function updateFx(dt) {
    for (const c of coins) { if (c.life <= 0) continue; c.vel.y -= 42 * dt; c.mesh.position.addScaledVector(c.vel, dt); c.mesh.rotation.x += dt * 6; c.mesh.rotation.y += dt * 7; if (c.mesh.position.y < 0.7) { c.mesh.position.y = 0.7; c.vel.y *= -0.4; c.vel.x *= 0.7; c.vel.z *= 0.7; } c.life -= dt; if (c.life <= 0) c.mesh.visible = false; if (state === 'drive') { const dx = c.mesh.position.x - carState.pos.x, dz = c.mesh.position.z - carState.pos.z; if (dx * dx + dz * dz < 12) { c.life = 0; c.mesh.visible = false; score += 5; updateAttempts(); } } }
    for (const s of sparks) { if (s.life <= 0) continue; s.vel.y -= 40 * dt; s.mesh.position.addScaledVector(s.vel, dt); if (s.mesh.position.y < 0.3) { s.mesh.position.y = 0.3; s.vel.y *= -0.4; s.vel.multiplyScalar(0.6); } s.life -= dt; s.mesh.scale.setScalar(Math.max(0.1, s.life)); if (s.life <= 0) s.mesh.visible = false; }
    for (const s of smoke) { if (s.life <= 0) continue; s.mesh.position.addScaledVector(s.vel, dt); s.mesh.lookAt(camera.position); s.mesh.material.opacity = s.life * 0.45; s.mesh.scale.setScalar(1 + (1.1 - s.life) * 3); s.life -= dt; if (s.life <= 0) s.mesh.visible = false; }
  }

  function updateGate(dt) {
    if (!gateOpen) return;
    gateAnim = Math.min(1, gateAnim + dt * 0.7);
    const open = gateAnim * (ROAD_W / 2 + 5), base = (ROAD_W / 2 + 2) / 2;
    gateLeft.position.x = -base - open; gateRight.position.x = base + open;
    portal.material.opacity = gateAnim * (0.85 + Math.sin(clock.elapsedTime * 4) * 0.1);
    portalGlow.material.opacity = gateAnim * 0.45; portalGlow.scale.setScalar(1 + Math.sin(clock.elapsedTime * 3) * 0.08);
    homeLight.intensity = gateAnim * 2.4;
  }

  function menuCamera() { const a = menuT * 0.16; camera.position.set(Math.sin(a) * 38, 13 + Math.sin(menuT * 0.5) * 2, 44 + Math.cos(a) * 30); camera.lookAt(0, 4, 10); }

  function chaseCamera(dt) {
    const s = carState, sign = Math.abs(s.speed) < 2 ? camS : (s.speed >= 0 ? 1 : -1);
    camS += (sign - camS) * Math.min(1, dt * 3);
    const f = fwdVec(s.heading), desired = s.pos.clone().addScaledVector(f, -camS * CAM_DIST); desired.y += CAM_HEIGHT;
    camera.position.lerp(desired, Math.min(1, dt * CAM_LAG));
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 2; camera.position.y += (Math.random() - 0.5) * shake * 2; shake = Math.max(0, shake - dt * 2.2); }
    const look = s.pos.clone().addScaledVector(f, camS * CAM_LOOK); look.y += 1.6; camera.lookAt(look);
    const tf = 60 + Math.min(Math.abs(s.speed) / MAXFWD, 1) * 22; fov += (tf - fov) * Math.min(1, dt * 4); camera.fov = fov; camera.updateProjectionMatrix();
  }
  function updateSun() { if (!sun) return; const p = state === 'menu' ? new THREE.Vector3(0, 0, 0) : carState.pos; sun.position.set(p.x - 90, 120, p.z + 60); sunTarget.position.set(p.x, 0, p.z - 30); sunTarget.updateMatrixWorld(); }

  function updateFog(dt) {
    const p = carState ? carState.pos : new THREE.Vector3(); let target;
    if (p.z > 14) target = FOG_COOL;
    else { const danger = Math.min(1, (-p.z) / (-FINISH_Z)) * Math.min(1, Math.abs(carState.speed) / 55 + 0.25); target = FOG_CALM.clone().lerp(FOG_BRUISE, danger); if (bruiseLight) { bruiseLight.intensity = danger * 4; bruiseLight.position.z = p.z - 30; } }
    scene.fog.color.lerp(target, Math.min(1, dt * 1.5));
  }

  function warpUpdate(dt) {
    warpTimer += dt;
    const idx = Math.min(WARP_HUES.length - 1, Math.floor((warpTimer / 2.2) * WARP_HUES.length));
    scene.fog.color.lerp(new THREE.Color(WARP_HUES[idx]), Math.min(1, dt * 9));
    if (renderer) renderer.toneMappingExposure = 1.0 + warpTimer * 0.6;
    fov += (120 - fov) * Math.min(1, dt * 5); camera.fov = fov; camera.updateProjectionMatrix(); shake = 0.7;
    carState.pos.addScaledVector(fwdVec(carState.heading), -12 * dt); applyCar();
    if (warpTimer > 2.2) { state = 'won'; flash('#ffffff', 0.95); if (renderer) renderer.toneMappingExposure = 1.05; setTimeout(() => { document.getElementById('won').classList.add('show'); }, 220); }
  }

  function updateHUD() {
    document.getElementById('speedval').textContent = Math.round(Math.abs(carState.speed) * 2.6);
    const m = Math.floor(raceTime / 60), sec = Math.floor(raceTime % 60), cs = Math.floor((raceTime * 100) % 100);
    document.getElementById('timer').textContent = String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0') + '.' + String(cs).padStart(2, '0');
    const g = document.getElementById('gear'); g.textContent = carState.speed > 2 ? 'D' : carState.speed < -2 ? 'R' : 'N'; g.style.color = carState.speed < -2 ? '#8fe388' : '#fdf6e3';
    // "tutorial" panel — lesson derived from how deep into the trap you are
    const depth = Math.max(0, Math.min(1, (-carState.pos.z) / (-FINISH_Z)));
    const lesson = Math.min(9, 1 + Math.floor(depth * 8.999));
    const tl = document.getElementById('tut-lesson'); if (tl) tl.textContent = 'lesson ' + lesson + ' / 49';
    const tp = document.getElementById('tut-prog'); if (tp) tp.textContent = (depth * 100 * 9 / 49).toFixed(5) + '% complete';
    if (!buildMode && state === 'drive' && lesson > shownLesson) { shownLesson = lesson; setHint(TUT[Math.min(lesson, TUT.length - 1)]); }
    if (buildMode) { const bi = document.getElementById('build-info'); if (bi) bi.textContent = 'z ' + Math.round(carState.pos.z) + ' · y ' + Math.round(carState.pos.y) + ' · lesson ' + lesson + ' / 49'; }
  }

  // ===================== loop / input / init =====================
  function buildComposer() {
    if (!(THREE.EffectComposer && THREE.RenderPass && THREE.UnrealBloomPass)) return;
    try {
      const s = vp();
      composer = new THREE.EffectComposer(renderer);
      composer.addPass(new THREE.RenderPass(scene, camera));
      bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(s.w, s.h), 0.7, 0.5, 0.82);
      composer.addPass(bloomPass);
      composer.setSize(s.w, s.h);
    } catch (e) { composer = null; }
  }
  function buildMirror() {
    try {
      mirrorRT = new THREE.WebGLRenderTarget(720, 200, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      if (THREE.sRGBEncoding) mirrorRT.texture.encoding = THREE.sRGBEncoding;
      mirrorCam = new THREE.PerspectiveCamera(74, 720 / 200, 0.1, 2400);
      mirrorScene = new THREE.Scene();
      mirrorCam2D = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10); mirrorCam2D.position.z = 5;
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: '#04060b' }));
      frame.scale.set(0.64, 0.205, 1); frame.position.set(0, 0.77, 0); mirrorScene.add(frame);
      const trim = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: '#39d2ff' }));
      trim.scale.set(0.625, 0.19, 1); trim.position.set(0, 0.77, 0.05); mirrorScene.add(trim);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: mirrorRT.texture }));
      glass.scale.set(-0.60, 0.175, 1); glass.position.set(0, 0.77, 0.1); mirrorScene.add(glass); // negative x = mirror flip
    } catch (e) { mirrorRT = null; }
  }
  function updateMirror() {
    const f = fwdVec(carState.heading);
    mirrorCam.position.copy(carState.pos).addScaledVector(f, 2); mirrorCam.position.y += 3.4;
    const tgt = carState.pos.clone().addScaledVector(f, -60); tgt.y += 2.5; mirrorCam.lookAt(tgt);
  }
  let lastTick = 0, mirrorFrame = 0;
  function step(fixed) {
    const dt = fixed != null ? fixed : Math.min(0.05, clock.getDelta());
    update(dt);
    // main view
    if (composer && useBloom) composer.render(dt); else renderer.render(scene, camera);
    // rear-view mirror: render the scene from a backward camera, overlay it on top
    if (mirrorOn && mirrorRT && state !== 'menu') {
      if ((mirrorFrame++ & 1) === 0) {   // refresh the texture every other frame (perf)
        updateMirror();
        const prevAuto = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
        renderer.setRenderTarget(mirrorRT); renderer.clear(); renderer.render(scene, mirrorCam); renderer.setRenderTarget(null);
        renderer.shadowMap.autoUpdate = prevAuto;
      }
      const ac = renderer.autoClear; renderer.autoClear = false; renderer.clearDepth();
      renderer.render(mirrorScene, mirrorCam2D); renderer.autoClear = ac;
    }
    lastTick = (window.performance || Date).now();
  }
  function loop() { requestAnimationFrame(loop); step(); }
  function vp() { return { w: Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1280), h: Math.max(1, window.innerHeight || document.documentElement.clientHeight || 720) }; }
  function onResize() { const s = vp(); camera.aspect = s.w / s.h; camera.updateProjectionMatrix(); renderer.setSize(s.w, s.h); if (composer) composer.setSize(s.w, s.h); if (bloomPass) bloomPass.setSize(s.w, s.h); }

  function keymap(e, down) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': input.up = down; break;
      case 'KeyS': case 'ArrowDown': input.down = down; break;
      case 'KeyA': case 'ArrowLeft': input.left = down; break;
      case 'KeyD': case 'ArrowRight': input.right = down; break;
      case 'Space': input.flyUp = down; break;
      case 'KeyC': input.flyDown = down; break;
    }
  }
  function holdBtn(id, prop) {
    const el = document.getElementById(id); if (!el) return;
    const on = e => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (_) { } input[prop] = true; el.classList.add('active'); Audio.start(); };
    const off = e => { if (e) e.preventDefault(); input[prop] = false; el.classList.remove('active'); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('lostpointercapture', off);
  }
  function clearInput() { input.up = input.down = input.left = input.right = input.flyUp = input.flyDown = false; ['t-up', 't-down', 't-left', 't-right'].forEach(id => { const e = document.getElementById(id); if (e) e.classList.remove('active'); }); }

  function init() {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    { const s0 = vp(); renderer.setSize(s0.w, s0.h); }
    if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
    if (THREE.ACESFilmicToneMapping) renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.id = 'gl'; renderer.domElement.tabIndex = 0;
    document.body.insertBefore(renderer.domElement, document.body.firstChild);

    camera = new THREE.PerspectiveCamera(60, vp().w / vp().h, 0.1, 3000);
    camera.position.set(0, 13, 66);
    clock = new THREE.Clock();
    buildWorld(); buildComposer(); buildMirror(); updateAttempts();
    window.__dbg = function () { return { state: state, z: +carState.pos.z.toFixed(1), x: +carState.pos.x.toFixed(1), speed: +carState.speed.toFixed(1), canvas: renderer.domElement.width + 'x' + renderer.domElement.height }; };

    window.addEventListener('resize', onResize);
    window.addEventListener('load', onResize);
    setTimeout(onResize, 60); setTimeout(onResize, 300); setTimeout(onResize, 1000);
    if (window.ResizeObserver) { try { new ResizeObserver(onResize).observe(document.documentElement); } catch (e) { } }
    const kd = e => {
      keymap(e, true);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
      if (e.repeat) return;   // toggles fire on the initial press only, not on key-repeat
      if (e.code === 'KeyM') { Audio.muted = !Audio.muted; if (Audio.master) Audio.master.gain.value = Audio.muted ? 0 : 0.85; }
      if (e.code === 'KeyB') { useBloom = !useBloom; }
      if (e.code === 'KeyV') { mirrorOn = !mirrorOn; }
      if (e.code === 'KeyG') {
        buildMode = !buildMode;
        const bd = document.getElementById('build');
        if (buildMode) { if (state === 'menu') startRace(); state = 'drive'; if (bd) bd.classList.add('on'); setHint('Build mode: invincible. Keys 1–9 jump to a lesson · Space / C fly · G to exit.'); }
        else { carState.pos.y = 0; if (bd) bd.classList.remove('on'); }
      }
      if (buildMode && e.code.length === 6 && e.code.indexOf('Digit') === 0) {
        const k = parseInt(e.code.charAt(5), 10);
        if (k >= 1 && k <= 9) { carState.pos.set(0, carState.pos.y, (k - 1) / 8 * FINISH_Z); carState.heading = 0; carState.speed = 0; }
      }
      if (e.code === 'KeyF') { Audio.toggleRadio(); const r = document.getElementById('radio'); if (r) r.classList.toggle('on', Audio.radioOn); if (Audio.radioOn) setHint('A frequency that should not exist. The static is Morse. Decode it.'); }
      if (e.code === 'Enter' && state === 'menu') startRace();
      if (e.code === 'KeyR' && state === 'won') restart();
      Audio.start();
    };
    const ku = e => keymap(e, false);
    window.addEventListener('keydown', kd);   // single listener — registering on both window AND document
    window.addEventListener('keyup', ku);      // fired every toggle twice, cancelling itself out
    window.addEventListener('blur', clearInput);
    document.addEventListener('visibilitychange', function () { if (document.hidden) clearInput(); });

    document.getElementById('drive-btn').addEventListener('click', startRace);
    document.getElementById('again-btn').addEventListener('click', restart);
    holdBtn('t-up', 'up'); holdBtn('t-down', 'down'); holdBtn('t-left', 'left'); holdBtn('t-right', 'right');

    window.__step = step;
    loop();
    // watchdog: if rAF stalls (throttled/backgrounded panel), keep the sim alive
    setInterval(function () { if (((window.performance || Date).now()) - lastTick > 150) step(); }, 40);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
