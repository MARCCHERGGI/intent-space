// JARVIS v1 Earth scene — vanilla port of JARVIS_HOME's SleepScene.
// Photoreal Earth (day/night/water/topo shaders), thin atmosphere, stars,
// 4 satellite rings, slow rotation. Runs as an ES module via Three.js CDN.

import * as THREE from 'https://unpkg.com/three@0.169.0/build/three.module.js';

// ─────────── astronomy (subsolar point) ───────────
function sunDirection(d = new Date()) {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const N = Math.floor((d.getTime() - start) / 86_400_000);
  const decl = 23.44 * Math.sin(((360 / 365) * (N - 81) * Math.PI) / 180);
  const utc = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const sublon = (12 - utc) * 15;
  const lat = (decl * Math.PI) / 180;
  const lon = (sublon * Math.PI) / 180;
  return new THREE.Vector3(
    Math.cos(lat) * Math.cos(lon),
    Math.sin(lat),
    -Math.cos(lat) * Math.sin(lon),
  ).normalize();
}

// ─────────── shaders (ported verbatim from earthShaders.ts) ───────────
const earthVertex = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const earthFragment = `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uSpec;
  uniform sampler2D uTopo;
  uniform vec3 uSunDir;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  vec3 perturbNormal(vec2 uv, vec3 N) {
    vec2 du = vec2(1.0/4096.0, 0.0);
    vec2 dv = vec2(0.0, 1.0/2048.0);
    float hL = texture2D(uTopo, uv - du).r;
    float hR = texture2D(uTopo, uv + du).r;
    float hD = texture2D(uTopo, uv - dv).r;
    float hU = texture2D(uTopo, uv + dv).r;
    vec3 grad = vec3(hR - hL, hU - hD, 0.03);
    return normalize(N + grad * 0.6);
  }
  void main() {
    vec3 baseN = normalize(vNormal);
    vec3 N = perturbNormal(vUv, baseN);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float sunDot = dot(N, uSunDir);
    float daylight = smoothstep(-0.05, 0.10, sunDot);
    vec3 day = texture2D(uDay, vUv).rgb;
    vec3 night = texture2D(uNight, vUv).rgb;
    float water = texture2D(uSpec, vUv).r;
    vec3 oceanDeep = vec3(0.01, 0.04, 0.09);
    day = mix(day, oceanDeep + day * 0.45, water * 0.55);
    vec3 dayLit = day * (0.04 + 1.45 * daylight);
    float luma = dot(dayLit, vec3(0.299, 0.587, 0.114));
    dayLit = mix(vec3(luma), dayLit, 1.55);
    vec3 nightLit = night * 3.8 * (1.0 - daylight);
    vec3 color = dayLit + nightLit;
    vec3 R = reflect(-uSunDir, baseN);
    float specHL = pow(max(dot(V, R), 0.0), 140.0) * water * daylight;
    color += vec3(1.0, 0.96, 0.82) * specHL * 3.2;
    float rim = pow(1.0 - max(dot(V, baseN), 0.0), 3.2);
    color += vec3(0.22, 0.42, 0.85) * rim * daylight * 0.32;
    gl_FragColor = vec4(color, 1.0);
  }
`;
const atmosphereVertex = `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const atmosphereFragment = `
  uniform vec3 uSunDir;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float NdotV = max(dot(N, V), 0.0);
    float sunDot = dot(N, uSunDir);
    float atmos = pow(1.0 - NdotV, 3.5);
    float sunLit = smoothstep(-0.35, 0.25, sunDot);
    vec3 atmColor = mix(
      vec3(0.01, 0.02, 0.06),
      vec3(0.20, 0.45, 0.90),
      sunLit
    );
    float alpha = atmos * (0.15 + 0.55 * sunLit);
    gl_FragColor = vec4(atmColor * atmos * 1.1, alpha);
  }
