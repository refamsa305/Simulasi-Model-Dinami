// =========================================
// MATHSOLVER: 3D SUPPORT & BUG FIXES
// =========================================
let currentMode = 'timeseries';
let params = {};
const trajColors = ['#C71585', '#00CED1', '#32CD32', '#FF8C00', '#8A2BE2', '#FF1493', '#4169E1'];

// =========================================
// 1. UI & INPUT MANAGEMENT
// =========================================

function createParamInputs() {
    const count = parseInt(document.getElementById('paramCount').value) || 0;
    const container = document.getElementById('paramInputsContainer');
    // JANGAN RESET container jika isinya sudah ada dan jumlahnya sama (mencegah data hilang tidak sengaja)
    if (container.children.length === count) return;

    container.innerHTML = '';
    if (count > 10) { alert("Maksimal 10 parameter."); return; }
    for (let i = 0; i < count; i++) {
        const row = document.createElement('div');
        row.className = 'grid-2';
        row.style.marginBottom = '5px';
        row.innerHTML = `<input type="text" class="param-name" placeholder="Nama (cth: ${String.fromCharCode(97 + i)})"><input type="number" class="param-val" step="any" placeholder="Nilai">`;
        container.appendChild(row);
    }
}

function createVarInputs() {
    const count = parseInt(document.getElementById('varCount').value) || 0;
    const container = document.getElementById('varInputsContainer');
    const initContainer = document.getElementById('initialConditionsContainer');

    // Reset container hanya jika jumlah berubah drastis
    container.innerHTML = '';
    initContainer.innerHTML = '';

    if (count === 0) return;
    const defaultVars = ['x', 'y', 'z'];

    for (let i = 0; i < count; i++) {
        const vPlaceholder = defaultVars[i] || `x${i + 1}`;
        const row = document.createElement('div');
        row.className = 'dynamic-row';
        row.innerHTML = `<input type="text" class="var-name" value="${vPlaceholder}" placeholder="Nama"><input type="text" class="var-func" placeholder="d${vPlaceholder}/dt = ...">`;
        container.appendChild(row);

        const initInput = document.createElement('input');
        initInput.type = 'number'; initInput.className = 'init-val';
        initInput.placeholder = `${vPlaceholder}(0)`; initInput.step = "any";
        initContainer.appendChild(initInput);
    }
}

// Fitur Input Titik Manual (Dari request sebelumnya)
function createTrajectoryInputs() {
    const count = parseInt(document.getElementById('trajCount').value) || 0;
    const container = document.getElementById('trajInputsContainer');
    container.innerHTML = '';
    if (count <= 0) return;
    for (let i = 0; i < count; i++) {
        const row = document.createElement('div');
        row.className = 'grid-2';
        row.style.marginBottom = '5px';
        row.style.borderLeft = `4px solid ${trajColors[i % trajColors.length]}`;
        row.style.paddingLeft = '10px';
        row.innerHTML = `
            <input type="number" class="traj-x" step="any" placeholder="X0">
            <input type="number" class="traj-y" step="any" placeholder="Y0">
        `;
        container.appendChild(row);
    }
}

function setMode(mode) {
    currentMode = mode;
    document.getElementById('btn-phase').classList.remove('active');
    document.getElementById('btn-time').classList.remove('active');
    document.getElementById('phase-inputs').classList.add('hidden');
    document.getElementById('timeseries-inputs').classList.add('hidden');

    if (mode === 'phase') {
        document.getElementById('btn-phase').classList.add('active');
        document.getElementById('phase-inputs').classList.remove('hidden');
        // KITA IZINKAN 2 ATAU 3 VARIABEL UNTUK POTRET FASE
        const varSelect = document.getElementById('varCount');
        if (varSelect.value !== "2" && varSelect.value !== "3") {
            varSelect.value = "2";
            createVarInputs();
        }
        varSelect.disabled = false; // Buka kunci agar bisa pilih 3D
    } else {
        document.getElementById('btn-time').classList.add('active');
        document.getElementById('timeseries-inputs').classList.remove('hidden');
        document.getElementById('varCount').disabled = false;
    }
}

// =========================================
// 2. LOGIKA MATEMATIKA & VALIDASI KUAT
// =========================================
function getParams() {
    const names = document.querySelectorAll('.param-name');
    const vals = document.querySelectorAll('.param-val');
    let p = {};
    for (let i = 0; i < names.length; i++) {
        const name = names[i].value.trim();
        const val = parseFloat(vals[i].value);
        if (name && !isNaN(val)) p[name] = val;
    }
    return p;
}

function getVariables() {
    const names = document.querySelectorAll('.var-name');
    const funcs = document.querySelectorAll('.var-func');
    let v = [];

    // VALIDASI KETAT: Cek mana yang kosong
    for (let i = 0; i < names.length; i++) {
        const name = names[i].value.trim();
        const funcStr = funcs[i].value.trim();

        if (!name) throw new Error(`Nama variabel pada baris ke-${i + 1} masih kosong.`);
        if (!funcStr) throw new Error(`Fungsi persamaan untuk '${name}' masih kosong.`);

        try { v.push({ name: name, expr: math.compile(funcStr) }); }
        catch (e) { throw new Error(`Rumus Salah pada variabel '${name}': ${e.message}`); }
    }
    return v;
}

