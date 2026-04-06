/**
 * cube3d.js — Cubo di Rubik 3D con Three.js r128.
 * Renderizza il cubo con i colori reali, anima ogni mossa,
 * permette rotazione con drag del mouse/touch.
 */

const THREE = window.THREE;

// Colori facce (stessi del CSS)
const FACE_COLORS = {
  U: 0xf0f0f0, R: 0xe02020, F: 0x1db954,
  D: 0xf5c800, L: 0xff7300, B: 0x1565c0,
  '?': 0x1a1e2a
};
const INNER_COLOR = 0x111318;

// Mapping: indice faccia Three.js → faccia cubo per BoxGeometry
// BoxGeometry: 0=+X(R) 1=-X(L) 2=+Y(U) 3=-Y(D) 4=+Z(F) 5=-Z(B)
const FACE_MAP = { R:0, L:1, U:2, D:3, F:4, B:5 };

// Rotazioni asse+direzione per ogni mossa (Three.js right-hand rule)
// U: strato y=+1, ruota CCW guardando dall'alto → dir=-1
// D: strato y=-1, ruota CW guardando dall'alto  → dir=+1
// R: strato x=+1, ruota CCW guardando da destra → dir=-1
// L: strato x=-1, ruota CW guardando da destra  → dir=+1
// F: strato z=+1, ruota CCW guardando davanti   → dir=-1
// B: strato z=-1, ruota CW guardando davanti    → dir=+1
const MOVE_DEF = {
  U:  {axis:'y', dir:-1, layer: 1},  "U'": {axis:'y', dir: 1, layer: 1},  U2: {axis:'y', dir:-1, layer: 1,  double:true},
  D:  {axis:'y', dir: 1, layer:-1},  "D'": {axis:'y', dir:-1, layer:-1},  D2: {axis:'y', dir: 1, layer:-1, double:true},
  R:  {axis:'x', dir:-1, layer: 1},  "R'": {axis:'x', dir: 1, layer: 1},  R2: {axis:'x', dir:-1, layer: 1,  double:true},
  L:  {axis:'x', dir: 1, layer:-1},  "L'": {axis:'x', dir:-1, layer:-1},  L2: {axis:'x', dir: 1, layer:-1, double:true},
  F:  {axis:'z', dir:-1, layer: 1},  "F'": {axis:'z', dir: 1, layer: 1},  F2: {axis:'z', dir:-1, layer: 1,  double:true},
  B:  {axis:'z', dir: 1, layer:-1},  "B'": {axis:'z', dir:-1, layer:-1},  B2: {axis:'z', dir: 1, layer:-1, double:true},
};

function inverseMoveStr(mv) {
  if (mv.endsWith("'")) return mv.slice(0,-1);
  if (mv.endsWith("2")) return mv; // 180° = self-inverse
  return mv+"'";
}

export class Cube3D {
  constructor(canvas, griglia) {
    this.canvas   = canvas;
    this.griglia  = JSON.parse(JSON.stringify(griglia)); // copia
    this.animQueue = [];
    this.animating = false;

    this._initThree();
    this._buildCubie();
    this._initOrbit();
    this._animate();
  }