`;

function loadTex(loader, src, linear = false) {
  return new Promise((resolve, reject) => {
    loader.load(src, (t) => {
      t.colorSpace = linear ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
      resolve(t);
    }, undefined, reject);
  });
}

export function mountJarvisEarth(mountEl) {
  const EARTH_R = 1.0;
  const ATMOS_R = 1.025;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000002);

  const camera = new THREE.PerspectiveCamera(
    42, mountEl.clientWidth / mountEl.clientHeight, 0.001, 3000
  );
  camera.position.set(0, 0.25, 4.6);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(1);
  renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mountEl.appendChild(renderer.domElement);

  const sun = sunDirection(new Date());
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
  sunLight.position.copy(sun).multiplyScalar(100);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x0a1020, 0.06));

  // Earth tilt + spin
  const earthTilt = new THREE.Group();
  earthTilt.rotation.z = THREE.MathUtils.degToRad(23.44);
  scene.add(earthTilt);
  const earthSpin = new THREE.Group();
  earthTilt.add(earthSpin);

  // Placeholder while textures load
  const placeholder = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_R, 64, 64),
    new THREE.MeshBasicMaterial({ color: 0x0a1a35 })
  );
  earthSpin.add(placeholder);

  const loader = new THREE.TextureLoader();
  Promise.all([
    loadTex(loader, '/textures/earth-day.jpg'),
    loadTex(loader, '/textures/earth-night.jpg'),
    loadTex(loader, '/textures/earth-water.png', true),
    loadTex(loader, '/textures/earth-topology.png', true),
  ]).then(([dayT, nightT, waterT, topoT]) => {
    earthSpin.remove(placeholder);
    const earthMat = new THREE.ShaderMaterial({
      vertexShader: earthVertex,
      fragmentShader: earthFragment,
      uniforms: {
        uDay: { value: dayT },
        uNight: { value: nightT },
        uSpec: { value: waterT },
        uTopo: { value: topoT },
        uSunDir: { value: sun },
      },
    });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 96, 96), earthMat);
    earthSpin.add(earth);
  }).catch((e) => console.warn('[jarvis-earth] texture load failed', e));

  // Atmosphere
  const atmosMat = new THREE.ShaderMaterial({
    vertexShader: atmosphereVertex,
    fragmentShader: atmosphereFragment,
    uniforms: { uSunDir: { value: sun } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const atmos = new THREE.Mesh(new THREE.SphereGeometry(ATMOS_R, 32, 32), atmosMat);
  scene.add(atmos);

  // Stars
  const starGeom = new THREE.BufferGeometry();
  const N = 320;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 300 + Math.random() * 350;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3 + 0] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
    pos[i * 3 + 2] = r * Math.cos(ph);
    const t = Math.pow(Math.random(), 5);
    col[i * 3 + 0] = 0.7 + 0.3 * t;
    col[i * 3 + 1] = 0.8 + 0.2 * t;
    col[i * 3 + 2] = 1.0;
  }
  starGeom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Points(starGeom, new THREE.PointsMaterial({
    size: 1.0, sizeAttenuation: true, transparent: true, opacity: 0.9,
    vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false,
  })));

  // Satellites — 4 orbital rings, JARVIS_HOME palette
  const sats = [];
  const SATS = [
    { alt: 0.055, incl: 51.6, speed: 1.4, color: 0xaeffff, ringOpacity: 0.22 },
    { alt: 0.150, incl: 55.0, speed: 0.8, color: 0x9efacc, ringOpacity: 0.14 },
    { alt: 0.320, incl: 2.0,  speed: 0.35, color: 0xffd89c, ringOpacity: 0.10 },
    { alt: 0.040, incl: 97.8, speed: 1.5, color: 0xaeffff, ringOpacity: 0.20 },
  ];
  SATS.forEach((d) => {
    const plane = new THREE.Object3D();
    plane.rotation.x = THREE.MathUtils.degToRad(d.incl);
    plane.rotation.z = Math.random() * Math.PI * 2;
    scene.add(plane);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(EARTH_R + d.alt - 0.0008, EARTH_R + d.alt + 0.0008, 128),
      new THREE.MeshBasicMaterial({
        color: d.color, transparent: true, opacity: d.ringOpacity,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    plane.add(ring);
    const orbiter = new THREE.Object3D();
    plane.add(orbiter);
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.008, 12, 12),
      new THREE.MeshBasicMaterial({ color: d.color })
    );
    body.position.set(EARTH_R + d.alt, 0, 0);
    orbiter.add(body);
    sats.push({ pivot: orbiter, speed: d.speed });
  });

  // Resize
  const onResize = () => {
    const w = mountEl.clientWidth;
    const h = mountEl.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', onResize);

  // ─────────── ZOOM-TO-MANHATTAN (JARVIS_HOME wake sequence) ───────────
  // NYC: 40.7128° N, -74.0060° E. We rotate the Earth so NYC faces the camera,
  // then dive the camera in until Manhattan fills the frame.
  const NYC = { lat: 40.7128, lon: -74.0060 };
  function latLonToVec3(lat, lon, r = 1) {
    const phi = (lat * Math.PI) / 180;
    const lam = (lon * Math.PI) / 180;
    return new THREE.Vector3(
      r * Math.cos(phi) * Math.cos(lam),
      r * Math.sin(phi),
      -r * Math.cos(phi) * Math.sin(lam),
    );
  }
  const nycLocal = latLonToVec3(NYC.lat, NYC.lon, 1);
  const nycTilted = nycLocal.clone().applyQuaternion(earthTilt.quaternion);
  const spinTargetAngle = Math.atan2(-nycTilted.x, nycTilted.z);
  const nycFinalDir = new THREE.Vector3(0, nycTilted.y, Math.hypot(nycTilted.x, nycTilted.z)).normalize();

  let zoomState = null; // { t0, dur, fromY, fromCam, toCam }
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  function zoomToManhattan({ duration = 4200 } = {}) {
    const fromY = earthSpin.rotation.y;
    let dy = spinTargetAngle - (fromY % (Math.PI * 2));
    while (dy > Math.PI) dy -= 2 * Math.PI;
    while (dy < -Math.PI) dy += 2 * Math.PI;
    const fromCam = camera.position.clone();
    // Final camera: hover above Manhattan at 1.07 altitude (dramatic close-up)
    const toCam = nycFinalDir.clone().multiplyScalar(1.085);
    zoomState = { t0: performance.now(), dur: duration, fromY, dy, fromCam, toCam };
    return new Promise((resolve) => { zoomState.resolve = resolve; });
  }
  // Expose globally so present.js can trigger
  window.__jarvisZoomToManhattan = zoomToManhattan;

  // Render loop
  const start = performance.now();
  function tick() {
    const now = performance.now();
    const t = (now - start) / 1000;
    if (zoomState) {
      const k = Math.min(1, (now - zoomState.t0) / zoomState.dur);
      const e = easeOut(k);
      earthSpin.rotation.y = zoomState.fromY + zoomState.dy * e;
      camera.position.lerpVectors(zoomState.fromCam, zoomState.toCam, e);
      camera.lookAt(0, 0, 0);
      if (k >= 1) { zoomState.resolve?.(); zoomState = null; }
    } else {
      earthSpin.rotation.y = (earthSpin.rotation.y || 0) + 0.0005;
    }
    for (const s of sats) s.pivot.rotation.z = t * s.speed * 0.25;
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return { scene, camera, renderer, zoomToManhattan, dispose: () => {
    window.removeEventListener('resize', onResize);
    renderer.dispose();
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  }};
}