function rk4Step(scope, vars, dt) {
    let vals = vars.map(v => scope[v.name]);
    const evalDeriv = (s) => vars.map(v => v.expr.evaluate(s));

    let k1 = evalDeriv(scope);
    let s2 = { ...scope }; vars.forEach((v, i) => s2[v.name] = vals[i] + k1[i] * dt * 0.5);
    let k2 = evalDeriv(s2);
    let s3 = { ...scope }; vars.forEach((v, i) => s3[v.name] = vals[i] + k2[i] * dt * 0.5);
    let k3 = evalDeriv(s3);
    let s4 = { ...scope }; vars.forEach((v, i) => s4[v.name] = vals[i] + k3[i] * dt);
    let k4 = evalDeriv(s4);

    let next = {};
    vars.forEach((v, i) => { next[v.name] = vals[i] + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]); });
    return next;
}

// =========================================
// 3. PLOT GENERATOR (AUTO DETECT 2D/3D)
// =========================================
function generatePlot() {
    try {
        const p = getParams();
        const v = getVariables();
        const vNames = v.map(o => o.name);

        Plotly.purge('plot-area');

        // LOGIKA BARU: Otomatis deteksi 3 Variabel untuk Potret Fase 3D
        if (currentMode === 'phase') {
            if (v.length === 3) {
                runPhasePortrait3D(p, v, vNames); // FITUR BARU 3D
            } else if (v.length === 2) {
                runPhasePortrait2D(p, v, vNames); // 2D Biasa
            } else {
                throw new Error("Potret Fase hanya mendukung 2 atau 3 variabel.");
            }
        } else {
            runTimeSeries(p, v, vNames);
        }
    } catch (e) {
        alert("Gagal Generate: " + e.message);
        console.error(e);
    }
}

// --- MODE 1: TIME SERIES (Grafik Garis vs Waktu) ---
function runTimeSeries(params, vars, vNames) {
    const tMax = parseFloat(document.getElementById('tMax').value) || 50;
    const initInputs = document.querySelectorAll('.init-val');
    let s = { ...params }, t = 0;
    vNames.forEach((n, i) => s[n] = parseFloat(initInputs[i]?.value) || 0.1);

    let xData = [0], yData = vNames.map(n => [s[n]]);
    let dt = 0.05;

    // Safety loop
    for (let step = 0; step < tMax / dt; step++) {
        let n = rk4Step(s, vars, dt);
        t += dt; s = { ...params, ...n };
        xData.push(t); vNames.forEach((name, i) => yData[i].push(s[name]));

        // Break if exploded
        if (Math.abs(s[vNames[0]]) > 1e6) break;
    }

    Plotly.newPlot('plot-area', vNames.map((n, i) => ({ x: xData, y: yData[i], name: n })), {
        title: 'Time Series Simulation',
        xaxis: { title: 'Time' }, yaxis: { title: 'Population / Value' }
    });
}