  _initThree() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.scene    = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0c10);

    this.camera   = new THREE.PerspectiveCamera(45, w/h, 0.1, 100);
    this.camera.position.set(4.5, 4, 5.5);
    this.camera.lookAt(0,0,0);

    this.renderer = new THREE.WebGLRenderer({canvas: this.canvas, antialias:true});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    this.renderer.setSize(w, h, false);

    // Luci
    const amb = new THREE.AmbientLight(0xffffff, 0.7);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(6,10,8);
    this.scene.add(amb, dir);

    // Resize
    this._ro = new ResizeObserver(() => {
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      this.renderer.setSize(w,h,false);
      this.camera.aspect = w/h;
      this.camera.updateProjectionMatrix();
    });
    this._ro.observe(this.canvas);
  }

  _buildCubie() {
    this.cubies = []; // array 27 cubetti [x,y,z] da -1 a 1
    this.group  = new THREE.Group();
    this.scene.add(this.group);

    for (let x=-1; x<=1; x++) {
      for (let y=-1; y<=1; y++) {
        for (let z=-1; z<=1; z++) {
          const cubie = this._makeCubie(x,y,z);
          cubie.userData = {x,y,z};
          this.group.add(cubie);
          this.cubies.push(cubie);
        }
      }
    }
  }

  _makeCubie(x,y,z) {
    const geo = new THREE.BoxGeometry(0.95,0.95,0.95);
    const mats = [];
    // Ordine BoxGeometry: +X -X +Y -Y +Z -Z
    const faceAssign = [
      x===1  ? 'R' : null,
      x===-1 ? 'L' : null,
      y===1  ? 'U' : null,
      y===-1 ? 'D' : null,
      z===1  ? 'F' : null,
      z===-1 ? 'B' : null,
    ];
    faceAssign.forEach(face => {
      let color;
      if (face) {
        // Trova il colore dalla griglia
        color = this._getFaceColor(face, x,y,z);
      } else {
        color = INNER_COLOR;
      }
      mats.push(new THREE.MeshLambertMaterial({color}));
    });
    const mesh = new THREE.Mesh(geo, mats);
    mesh.position.set(x,y,z);
    return mesh;
  }

  _getFaceColor(face, x,y,z) {
    // Mappa posizione cubie → indice cella nella griglia
    // Ogni faccia ha 9 celle, indice 0-8 da sinistra a destra, dall'alto al basso
    // visto dalla direzione "fuori" della faccia
    let row, col;
    switch(face) {
      case 'U': // y=1, guardando dall'alto: x=col(-1→0,0→1,1→2), z=row(-1→0,0→1,1→2) ma invertito
        row = z+1; col = x+1; break;
      case 'D': // y=-1, guardando dal basso: x=col, z invertito
        row = 1-z; col = x+1; break; // z=1→0, z=-1→2
      case 'F': // z=1, guardando davanti: x=col, y=row (alto→basso)
        row = 1-y; col = x+1; break;
      case 'B': // z=-1, guardando da dietro: x invertito, y=row
        row = 1-y; col = 1-x; break;
      case 'R': // x=1, guardando da destra: z invertito=col, y=row
        row = 1-y; col = 1-z; break;
      case 'L': // x=-1, guardando da sinistra: z=col, y=row
        row = 1-y; col = z+1; break;
    }
    const idx = row*3+col;
    const letter = this.griglia[face][idx];
    return FACE_COLORS[letter] ?? FACE_COLORS['?'];
  }

  // ── Animazione mosse ────────────────────────────────────────────────────────

  executeMoves(moveList, inverse=false) {
    moveList.forEach(mv => {
      const actualMv = inverse ? inverseMoveStr(mv) : mv;
      this.animQueue.push(actualMv);
    });
    if (!this.animating) this._runQueue();
  }

  _runQueue() {
    if (this.animQueue.length === 0) { this.animating = false; return; }
    this.animating = true;
    const mv = this.animQueue.shift();
    this._animateMove(mv, () => this._runQueue());
  }

  _animateMove(mv, onDone) {
    const def = MOVE_DEF[mv];
    if (!def) { onDone(); return; }

    const DURATION = def.double ? 280 : 180; // ms
    const angle    = (Math.PI/2) * def.dir * (def.double ? 2 : 1);

    // Seleziona i cubetti dello strato
    const layer = def.layer;
    const axisKey = def.axis;
    const selected = this.cubies.filter(c => {
      const pos = c.position;
      const v = Math.round(axisKey==='x'?pos.x : axisKey==='y'?pos.y : pos.z);
      return v === layer;
    });

    // Pivot group temporaneo
    const pivot = new THREE.Group();
    this.group.add(pivot);
    selected.forEach(c => { pivot.attach(c); });

    // Asse di rotazione
    const axisVec = axisKey==='x'
      ? new THREE.Vector3(1,0,0)
      : axisKey==='y'
        ? new THREE.Vector3(0,1,0)
        : new THREE.Vector3(0,0,1);

    const start = performance.now();
    const initialQ = pivot.quaternion.clone();
    const targetQ  = new THREE.Quaternion().setFromAxisAngle(axisVec, angle);
    const endQ     = initialQ.clone().multiply(targetQ);

    const tick = (now) => {
      const t = Math.min((now-start)/DURATION, 1);
      const ease = t<0.5 ? 2*t*t : -1+(4-2*t)*t; // ease in-out
      pivot.quaternion.slerpQuaternions(initialQ, endQ, ease);
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        pivot.quaternion.copy(endQ);
        // Restituisci cubetti al gruppo principale
        selected.forEach(c => {
          this.group.attach(c);
          // Arrotonda posizione e quaternione per evitare drift
          c.position.set(
            Math.round(c.position.x), Math.round(c.position.y), Math.round(c.position.z)
          );
        });
        this.group.remove(pivot);
        onDone();
      }
    };
    requestAnimationFrame(tick);
  }

  // ── Orbit drag ──────────────────────────────────────────────────────────────

  _initOrbit() {
    this._isDragging = false;
    this._lastMouse  = {x:0,y:0};
    this._spherical  = {theta: Math.atan2(4.5,5.5), phi: Math.atan2(Math.sqrt(4.5**2+5.5**2),4)};

    const onDown = e => {
      this._isDragging = true;
      const p = e.touches?.[0] ?? e;
      this._lastMouse = {x:p.clientX, y:p.clientY};
    };
    const onMove = e => {
      if (!this._isDragging) return;
      const p = e.touches?.[0] ?? e;
      const dx = p.clientX - this._lastMouse.x;
      const dy = p.clientY - this._lastMouse.y;
      this._lastMouse = {x:p.clientX, y:p.clientY};
      this._spherical.theta -= dx * 0.008;
      this._spherical.phi   = Math.max(0.1, Math.min(Math.PI-0.1, this._spherical.phi + dy*0.008));
      const r = 8;
      this.camera.position.set(
        r*Math.sin(this._spherical.phi)*Math.sin(this._spherical.theta),
        r*Math.cos(this._spherical.phi),
        r*Math.sin(this._spherical.phi)*Math.cos(this._spherical.theta),
      );
      this.camera.lookAt(0,0,0);
    };
    const onUp = () => { this._isDragging = false; };

    this.canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove',  onMove);
    window.addEventListener('mouseup',    onUp);
    this.canvas.addEventListener('touchstart', onDown, {passive:true});
    window.addEventListener('touchmove',  onMove, {passive:true});
    window.addEventListener('touchend',   onUp);

    this._cleanOrbit = () => {
      this.canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove',  onMove);
      window.removeEventListener('mouseup',    onUp);
      this.canvas.removeEventListener('touchstart', onDown);
      window.removeEventListener('touchmove',  onMove);
      window.removeEventListener('touchend',   onUp);
    };
  }

  // ── Loop render ─────────────────────────────────────────────────────────────

  _animate() {
    this._rafId = requestAnimationFrame(() => this._animate());
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    cancelAnimationFrame(this._rafId);
    this._ro?.disconnect();
    this._cleanOrbit?.();
    this.renderer.dispose();
  }
}
