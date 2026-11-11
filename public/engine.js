// Shardlands engine v2 - dependency-free WebGL: GPU instancing, baked static chunks, shadow map, sky dome, auto quality.
const GL = (() => {
  const cv = document.getElementById('c'), dprRaw = window.devicePixelRatio || 1;
  const gl = cv.getContext('webgl', { antialias: dprRaw < 1.5, alpha: false, powerPreference: 'high-performance' });
  const ext = gl && gl.getExtension('ANGLE_instanced_arrays');
  if (!gl || !ext) {
    const notice = document.createElement('p');
    notice.style.cssText = 'padding:30px;color:#fff;font-family:sans-serif';
    notice.textContent = text('graphics.webglRequired', 'Your browser does not support WebGL (with instancing). Try a current Chrome, Edge or Firefox.');
    document.body.replaceChildren(notice);
    throw new Error('no webgl');
  }
  let SH = 2048;
  const STRIDE = 17, CH = 625, SUN = (() => { const v = [0.45, 0.85, 0.3], l = Math.hypot(...v); return v.map(x => x / l); })();
  const PREC = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
  const VSX = 'attribute vec3 p;attribute vec3 n;attribute vec4 m0;attribute vec4 m1;attribute vec4 m2;attribute vec4 c;attribute float e;';
  const vs = VSX + `uniform mat4 VP;uniform mat4 LVP;varying vec3 vN;varying vec3 vW;varying vec4 vC;varying float vE;varying vec3 vS;
void main(){vec4 q=vec4(p,1.0);vec3 w=vec3(dot(m0,q),dot(m1,q),dot(m2,q));vW=w;vec3 k=n/vec3(m0.x*m0.x+m1.x*m1.x+m2.x*m2.x,m0.y*m0.y+m1.y*m1.y+m2.y*m2.y,m0.z*m0.z+m1.z*m1.z+m2.z*m2.z);vN=vec3(dot(m0.xyz,k),dot(m1.xyz,k),dot(m2.xyz,k));vC=c;vE=e;vec4 s=LVP*vec4(w,1.0);vS=s.xyz*0.5+0.5;gl_Position=VP*vec4(w,1.0);}`;
  const fs = PREC + `varying vec3 vN;varying vec3 vW;varying vec4 vC;varying float vE;varying vec3 vS;
uniform vec3 cam;uniform vec3 fog;uniform vec3 sunCol;uniform vec3 ambCol;uniform vec3 sunDir;uniform vec3 skyCol;uniform float night;uniform float mode;uniform float shOn;
uniform sampler2D tex;uniform sampler2D shadow;uniform vec3 texR;uniform vec3 tgt;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h(i),h(i+vec2(1.0,0.0)),f.x),mix(h(i+vec2(0.0,1.0)),h(i+vec2(1.0,1.0)),f.x),f.y);}
float up(vec4 v){return dot(v,vec4(1.0,1.0/255.0,1.0/65025.0,1.0/16581375.0));}
uniform float shadowSize;
float shade(){if(shOn<0.5)return 1.0;if(vS.x<0.0||vS.x>1.0||vS.y<0.0||vS.y>1.0||vS.z>1.0)return 1.0;float b=vS.z-0.0017;float t=0.5/shadowSize;
float s=step(b,up(texture2D(shadow,vS.xy+vec2(-t,-t))))+step(b,up(texture2D(shadow,vS.xy+vec2(t,-t))))+step(b,up(texture2D(shadow,vS.xy+vec2(-t,t))))+step(b,up(texture2D(shadow,vS.xy+vec2(t,t))));
vec2 f=abs(vS.xy-0.5)*2.0;float k=clamp((1.0-max(f.x,f.y))*6.0,0.0,1.0);return mix(1.0,s*0.25,k);}
void main(){
if(mode>1.5){vec3 dir=normalize(vW-cam);float y=clamp(dir.y,0.0,1.0);vec3 col=mix(fog,skyCol,pow(y,0.55));float sd=max(dot(dir,sunDir),0.0);
col+=sunCol*(pow(sd,220.0)*1.6+pow(sd,10.0)*0.18)*(1.0-night*0.4);
if(night>0.02){vec3 d=floor(dir*170.0);float st=step(0.9972,h(d.xy+d.z*31.7));col+=vec3(st)*night*smoothstep(0.03,0.3,dir.y);}
gl_FragColor=vec4(col,1.0);return;}
if(mode<0.5&&vW.y>16.0){vec3 sg=tgt-cam;float L=length(sg);vec3 dr=sg/L;float tt=dot(vW-cam,dr);if(tt>0.0&&tt<L-26.0){float rr=length(vW-cam-dr*tt);float lim=34.0+tt/L*58.0;if(rr<lim){if(rr<lim*0.72)discard;if(mod(floor(gl_FragCoord.x)+floor(gl_FragCoord.y),2.0)<1.0)discard;}}}
vec3 N=normalize(vN);vec3 base=vC.rgb;float gnd=step(0.5,mode);
if(gnd>0.5){vec2 uv=(vW.xz-texR.xy)/texR.z;base=texture2D(tex,uv).rgb;float n=vn(vW.xz*0.05)*0.5+vn(vW.xz*0.33)*0.5;base*=0.84+0.32*n;}
float d=max(dot(N,sunDir),0.0);float sh=shade();vec3 V=normalize(cam-vW);
float rim=pow(1.0-max(dot(N,V),0.0),3.0)*(1.0-gnd);float spec=pow(max(dot(N,normalize(V+sunDir)),0.0),28.0)*0.22*sh*(1.0-gnd);
vec3 col=base*(ambCol*(0.44+0.22*N.y)+sunCol*d*sh)+base*vE+ambCol*rim*0.09+sunCol*spec;
float dist=length(vW-cam);float f=1.0-exp(-pow(dist*0.00052,1.7));
gl_FragColor=vec4(mix(col,fog,clamp(f,0.0,1.0)),vC.a);}`;
  // ---- skinned + textured characters (glTF) ----
  const VSK = 'attribute vec3 p;attribute vec3 n;attribute vec2 uv;attribute vec4 j;attribute vec4 w;uniform mat4 B[32];uniform mat4 MW;';
  const vsk = VSK + `uniform mat4 VP;uniform mat4 LVP;varying vec3 vN;varying vec3 vW;varying vec2 vU;varying vec3 vS;
void main(){mat4 K=B[int(j.x)]*w.x+B[int(j.y)]*w.y+B[int(j.z)]*w.z+B[int(j.w)]*w.w;mat4 MK=MW*K;vec4 wp=MK*vec4(p,1.0);vW=wp.xyz;vN=mat3(MK)*n;vU=uv;vec4 s=LVP*wp;vS=s.xyz*0.5+0.5;gl_Position=VP*wp;}`;
  const fsk = PREC + `varying vec3 vN;varying vec3 vW;varying vec2 vU;varying vec3 vS;
uniform vec3 cam;uniform vec3 fog;uniform vec3 sunCol;uniform vec3 ambCol;uniform vec3 sunDir;uniform float shOn;uniform sampler2D tex;uniform sampler2D shadow;uniform vec3 tint;uniform vec3 emc;uniform float alpha;uniform float glw;
float up(vec4 v){return dot(v,vec4(1.0,1.0/255.0,1.0/65025.0,1.0/16581375.0));}
uniform float shadowSize;
float shade(){if(shOn<0.5)return 1.0;if(vS.x<0.0||vS.x>1.0||vS.y<0.0||vS.y>1.0||vS.z>1.0)return 1.0;float b=vS.z-0.0017;float t=0.5/shadowSize;
float s=step(b,up(texture2D(shadow,vS.xy+vec2(-t,-t))))+step(b,up(texture2D(shadow,vS.xy+vec2(t,-t))))+step(b,up(texture2D(shadow,vS.xy+vec2(-t,t))))+step(b,up(texture2D(shadow,vS.xy+vec2(t,t))));
vec2 f=abs(vS.xy-0.5)*2.0;float k=clamp((1.0-max(f.x,f.y))*6.0,0.0,1.0);return mix(1.0,s*0.25,k);}
void main(){vec3 N=normalize(vN);vec4 tx=texture2D(tex,vU);vec3 base=tx.rgb*tint;float d=max(dot(N,sunDir),0.0);float sh=shade();vec3 V=normalize(cam-vW);
float rim=pow(1.0-max(dot(N,V),0.0),3.0);vec3 col=base*(ambCol*(0.62+0.16*N.y)+sunCol*d*sh*0.62)+ambCol*rim*0.1+emc+base*glw*(1.0-tx.a);
float dist=length(vW-cam);float f=1.0-exp(-pow(dist*0.00052,1.7));gl_FragColor=vec4(mix(col,fog,clamp(f,0.0,1.0)),alpha);}`;
  const vskd = VSK + 'uniform mat4 LVP;void main(){mat4 K=B[int(j.x)]*w.x+B[int(j.y)]*w.y+B[int(j.z)]*w.z+B[int(j.w)]*w.w;gl_Position=LVP*(MW*K*vec4(p,1.0));}';
  const vsd = VSX + 'uniform mat4 LVP;void main(){vec4 q=vec4(p,1.0);gl_Position=LVP*vec4(dot(m0,q),dot(m1,q),dot(m2,q),1.0);}';
  const fsd = PREC + 'void main(){vec4 e=fract(gl_FragCoord.z*vec4(1.0,255.0,65025.0,16581375.0));e-=e.yzww*vec4(1.0/255.0,1.0/255.0,1.0/255.0,0.0);gl_FragColor=e;}';
  function prog(v, f) {
    const P = gl.createProgram();
    for (const [t, s] of [[gl.VERTEX_SHADER, v], [gl.FRAGMENT_SHADER, f]]) { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); gl.attachShader(P, o); }
    (v.indexOf('attribute vec2 uv') >= 0 ? ['p', 'n', 'uv', 'j', 'w'] : ['p', 'n', 'm0', 'm1', 'm2', 'c', 'e']).forEach((a, i) => gl.bindAttribLocation(P, i, a)); gl.linkProgram(P);
    if (!gl.getProgramParameter(P, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(P)); return P;
  }
  const P1 = prog(vs, fs), P2 = prog(vsd, fsd), U = {}, UD = { LVP: gl.getUniformLocation(P2, 'LVP') };
  for (const k of ['VP', 'LVP', 'cam', 'fog', 'sunCol', 'ambCol', 'sunDir', 'skyCol', 'night', 'mode', 'shOn', 'shadowSize', 'tex', 'shadow', 'texR', 'tgt']) U[k] = gl.getUniformLocation(P1, k);
  const skinOK = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS) >= 150; let PK = null, PKD = null; const UK = {}, UKD = {};
  if (skinOK) { try { PK = prog(vsk, fsk); PKD = prog(vskd, fsd); for (const k of ['B', 'MW', 'VP', 'LVP', 'cam', 'fog', 'sunCol', 'ambCol', 'sunDir', 'shOn', 'shadowSize', 'tex', 'shadow', 'tint', 'emc', 'alpha', 'glw']) UK[k] = gl.getUniformLocation(PK, k); for (const k of ['B', 'MW', 'LVP']) UKD[k] = gl.getUniformLocation(PKD, k); } catch (e) { console.warn('character shader unavailable', e); PK = null; } }
  gl.enable(gl.DEPTH_TEST); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  // shadow framebuffer (depth packed into RGBA so it works everywhere)
  let shOK = true; const shTex = gl.createTexture(), fbo = gl.createFramebuffer();
  gl.bindTexture(gl.TEXTURE_2D, shTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SH, SH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, SH, SH);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shTex, 0); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) shOK = false; gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // ---------- meshes ----------
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const list = [];
  // parts: [tris, mode, center]; mode: function(v)->normal (smooth) | 'up' | undefined (flat, facing away from center)
  function mk(...parts) {
    const data = [];
    for (const [tris, mode, center] of parts) for (const [a, b, c] of tris) {
      let n = cross(sub(b, a), sub(c, a)); if (Math.hypot(...n) < 1e-9) continue; n = nrm(n);
      if (typeof mode === 'function') { for (const v of [a, b, c]) { const q = nrm(mode(v)); data.push(v[0], v[1], v[2], q[0], q[1], q[2]); } continue; }
      if (mode === 'up') n = [0, 1, 0]; else { const cc = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]; if (dot(n, sub(cc, center || [0, 0, 0])) < 0) n = [-n[0], -n[1], -n[2]]; }
      for (const v of [a, b, c]) data.push(v[0], v[1], v[2], n[0], n[1], n[2]);
    }
    const arr = new Float32Array(data), buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    const q = () => ({ arr: new Float32Array(64 * STRIDE), n: 0, buf: gl.createBuffer() });
    const m = { buf, count: arr.length / 6, data: arr, o: q(), t: q(), d: q() }; list.push(m); return m;
  }
  const quad = (a, b, c, d) => [[a, b, c], [a, c, d]];
  function boxT(y0, y1) { const x = .5, v = [[-x, y0, -x], [x, y0, -x], [x, y1, -x], [-x, y1, -x], [-x, y0, x], [x, y0, x], [x, y1, x], [-x, y1, x]]; return [...quad(v[0], v[1], v[2], v[3]), ...quad(v[4], v[5], v[6], v[7]), ...quad(v[0], v[4], v[7], v[3]), ...quad(v[1], v[5], v[6], v[2]), ...quad(v[3], v[2], v[6], v[7]), ...quad(v[0], v[1], v[5], v[4])]; }
  function tube(seg, r0, r1, y0, y1) { const t = []; for (let i = 0; i < seg; i++) { const a0 = i / seg * 6.2832, a1 = (i + 1) / seg * 6.2832, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1); t.push(...quad([c0 * r0, y0, s0 * r0], [c1 * r0, y0, s1 * r0], [c1 * r1, y1, s1 * r1], [c0 * r1, y1, s0 * r1])); } return t; }
  const tubeN = (r0, r1, y0, y1) => v => { const l = Math.hypot(v[0], v[2]); return l < 1e-6 ? [0, y1 > y0 ? 1 : -1, 0] : [v[0] / l, (r0 - r1) / (y1 - y0), v[2] / l]; };
  function cap(seg, r, y) { const t = []; for (let i = 0; i < seg; i++) { const a0 = i / seg * 6.2832, a1 = (i + 1) / seg * 6.2832; t.push([[0, y, 0], [Math.cos(a0) * r, y, Math.sin(a0) * r], [Math.cos(a1) * r, y, Math.sin(a1) * r]]); } return t; }
  function sph(la, lo) { const t = [], P = (i, j) => { const th = i / la * Math.PI, ph = j / lo * 6.2832; return [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]; }; for (let i = 0; i < la; i++) for (let j = 0; j < lo; j++) t.push(...quad(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1))); return t; }
  const octa = () => { const t = [], T = [0, 1, 0], B = [0, -1, 0], r = [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]]; for (let i = 0; i < 4; i++) { t.push([T, r[i], r[(i + 1) % 4]]); t.push([B, r[(i + 1) % 4], r[i]]); } return t; };
  function flat(inner, seg) { const t = []; for (let i = 0; i < seg; i++) { const a0 = i / seg * 6.2832, a1 = (i + 1) / seg * 6.2832, o0 = [Math.cos(a0), 0, Math.sin(a0)], o1 = [Math.cos(a1), 0, Math.sin(a1)]; if (inner > 0) t.push(...quad([o0[0] * inner, 0, o0[2] * inner], [o1[0] * inner, 0, o1[2] * inner], o1, o0)); else t.push([[0, 0, 0], o1, o0]); } return t; }
  const id3 = v => v, S = (r0, r1, y0, y1, seg) => [tube(seg || 12, r0, r1, y0, y1), tubeN(r0, r1, y0, y1)];
  const gable = () => { const a = [-.5, 0, -.5], b = [.5, 0, -.5], c = [0, 1, -.5], d = [-.5, 0, .5], e = [.5, 0, .5], f = [0, 1, .5]; return [[a, b, c], [d, e, f], ...quad(a, d, f, c), ...quad(b, e, f, c)]; };
  const M = {
    box: mk([boxT(-.5, .5)]), limb: mk([boxT(-1, 0), undefined, [0, -.5, 0]]),
    cyl: mk(S(1, 1, 0, 1), [cap(12, 1, 1), 'up']), cone: mk(S(1, 0, 0, 1)), taper: mk(S(1, .7, 0, 1), [cap(12, .7, 1), 'up']), torso: mk(S(.78, 1, 0, 1), [cap(12, 1, 1), 'up']),
    tlimb: mk(S(.5, .36, 0, -1, 10), [cap(10, .36, -1), undefined, [0, -.5, 0]]),
    ball: mk([sph(6, 10), id3]), rock: mk([sph(4, 6)]), octa: mk([octa()]),
    roof: mk([tube(4, 1, 0, 0, 1), undefined, [0, .3, 0]]), gable: mk([gable(), undefined, [0, .3, 0]]),
    cone6: mk([tube(6, 1, 0, 0, 1), undefined, [0, .3, 0]]), trunk: mk([tube(5, 1, .6, 0, 1), undefined, [0, .5, 0]]),
    ring: mk([flat(.8, 28), 'up']), disc: mk([flat(0, 20), 'up']),
    wing: mk([[[[0, 0, 0], [1, 0, .25], [1.05, 0, -.5]], [[0, 0, 0], [1.05, 0, -.5], [.6, 0, -.95]], [[0, 0, 0], [.6, 0, -.95], [.1, 0, -.75]]], 'up']),
    tuft: mk([[[[-.5, 0, 0], [-.1, 0, .15], [-.45, 1, .1]], [[-.1, 0, -.1], [.25, 0, .1], [.1, 1.3, 0]], [[.2, 0, .1], [.55, 0, -.05], [.55, .9, .2]]], 'up']),
  };
  M.sphere = M.ball;
  M.arc = mk([(() => { const t = []; for (let i = 0; i < 16; i++) { const a0 = -1.4 + i / 16 * 2.8, a1 = -1.4 + (i + 1) / 16 * 2.8, w0 = Math.sin((i / 16) * Math.PI) * .22 + .02, w1 = Math.sin(((i + 1) / 16) * Math.PI) * .22 + .02; t.push(...quad([Math.sin(a0) * (1 - w0), 0, Math.cos(a0) * (1 - w0)], [Math.sin(a1) * (1 - w1), 0, Math.cos(a1) * (1 - w1)], [Math.sin(a1), 0, Math.cos(a1)], [Math.sin(a0), 0, Math.cos(a0)])); } return t; })(), 'up']);
  M.fan = mk([(() => { const t = []; for (let i = 0; i < 12; i++) { const a0 = -.5 + i / 12, a1 = -.5 + (i + 1) / 12; t.push([[0, 0, 0], [Math.sin(a1), 0, Math.cos(a1)], [Math.sin(a0), 0, Math.cos(a0)]]); } return t; })(), 'up']);
  // a mesh from an interleaved Float32Array (x,y,z,nx,ny,nz per vertex) - used by the nature pack
  function meshFromArray(arr) { const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); const q = () => ({ arr: new Float32Array(64 * STRIDE), n: 0, buf: gl.createBuffer() }); const m = { buf, count: arr.length / 6, data: arr, o: q(), t: q(), d: q() }; list.push(m); return m; }
  // write one instance transform into a Float32Array (for precomputed static instances)
  function instWrite(A, o, x, y, z, sx, sy, sz, yaw, col, emis) { const c = Math.cos(yaw), s = Math.sin(yaw); A[o] = c * sx; A[o + 1] = 0; A[o + 2] = s * sz; A[o + 3] = x; A[o + 4] = 0; A[o + 5] = sy; A[o + 6] = 0; A[o + 7] = y; A[o + 8] = -s * sx; A[o + 9] = 0; A[o + 10] = c * sz; A[o + 11] = z; A[o + 12] = col[0]; A[o + 13] = col[1]; A[o + 14] = col[2]; A[o + 15] = 1; A[o + 16] = emis || 0; }
  // queue a block of precomputed instances in one go
  function pushInst(mesh, arr, n, noShadow) { const q = noShadow ? mesh.d : mesh.o; if ((q.n + n) * STRIDE > q.arr.length) { let L = q.arr.length; while (L < (q.n + n) * STRIDE) L *= 2; const a = new Float32Array(L); a.set(q.arr.subarray(0, q.n * STRIDE)); q.arr = a; } q.arr.set(arr.subarray(0, n * STRIDE), q.n * STRIDE); q.n += n; }
  const sky = mk([sph(10, 16), id3]), ground = mk([[[[-12000, 0, -12000], [-12000, 0, 20000], [20000, 0, 20000]], [[-12000, 0, -12000], [20000, 0, 20000], [20000, 0, -12000]]], 'up']);
  list.length -= 2; // sky & ground are never instanced

  // ---------- matrices / camera ----------
  const mul = (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
  const persp = (fov, asp, n, f) => { const t = 1 / Math.tan(fov / 2); return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]); };
  function look(e, t) { let z = nrm(sub(e, t)), x = nrm(cross([0, 1, 0], z)), y = cross(z, x); return { m: new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]), right: x, up: y, fwd: z.map(v => -v) }; }
  const cam = { eye: [0, 100, 100], tgt: [0, 0, 0], VP: new Float32Array(16), fov: 0.95, w: 1, h: 1, right: [1, 0, 0], up: [0, 1, 0], fwd: [0, 0, -1] };
  const frustum = new Float32Array(24);
  function setCamera(eye, target) {
    const v = look(eye, target);
    const m = cam.VP = mul(persp(cam.fov, cam.w / cam.h, 8, 9000), v.m);
    cam.eye = eye; cam.tgt = target; cam.right = v.right; cam.up = v.up; cam.fwd = v.fwd;
    // Clip planes are the fourth row plus or minus each of the first three rows.
    for (let axis = 0; axis < 3; axis++) {
      for (let col = 0; col < 4; col++) {
        frustum[axis * 8 + col] = m[col * 4 + 3] + m[col * 4 + axis];
        frustum[axis * 8 + 4 + col] = m[col * 4 + 3] - m[col * 4 + axis];
      }
    }
  }
  function boundsVisible(bounds) {
    for (let i = 0; i < frustum.length; i += 4) {
      const x = frustum[i], y = frustum[i + 1], z = frustum[i + 2];
      if (x * bounds[x < 0 ? 0 : 3] + y * bounds[y < 0 ? 1 : 4] +
          z * bounds[z < 0 ? 2 : 5] + frustum[i + 3] < 0) return false;
    }
    return true;
  }
  function project(x, y, z) { const m = cam.VP, cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15]; if (cw <= 1) return null; return { x: (cx / cw + 1) / 2 * cam.w, y: (1 - cy / cw) / 2 * cam.h, d: cw }; }
  function ray(px, py) { const nx = px / cam.w * 2 - 1, ny = 1 - py / cam.h * 2, th = Math.tan(cam.fov / 2), asp = cam.w / cam.h; return { o: cam.eye, d: nrm([0, 1, 2].map(i => cam.fwd[i] + cam.right[i] * nx * th * asp + cam.up[i] * ny * th)) }; }

  // ---------- quality ----------
  const Q = { mode: 'auto', scale: 1, shadows: true, fps: 60, draws: 0, inst: 0, fpsLimit: 60, resolution: 1, shadowQuality: 'low' };
  try {
    const mode = localStorage.getItem('sl_gfx'); if (['auto', 'low', 'medium', 'high'].includes(mode)) Q.mode = mode;
    const saved = JSON.parse(localStorage.getItem('sl_render') || '{}');
    if ([0, 30, 60, 120].includes(saved.fpsLimit)) Q.fpsLimit = saved.fpsLimit;
    if (Number.isFinite(saved.resolution)) Q.resolution = Math.max(.5, Math.min(1, saved.resolution));
    if (['off', 'low', 'high'].includes(saved.shadowQuality)) Q.shadowQuality = saved.shadowQuality;
  } catch (error) {}
  function resize() { const d = Q.scale * Q.resolution; cam.w = innerWidth; cam.h = innerHeight; cv.width = Math.max(1, Math.floor(cam.w * d)); cv.height = Math.max(1, Math.floor(cam.h * d)); }
  function resizeShadows() {
    const size = Q.shadowQuality === 'high' ? 2048 : 1024;
    if (SH === size) return;
    SH = size;
    gl.bindTexture(gl.TEXTURE_2D, shTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SH, SH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, SH, SH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); shOK = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  function applyMode() { Q.scale = Q.mode === 'low' ? .6 : Q.mode === 'medium' ? .8 : 1; Q.shadows = Q.mode !== 'low'; resize(); }
  function setQuality(mode) { Q.mode = mode; good = 0; try { localStorage.setItem('sl_gfx', mode); } catch (error) {} applyMode(); }
  function setRenderOptions(options) {
    if ([0, 30, 60, 120].includes(options.fpsLimit)) Q.fpsLimit = options.fpsLimit;
    if (Number.isFinite(options.resolution)) Q.resolution = Math.max(.5, Math.min(1, options.resolution));
    if (['off', 'low', 'high'].includes(options.shadowQuality)) Q.shadowQuality = options.shadowQuality;
    try { localStorage.setItem('sl_render', JSON.stringify({ fpsLimit: Q.fpsLimit, resolution: Q.resolution, shadowQuality: Q.shadowQuality })); } catch (error) {}
    acc = frames = good = 0; resize(); resizeShadows();
  }
  let acc = 0, frames = 0, good = 0;
  function perf(dtMs) {
    if (dtMs > 250 || dtMs <= 0) return;
    acc += dtMs; frames++; if (acc < 1000) return;
    const avg = acc / frames; acc = frames = 0; Q.fps = Math.round(1000 / avg);
    if (Q.mode !== 'auto') return;
    const budget = 1000 / (Q.fpsLimit || 60);
    if (avg > budget * 1.2) {
      good = 0;
      if (Q.scale > .61) { Q.scale = Math.max(.6, Q.scale - .1); resize(); } else Q.shadows = false;
    } else if (avg <= budget * 1.04 && ++good >= 12) {
      good = 0;
      if (!Q.shadows) Q.shadows = true;
      else if (Q.scale < .99) { Q.scale = Math.min(1, Q.scale + .1); resize(); }
    }
  }
  addEventListener('resize', resize); applyMode(); resizeShadows();

  // ---------- instanced drawing ----------
  let sky_ = { d: 1, fog: [.6, .69, .72], sun: [.72, .72, .7], amb: [1, 1, 1], zen: [.25, .5, .85] };
  // queue one instance: position, scale, yaw (Y), pitch (X), colour [r,g,b], emissive, alpha, roll (Z)
  function draw(mesh, x, y, z, sx, sy, sz, yaw, pitch, col, emis, alpha, roll) {
    const q = alpha !== undefined && alpha < 1 ? mesh.t : mesh.o;
    if ((q.n + 1) * STRIDE > q.arr.length) { const a = new Float32Array(q.arr.length * 2); a.set(q.arr); q.arr = a; }
    const A = q.arr, o = q.n++ * STRIDE, c = Math.cos(yaw), s = Math.sin(yaw), ca = Math.cos(pitch || 0), sa = Math.sin(pitch || 0);
    let ax = c, ay = 0, az = -s, bx = s * sa, by = ca, bz = c * sa; const cx = s * ca, cy = -sa, cz = c * ca;
    if (roll) { const cr = Math.cos(roll), sr = Math.sin(roll), tx = ax * cr + bx * sr, ty = ay * cr + by * sr, tz = az * cr + bz * sr; bx = -ax * sr + bx * cr; by = -ay * sr + by * cr; bz = -az * sr + bz * cr; ax = tx; ay = ty; az = tz; }
    A[o] = ax * sx; A[o + 1] = bx * sy; A[o + 2] = cx * sz; A[o + 3] = x; A[o + 4] = ay * sx; A[o + 5] = by * sy; A[o + 6] = cy * sz; A[o + 7] = y; A[o + 8] = az * sx; A[o + 9] = bz * sy; A[o + 10] = cz * sz; A[o + 11] = z;
    A[o + 12] = col[0]; A[o + 13] = col[1]; A[o + 14] = col[2]; A[o + 15] = alpha === undefined ? 1 : alpha; A[o + 16] = emis || 0;
  }
  function begin() { for (const m of list) { m.o.n = 0; m.t.n = 0; m.d.n = 0; } skinQ.length = 0; }
  // ---------- static world baking (world-space chunks, one draw call each) ----------
  let bk = null; const chunks = []; let detailR = 0;
  function bakeBegin() {
    begin();
    // Shared meshes survive map changes; release their previous map's peak instance capacity.
    for (const mesh of list) for (const queue of [mesh.o, mesh.t, mesh.d]) {
      queue.arr = new Float32Array(64 * STRIDE);
      gl.bindBuffer(gl.ARRAY_BUFFER, queue.buf); gl.bufferData(gl.ARRAY_BUFFER, queue.arr.byteLength, gl.DYNAMIC_DRAW);
    }
    bk = new Map(); for (const chunk of chunks) gl.deleteBuffer(chunk.buf); chunks.length = 0;
  }
  function bakeAdd(mesh, x, y, z, sx, sy, sz, yaw, pitch, col, emis, roll, far) {
    const kx = Math.floor(x / CH), kz = Math.floor(z / CH), key = kx + ',' + kz + (far ? 'f' : ''); let a = bk.get(key); if (!a) { a = { f: new Float32Array(11 * 8192), n: 0, kx, kz, far: !!far }; bk.set(key, a); }
    const c = Math.cos(yaw), s = Math.sin(yaw), ca = Math.cos(pitch || 0), sa = Math.sin(pitch || 0);
    let ax = c, ay = 0, az = -s, bx = s * sa, by = ca, bz = c * sa; const cx = s * ca, cy = -sa, cz = c * ca;
    if (roll) { const cr = Math.cos(roll), sr = Math.sin(roll), tx = ax * cr + bx * sr, ty = ay * cr + by * sr, tz = az * cr + bz * sr; bx = -ax * sr + bx * cr; by = -ay * sr + by * cr; bz = -az * sr + bz * cr; ax = tx; ay = ty; az = tz; }
    const d = mesh.data, e = emis || 0, need = a.n + d.length / 6 * 11;
    if (need > a.f.length) { let L = a.f.length; while (L < need) L *= 2; const nf = new Float32Array(L); nf.set(a.f.subarray(0, a.n)); a.f = nf; }
    const v = a.f; let o = a.n;
    for (let i = 0; i < d.length; i += 6) {
      const px = d[i] * sx, py = d[i + 1] * sy, pz = d[i + 2] * sz; let nx = d[i + 3] / sx, ny = d[i + 4] / sy, nz = d[i + 5] / sz;
      let wx = ax * nx + bx * ny + cx * nz, wy = ay * nx + by * ny + cy * nz, wz = az * nx + bz * ny + cz * nz; const l = Math.hypot(wx, wy, wz) || 1;
      v[o++] = ax * px + bx * py + cx * pz + x; v[o++] = ay * px + by * py + cy * pz + y; v[o++] = az * px + bz * py + cz * pz + z; v[o++] = wx / l; v[o++] = wy / l; v[o++] = wz / l; v[o++] = col[0]; v[o++] = col[1]; v[o++] = col[2]; v[o++] = 1; v[o++] = e;
    }
    a.n = o;
  }
  function bakeEnd() {
    for (const a of bk.values()) {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, a.f.subarray(0, a.n), gl.STATIC_DRAW);
      const bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (let i = 0; i < a.n; i += 11) {
        for (let axis = 0; axis < 3; axis++) {
          bounds[axis] = Math.min(bounds[axis], a.f[i + axis]);
          bounds[axis + 3] = Math.max(bounds[axis + 3], a.f[i + axis]);
        }
      }
      chunks.push({ buf, count: a.n / 11, cx: (a.kx + .5) * CH, cz: (a.kz + .5) * CH, far: a.far, bounds });
    }
    bk = null;
  }

  let gtex = null, gR = [0, 0, 1];
  function setGround(canvas, x0, z0, size) {
    if (gtex) gl.deleteTexture(gtex); gtex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, gtex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, canvas); gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gR = [x0, z0, size];
  }
  function setSky(t) { // t = 0..1 day phase
    const sn = Math.sin(t * 6.2832), d = Math.max(0, Math.min(1, 0.5 + 0.8 * sn)), warm = Math.max(0, 1 - Math.abs(d - 0.4) * 3.2);
    const L = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    sky_ = { d, amb: L([0.64, 0.7, 0.98], [1, 1, 1], d), sun: L(L([0.14, 0.18, 0.32], [0.74, 0.73, 0.7], d), [0.98, 0.6, 0.34], warm * 0.5), fog: L(L([0.05, 0.07, 0.15], [0.62, 0.72, 0.78], d), [0.8, 0.52, 0.4], warm * 0.4), zen: L(L([0.01, 0.02, 0.07], [0.22, 0.46, 0.85], d), [0.3, 0.3, 0.55], warm * 0.4) };
    return d;
  }
  const A = i => gl.enableVertexAttribArray(i), X = i => gl.disableVertexAttribArray(i), DV = (i, d) => ext.vertexAttribDivisorANGLE(i, d);
  function bindMesh(m) { gl.bindBuffer(gl.ARRAY_BUFFER, m.buf); A(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); A(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12); }
  function drawInst(kind) {
    for (const m of list) {
      const q = m[kind]; if (!q.n) continue; bindMesh(m); gl.bindBuffer(gl.ARRAY_BUFFER, q.buf);
      for (let i = 0; i < 4; i++) { A(2 + i); gl.vertexAttribPointer(2 + i, 4, gl.FLOAT, false, STRIDE * 4, i * 16); DV(2 + i, 1); }
      A(6); gl.vertexAttribPointer(6, 1, gl.FLOAT, false, STRIDE * 4, 64); DV(6, 1);
      ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, m.count, q.n); Q.draws++; Q.inst += q.n;
    }
  }
  function constRows(r0, r1, r2) { for (let i = 2; i < 7; i++) { X(i); DV(i, 0); } gl.vertexAttrib4f(2, r0[0], r0[1], r0[2], r0[3]); gl.vertexAttrib4f(3, r1[0], r1[1], r1[2], r1[3]); gl.vertexAttrib4f(4, r2[0], r2[1], r2[2], r2[3]); }
  const I0 = [1, 0, 0, 0], I1 = [0, 1, 0, 0], I2 = [0, 0, 1, 0];
  function drawChunks(cx, cz, rad, cull) {
    constRows(I0, I1, I2); A(5); A(6);
    for (const c of chunks) {
      const dx = c.cx - cx, dz = c.cz - cz, d2 = dx * dx + dz * dz; if (d2 > (rad + 450) * (rad + 450)) continue; if (c.far && d2 < detailR * detailR) continue;
      if (cull && !boundsVisible(c.bounds)) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, c.buf); A(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 44, 0); A(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 44, 12);
      gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 44, 24); gl.vertexAttribPointer(6, 1, gl.FLOAT, false, 44, 40); gl.drawArrays(gl.TRIANGLES, 0, c.count); Q.draws++;
    }
  }
  function drawConst(m, r0, r1, r2) { bindMesh(m); constRows(r0, r1, r2); gl.vertexAttrib4f(5, 1, 1, 1, 1); gl.vertexAttrib1f(6, 0); gl.drawArrays(gl.TRIANGLES, 0, m.count); Q.draws++; }
  const shadowsOn = () => Q.shadows && Q.shadowQuality !== 'off' && shOK && sky_.d > 0.12;
  // ---------- glTF characters ----------
  const CT = { 5126: Float32Array, 5123: Uint16Array, 5121: Uint8Array, 5125: Uint32Array, 5122: Int16Array, 5120: Int8Array }, NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  function readAcc(g, bin, i) {
    const a = g.accessors[i], bv = g.bufferViews[a.bufferView], T = CT[a.componentType], nc = NC[a.type], off = (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride || 0, out = new Float32Array(a.count * nc);
    if (!stride || stride === nc * T.BYTES_PER_ELEMENT) { const src = new T(bin.buffer, bin.byteOffset + off, a.count * nc); for (let k = 0; k < out.length; k++) out[k] = src[k]; }
    else { const dv = new DataView(bin.buffer, bin.byteOffset + off); for (let k = 0; k < a.count; k++) for (let c = 0; c < nc; c++) { const o = k * stride + c * T.BYTES_PER_ELEMENT; out[k * nc + c] = T === Float32Array ? dv.getFloat32(o, true) : T === Uint16Array ? dv.getUint16(o, true) : dv.getUint8(o); } }
    if (a.normalized) { const d = T === Uint8Array ? 255 : T === Uint16Array ? 65535 : 1; for (let k = 0; k < out.length; k++) out[k] /= d; }
    return out;
  }
  async function loadGLB(url) {
    const ab = await (await fetch(url)).arrayBuffer(), dv = new DataView(ab), jl = dv.getUint32(12, true), g = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 20, jl))), bin = new Uint8Array(ab, 20 + jl + 8, dv.getUint32(20 + jl, true));
    const texs = await Promise.all((g.images || []).map(async im => { const bv = g.bufferViews[im.bufferView], blob = new Blob([new Uint8Array(bin.buffer, bin.byteOffset + (bv.byteOffset || 0), bv.byteLength)], { type: im.mimeType }); const bmp = await createImageBitmap(blob);
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp); bmp.close(); gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); return t; }));
    const white = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, white); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    const N = g.nodes.length, parent = new Int16Array(N).fill(-1); g.nodes.forEach((n, i) => (n.children || []).forEach(c => parent[c] = i));
    const order = []; const visit = i => { order.push(i); (g.nodes[i].children || []).forEach(visit); }; (g.scenes[g.scene || 0].nodes).forEach(visit);
    const dT = new Float32Array(N * 3), dR = new Float32Array(N * 4), dS = new Float32Array(N * 3);
    g.nodes.forEach((n, i) => { const t = n.translation || [0, 0, 0], r = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1]; dT.set(t, i * 3); dR.set(r, i * 4); dS.set(s, i * 3); });
    const skin = g.skins && g.skins[0], joints = skin ? skin.joints : [], ibm = skin && skin.inverseBindMatrices !== undefined ? readAcc(g, bin, skin.inverseBindMatrices) : new Float32Array(0);
    const prims = []; let minY = 1e9, maxY = -1e9;
    g.nodes.forEach((n, ni) => { if (n.mesh === undefined) return; for (const pr of g.meshes[n.mesh].primitives) {
      const A = pr.attributes, P = readAcc(g, bin, A.POSITION), Nn = A.NORMAL !== undefined ? readAcc(g, bin, A.NORMAL) : null, UV = A.TEXCOORD_0 !== undefined ? readAcc(g, bin, A.TEXCOORD_0) : null, J = A.JOINTS_0 !== undefined ? readAcc(g, bin, A.JOINTS_0) : null, Wt = A.WEIGHTS_0 !== undefined ? readAcc(g, bin, A.WEIGHTS_0) : null;
      const vc = P.length / 3, v = new Float32Array(vc * 16);
      for (let k = 0; k < vc; k++) { const o = k * 16; v[o] = P[k * 3]; v[o + 1] = P[k * 3 + 1]; v[o + 2] = P[k * 3 + 2]; if (Nn) { v[o + 3] = Nn[k * 3]; v[o + 4] = Nn[k * 3 + 1]; v[o + 5] = Nn[k * 3 + 2]; } else v[o + 4] = 1; if (UV) { v[o + 6] = UV[k * 2]; v[o + 7] = UV[k * 2 + 1]; }
        if (J && n.skin !== undefined) { for (let c = 0; c < 4; c++) { v[o + 8 + c] = J[k * 4 + c]; v[o + 12 + c] = Wt[k * 4 + c]; } if (P[k * 3 + 1] < minY) minY = P[k * 3 + 1]; if (P[k * 3 + 1] > maxY) maxY = P[k * 3 + 1]; } else v[o + 12] = 1; }
      const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
      let ib = null, ic = vc; if (pr.indices !== undefined) { const I = readAcc(g, bin, pr.indices), u = new Uint16Array(I.length); for (let k = 0; k < I.length; k++) u[k] = I[k]; ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, u, gl.STATIC_DRAW); ic = u.length; }
      const mat = pr.material !== undefined ? g.materials[pr.material] : null, pbr = mat && mat.pbrMetallicRoughness || {}, ti = pbr.baseColorTexture ? g.textures[pbr.baseColorTexture.index].source : -1;
      prims.push({ vb, ib, ic, skinned: n.skin !== undefined && !!J, node: ni, tex: ti >= 0 ? texs[ti] : white, mat: pr.material || 0, name: g.meshes[n.mesh].name, nodeName: n.name });
    } });
    const anims = {}; for (const an of g.animations || []) { let dur = 0; const ch = an.channels.map(c => { const sm = an.samplers[c.sampler], t = readAcc(g, bin, sm.input), v = readAcc(g, bin, sm.output); dur = Math.max(dur, t[t.length - 1]); return { node: c.target.node, path: c.target.path, t, v }; }); anims[an.name] = { dur, ch }; }
    return { N, parent, order, dT, dR, dS, joints, ibm, prims, anims, names: g.nodes.map(n => n.name || ''), height: maxY > minY ? maxY - minY : 2, minY, T: new Float32Array(N * 3), R: new Float32Array(N * 4), S: new Float32Array(N * 3), T2: new Float32Array(N * 3), R2: new Float32Array(N * 4), S2: new Float32Array(N * 3) };
  }
  function sampleAnim(an, time, T, R, S) {
    if (!an) return; const tt = an.dur > 0 ? time : 0;
    for (const c of an.ch) {
      const t = c.t, n = t.length; let i = 0; if (tt >= t[n - 1]) i = n - 1; else { let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= tt) lo = m; else hi = m; } i = lo; }
      const j = Math.min(n - 1, i + 1), k = j > i ? Math.max(0, Math.min(1, (tt - t[i]) / (t[j] - t[i]))) : 0, v = c.v, o = c.node;
      if (c.path === 'rotation') { let ax = v[i * 4], ay = v[i * 4 + 1], az = v[i * 4 + 2], aw = v[i * 4 + 3], bx = v[j * 4], by = v[j * 4 + 1], bz = v[j * 4 + 2], bw = v[j * 4 + 3]; if (ax * bx + ay * by + az * bz + aw * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; }
        let x = ax + (bx - ax) * k, y = ay + (by - ay) * k, z = az + (bz - az) * k, w = aw + (bw - aw) * k; const l = Math.hypot(x, y, z, w) || 1; R[o * 4] = x / l; R[o * 4 + 1] = y / l; R[o * 4 + 2] = z / l; R[o * 4 + 3] = w / l; }
      else { const D = c.path === 'translation' ? T : c.path === 'scale' ? S : null; if (!D) continue; for (let q = 0; q < 3; q++) D[o * 3 + q] = v[i * 3 + q] + (v[j * 3 + q] - v[i * 3 + q]) * k; }
    }
  }
  // pose(model, animA, timeA, animB, timeB, weightA, out) -> out = model-space matrix per node (16 floats each)
  function pose(md, a1, t1, a2, t2, w, out) {
    const { N, T, R, S, T2, R2, S2 } = md; T.set(md.dT); R.set(md.dR); S.set(md.dS); sampleAnim(md.anims[a1], t1, T, R, S);
    if (a2 && w < 0.999 && md.anims[a2]) { T2.set(md.dT); R2.set(md.dR); S2.set(md.dS); sampleAnim(md.anims[a2], t2, T2, R2, S2);
      for (let i = 0; i < N * 3; i++) { T[i] = T2[i] + (T[i] - T2[i]) * w; S[i] = S2[i] + (S[i] - S2[i]) * w; }
      for (let i = 0; i < N; i++) { let d = 0; for (let q = 0; q < 4; q++) d += R[i * 4 + q] * R2[i * 4 + q]; const sg = d < 0 ? -1 : 1; let l = 0; for (let q = 0; q < 4; q++) { R[i * 4 + q] = R2[i * 4 + q] * sg + (R[i * 4 + q] - R2[i * 4 + q] * sg) * w; l += R[i * 4 + q] * R[i * 4 + q]; } l = Math.sqrt(l) || 1; for (let q = 0; q < 4; q++) R[i * 4 + q] /= l; } }
    for (const i of md.order) {
      const x = R[i * 4], y = R[i * 4 + 1], z = R[i * 4 + 2], ww = R[i * 4 + 3], sx = S[i * 3], sy = S[i * 3 + 1], sz = S[i * 3 + 2], L = tmpL;
      L[0] = (1 - 2 * (y * y + z * z)) * sx; L[1] = 2 * (x * y + z * ww) * sx; L[2] = 2 * (x * z - y * ww) * sx; L[3] = 0;
      L[4] = 2 * (x * y - z * ww) * sy; L[5] = (1 - 2 * (x * x + z * z)) * sy; L[6] = 2 * (y * z + x * ww) * sy; L[7] = 0;
      L[8] = 2 * (x * z + y * ww) * sz; L[9] = 2 * (y * z - x * ww) * sz; L[10] = (1 - 2 * (x * x + y * y)) * sz; L[11] = 0; L[12] = T[i * 3]; L[13] = T[i * 3 + 1]; L[14] = T[i * 3 + 2]; L[15] = 1;
      const p = md.parent[i]; if (p < 0) out.set(L, i * 16); else mulInto(out, i * 16, out, p * 16, L, 0);
    }
    return out;
  }
  const tmpL = new Float32Array(16);
  function mulInto(o, oo, a, ao, b, bo) { for (let c = 0; c < 4; c++) { const b0 = b[bo + c * 4], b1 = b[bo + c * 4 + 1], b2 = b[bo + c * 4 + 2], b3 = b[bo + c * 4 + 3]; for (let r = 0; r < 4; r++) tmp4[r] = a[ao + r] * b0 + a[ao + 4 + r] * b1 + a[ao + 8 + r] * b2 + a[ao + 12 + r] * b3; o[oo + c * 4] = tmp4[0]; o[oo + c * 4 + 1] = tmp4[1]; o[oo + c * 4 + 2] = tmp4[2]; o[oo + c * 4 + 3] = tmp4[3]; } }
  const tmp4 = new Float32Array(4);
  // queue a posed character: world position, yaw, uniform scale, tint, per-material emissive colour (index 1 = weapon)
  const skinQ = []; const jbuf = new Float32Array(32 * 16), mw = new Float32Array(16);
  // gear (optional): { hide: Uint8Array per prim (1 = skip), mesh: gearMesh(...), col } - equipment rigidly skinned to bones, one draw
  function drawSkinned(md, nodes, x, y, z, yaw, sc, tint, emc, alpha, wemc, gear) { if (PK) skinQ.push({ md, nodes, x, y, z, yaw, sc, tint: tint || [1, 1, 1], emc: emc || [0, 0, 0], alpha: alpha === undefined ? 1 : alpha, wemc, gear }); }
  // equipment mesh: interleaved character vertices (16 floats: pos, normal, uv, joints, weights) + RGBA palette (alpha < 255 glows)
  const palTex = new Map();
  function gearMesh(verts, palette, palW) {
    let tex = palTex.get(palette);
    if (!tex) { tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, palW, palette.length / 4 / palW, 0, gl.RGBA, gl.UNSIGNED_BYTE, palette); for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); palTex.set(palette, tex); }
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    return { vb, ic: verts.length / 16, tex };
  }
  function drawSkinQueue(shadowPass) {
    if (!skinQ.length) return; const P = shadowPass ? PKD : PK, U2 = shadowPass ? UKD : UK; gl.useProgram(P);
    for (let i = 2; i < 7; i++) DV(i, 0); for (let i = 5; i < 7; i++) X(i);
    if (!shadowPass) { gl.uniformMatrix4fv(U2.VP, false, cam.VP); gl.uniform3fv(U2.cam, cam.eye); gl.uniform3fv(U2.fog, sky_.fog); gl.uniform3fv(U2.sunCol, sky_.sun); gl.uniform3fv(U2.ambCol, sky_.amb); gl.uniform3fv(U2.sunDir, SUN); gl.uniform1i(U2.tex, 0); gl.uniform1i(U2.shadow, 1); gl.uniform1f(U2.shadowSize, SH); }
    for (const q of skinQ) {
      if (shadowPass && q.alpha < 1) continue; const md = q.md, c = Math.cos(q.yaw), s = Math.sin(q.yaw), k = q.sc;
      mw[0] = c * k; mw[1] = 0; mw[2] = -s * k; mw[3] = 0; mw[4] = 0; mw[5] = k; mw[6] = 0; mw[7] = 0; mw[8] = s * k; mw[9] = 0; mw[10] = c * k; mw[11] = 0; mw[12] = q.x; mw[13] = q.y; mw[14] = q.z; mw[15] = 1;
      gl.uniformMatrix4fv(U2.MW, false, mw);
      if (!shadowPass) { gl.uniform3fv(U2.tint, q.tint); gl.uniform1f(U2.alpha, q.alpha); }
      let jointsSet = false; const hide = q.gear && q.gear.hide, gm = q.gear && q.gear.mesh;
      if (!shadowPass) gl.uniform1f(U2.glw, 0);
      for (let pi = 0; pi <= md.prims.length; pi++) {
        let pr = md.prims[pi];
        if (pi === md.prims.length) { if (!gm || !gm.ic) break; pr = { skinned: true, vb: gm.vb, ic: gm.ic, tex: gm.tex, mat: -1, gear: 1 }; if (!shadowPass) { gl.uniform1f(U2.glw, 1); gl.uniform3fv(U2.tint, q.gear.col || [1, 1, 1]); } }
        else if (hide && hide[pi]) continue;
        if (pr.skinned) { if (!jointsSet) { for (let jn = 0; jn < md.joints.length && jn < 32; jn++) mulInto(jbuf, jn * 16, q.nodes, md.joints[jn] * 16, md.ibm, jn * 16); jointsSet = true; } gl.uniformMatrix4fv(U2.B, false, jbuf); }
        else { gl.uniformMatrix4fv(U2.B, false, q.nodes.subarray(pr.node * 16, pr.node * 16 + 16)); jointsSet = false; }
        if (!shadowPass) { gl.uniform3fv(U2.emc, pr.mat === 1 && q.wemc ? q.wemc : q.emc); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, pr.tex); }
        gl.bindBuffer(gl.ARRAY_BUFFER, pr.vb); A(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 64, 0); A(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 64, 12); A(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 64, 24); A(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 64, 32); A(4); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 64, 48);
        if (pr.ib) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pr.ib); gl.drawElements(gl.TRIANGLES, pr.ic, gl.UNSIGNED_SHORT, 0); } else gl.drawArrays(gl.TRIANGLES, 0, pr.ic); Q.draws++;
      }
    }
  }
  function render() {
    Q.draws = 0; Q.inst = 0;
    for (const m of list) for (const q of [m.o, m.t, m.d]) if (q.n) { gl.bindBuffer(gl.ARRAY_BUFFER, q.buf); gl.bufferData(gl.ARRAY_BUFFER, q.arr.subarray(0, q.n * STRIDE), gl.DYNAMIC_DRAW); }
    const sh = shadowsOn(), T = cam.tgt; let LVP = null;
    if (sh) {
      const R = Q.shadowQuality === 'low' ? 520 : 760, tx = 2 * R / SH, e0 = [T[0] + SUN[0] * 1100, T[1] + SUN[1] * 1100, T[2] + SUN[2] * 1100], b = look(e0, T);
      const sr = dot(T, b.right), su = dot(T, b.up), dr = Math.round(sr / tx) * tx - sr, du = Math.round(su / tx) * tx - su, t2 = [T[0] + b.right[0] * dr + b.up[0] * du, T[1] + b.right[1] * dr + b.up[1] * du, T[2] + b.right[2] * dr + b.up[2] * du];
      const v = look([t2[0] + SUN[0] * 1100, t2[1] + SUN[1] * 1100, t2[2] + SUN[2] * 1100], t2), n = 200, f = 2300;
      LVP = mul(new Float32Array([1 / R, 0, 0, 0, 0, 1 / R, 0, 0, 0, 0, -2 / (f - n), 0, 0, 0, -(f + n) / (f - n), 1]), v.m);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, SH, SH); gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(P2); gl.uniformMatrix4fv(UD.LVP, false, LVP); gl.disable(gl.BLEND); gl.depthMask(true);
      drawChunks(T[0], T[2], R, false); drawInst('o'); if (PK) { drawSkinQueue(true); gl.useProgram(P2); } gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(sky_.fog[0], sky_.fog[1], sky_.fog[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(P1); gl.enable(gl.BLEND);
    gl.uniformMatrix4fv(U.VP, false, cam.VP); gl.uniformMatrix4fv(U.LVP, false, LVP || cam.VP); gl.uniform3fv(U.cam, cam.eye); gl.uniform3fv(U.tgt, [cam.tgt[0], cam.tgt[1] + 10, cam.tgt[2]]); gl.uniform3fv(U.fog, sky_.fog); gl.uniform3fv(U.sunCol, sky_.sun); gl.uniform3fv(U.ambCol, sky_.amb);
    gl.uniform3fv(U.sunDir, SUN); gl.uniform3fv(U.skyCol, sky_.zen); gl.uniform1f(U.night, 1 - sky_.d); gl.uniform1f(U.shOn, sh ? 1 : 0); gl.uniform1f(U.shadowSize, SH);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, shTex); gl.uniform1i(U.shadow, 1); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, gtex); gl.uniform1i(U.tex, 0); gl.uniform3f(U.texR, gR[0], gR[1], gR[2]);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.uniform1f(U.mode, 2); const E = cam.eye; drawConst(sky, [7000, 0, 0, E[0]], [0, 7000, 0, E[1]], [0, 0, 7000, E[2]]);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.uniform1f(U.mode, 1); if (gtex) drawConst(ground, I0, I1, I2);
    gl.uniform1f(U.mode, 0); drawChunks(T[0], T[2], 1900, true); drawInst('o'); drawInst('d');
    if (PK && skinQ.length) { gl.useProgram(PK); gl.uniformMatrix4fv(UK.LVP, false, LVP || cam.VP); gl.uniform1f(UK.shOn, sh ? 1 : 0); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, shTex); drawSkinQueue(false); for (let i = 2; i < 5; i++) X(i); gl.useProgram(P1); gl.activeTexture(gl.TEXTURE0); }
    gl.depthMask(false); drawInst('t'); gl.depthMask(true); skinQ.length = 0;
  }
  return { gl, M, cam, Q, CH, skinOK: () => !!PK, loadGLB, pose, drawSkinned, gearMesh, meshFromArray, instWrite, pushInst, setDetail: r => { detailR = r; }, STRIDE, setSky, setCamera, project, boundsVisible, ray, draw, begin, render, setGround, bakeBegin, bakeAdd, bakeEnd, setQuality, setRenderOptions, perf, shadowsOn, sky: () => sky_ };
})();