// --- MODE 2: PHASE PORTRAIT 2D (X vs Y) ---
function runPhasePortrait2D(params, vars, vNames) {
    let xMin = parseFloat(document.getElementById('xMin').value) || 0;
    let xMax = parseFloat(document.getElementById('xMax').value) || 5;
    let yMin = parseFloat(document.getElementById('yMin').value) || 0;
    let yMax = parseFloat(document.getElementById('yMax').value) || 5;

    let traces = [], annotations = [];

    // 1. Direction Field
    const gridRes = 15;
    const sx = (xMax - xMin) / gridRes, sy = (yMax - yMin) / gridRes;
    let maxMag = 0;

    for (let i = 0; i <= gridRes; i++) {
        for (let j = 0; j <= gridRes; j++) {
            let x = xMin + i * sx, y = yMin + j * sy;
            let s = { ...params }; s[vNames[0]] = x; s[vNames[1]] = y;
            let m = Math.hypot(vars[0].expr.evaluate(s), vars[1].expr.evaluate(s));
            if (m > maxMag) maxMag = m;
        }
    }

    for (let i = 0; i <= gridRes; i++) {
        for (let j = 0; j <= gridRes; j++) {
            let x = xMin + i * sx, y = yMin + j * sy;
            let s = { ...params }; s[vNames[0]] = x; s[vNames[1]] = y;
            let dx = vars[0].expr.evaluate(s), dy = vars[1].expr.evaluate(s);
            let mag = Math.hypot(dx, dy);

            if (mag > 0.001) {
                let u = dx / mag, v = dy / mag;
                let cVal = Math.floor(Math.min(mag / (maxMag * 0.6), 1) * 255);
                annotations.push({
                    x: x + u * sx * 0.5, y: y + v * sy * 0.5,
                    ax: x - u * sx * 0.2, ay: y - v * sy * 0.2,
                    xref: 'x', yref: 'y', axref: 'x', ayref: 'y',
                    showarrow: true, arrowhead: 3, arrowsize: 1, arrowwidth: 1,
                    arrowcolor: `rgb(0, ${cVal}, 200)`, opacity: 0.5
                });
            }
        }
    }

    // 2. Trajectories (Input Manual + Default)
    let startPoints = [];
    const xInputs = document.querySelectorAll('.traj-x');
    const yInputs = document.querySelectorAll('.traj-y');

    // Ambil input manual user
    if (xInputs.length > 0) {
        for (let i = 0; i < xInputs.length; i++) {
            let vx = parseFloat(xInputs[i].value), vy = parseFloat(yInputs[i].value);
            if (!isNaN(vx) && !isNaN(vy)) startPoints.push({ x: vx, y: vy });
        }
    }
    // Jika user tidak isi input manual, gunakan grid otomatis
    if (startPoints.length === 0) {
        for (let i = 1; i <= 3; i++) for (let j = 1; j <= 3; j++)
            startPoints.push({ x: xMin + (xMax - xMin) * (i / 4), y: yMin + (yMax - yMin) * (j / 4) });
    }

    startPoints.forEach((pt, idx) => {
        let px = [pt.x], py = [pt.y];
        let s = { ...params }; s[vNames[0]] = pt.x; s[vNames[1]] = pt.y;

        for (let k = 0; k < 1500; k++) {
            let n = rk4Step(s, vars, 0.02); s = { ...params, ...n };
            px.push(s[vNames[0]]); py.push(s[vNames[1]]);
            if (s[vNames[0]] < xMin - 1 || s[vNames[0]] > xMax + 1 || s[vNames[1]] < yMin - 1 || s[vNames[1]] > yMax + 1) break;
            if (Math.hypot(vars[0].expr.evaluate(s), vars[1].expr.evaluate(s)) < 0.005) break;
        }

        let color = trajColors[idx % trajColors.length];
        traces.push({
            x: px, y: py, mode: 'lines',
            line: { width: 2.5, color: color }, name: `Start ${idx + 1}`
        });
        traces.push({
            x: [pt.x], y: [pt.y], mode: 'markers', marker: { size: 6, color: color }, showlegend: false
        });
    });

    Plotly.newPlot('plot-area', traces, {
        title: `2D Phase Portrait (${vNames[0]} vs ${vNames[1]})`,
        xaxis: { title: vNames[0], range: [xMin, xMax] },
        yaxis: { title: vNames[1], range: [yMin, yMax] },
        annotations: annotations
    });
}

// --- MODE 3: PHASE PORTRAIT 3D (X vs Y vs Z) ---
function runPhasePortrait3D(params, vars, vNames) {
    let traces = [];

    // Kita buat satu trajektori panjang (bagus untuk Strange Attractors seperti Lorenz/Rossler)
    // Atau beberapa trajektori pendek

    let startPoints = [
        { x: 1, y: 1, z: 1 },
        { x: 0.1, y: 0.1, z: 0.1 },
        { x: 2, y: 5, z: 2 }
    ];

    // Cek apakah ada input manual dari user (jika user memaksa pakai input manual 2D untuk 3D, kita ambil 2 pertamanya, z default)
    const xInputs = document.querySelectorAll('.traj-x');
    if (xInputs.length > 0) {
        startPoints = [];
        for (let i = 0; i < xInputs.length; i++) {
            let vx = parseFloat(xInputs[i].value);
            // Input manual kita cuma 2 kolom (X, Y), jadi Z kita random atau 1
            if (!isNaN(vx)) startPoints.push({ x: vx, y: vx, z: vx });
        }
    }

    startPoints.forEach((pt, idx) => {
        let px = [pt.x], py = [pt.y], pz = [pt.z];
        let s = { ...params };
        s[vNames[0]] = pt.x; s[vNames[1]] = pt.y; s[vNames[2]] = pt.z;

        // Loop lebih panjang untuk 3D (agar bentuk attractor kelihatan)
        for (let k = 0; k < 3000; k++) {
            let n = rk4Step(s, vars, 0.02); s = { ...params, ...n };
            px.push(s[vNames[0]]); py.push(s[vNames[1]]); pz.push(s[vNames[2]]);

            if (Math.abs(s[vNames[0]]) > 100) break; // Safety break
        }

        traces.push({
            type: 'scatter3d',
            mode: 'lines',
            x: px, y: py, z: pz,
            opacity: 0.8,
            line: { width: 4, color: trajColors[idx % trajColors.length] },
            name: `Orbit ${idx + 1}`
        });
    });

    Plotly.newPlot('plot-area', traces, {
        title: `3D Phase Portrait (${vNames[0]}, ${vNames[1]}, ${vNames[2]})`,
        scene: {
            xaxis: { title: vNames[0] },
            yaxis: { title: vNames[1] },
            zaxis: { title: vNames[2] }
        },
        height: 700
    });
}
