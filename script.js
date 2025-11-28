// =========================================
// MATHSOLVER: BUG FIX (DYNAMIC UI)
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
    container.innerHTML = ''; initContainer.innerHTML = '';

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

    // UPDATE UI OTOMATIS SAAT JUMLAH VARIABEL BERUBAH
    updatePhaseUI();
}

// --- FUNGSI BARU UNTUK MENGATUR TAMPILAN 2D/3D ---
function updatePhaseUI() {
    const varCount = parseInt(document.getElementById('varCount').value) || 2;
    const zLimits = document.getElementById('zLimits');
    const trajContainer = document.getElementById('trajInputsContainer');

    // 1. Atur Batas Grafik (Show/Hide Z Min Max)
    if (varCount === 3) {
        zLimits.classList.remove('hidden'); // Munculkan Z
    } else {
        zLimits.classList.add('hidden');    // Sembunyikan Z
    }

    // 2. Reset Trajektori Input jika jumlah variabel berubah
    // (Agar tidak ada input Z nyangkut saat pindah ke 2D)
    trajContainer.innerHTML = '';
}

function createTrajectoryInputs() {
    const count = parseInt(document.getElementById('trajCount').value) || 0;
    const varCount = parseInt(document.getElementById('varCount').value) || 2;
    const container = document.getElementById('trajInputsContainer');
    container.innerHTML = '';

    if (count <= 0) return;
    if (count > 20) { alert("Maksimal 20 titik."); return; }

    for (let i = 0; i < count; i++) {
        const row = document.createElement('div');

        // LOGIKA PERBAIKAN: Cek varCount saat tombol ditekan
        if (varCount === 3) {
            row.className = 'grid-3'; // 3 Kolom
            row.innerHTML = `
                <input type="number" class="traj-x" step="any" placeholder="X0">
                <input type="number" class="traj-y" step="any" placeholder="Y0">
                <input type="number" class="traj-z" step="any" placeholder="Z0">
            `;
        } else {
            row.className = 'grid-2'; // 2 Kolom
            row.innerHTML = `
                <input type="number" class="traj-x" step="any" placeholder="X0">
                <input type="number" class="traj-y" step="any" placeholder="Y0">
            `;
        }

        row.style.marginBottom = '5px';
        row.style.borderLeft = `4px solid ${trajColors[i % trajColors.length]}`;
        row.style.paddingLeft = '10px';
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

        const varSelect = document.getElementById('varCount');
        // Izinkan 2 atau 3
        if (varSelect.value !== "2" && varSelect.value !== "3") {
            varSelect.value = "2";
            createVarInputs();
        }
        // Trigger update UI agar inputan Z menyesuaikan
        updatePhaseUI();

    } else {
        document.getElementById('btn-time').classList.add('active');
        document.getElementById('timeseries-inputs').classList.remove('hidden');
    }
}

// =========================================
// 2. LOGIKA MATEMATIKA
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
    for (let i = 0; i < names.length; i++) {
        const name = names[i].value.trim();
        const funcStr = funcs[i].value.trim();
        if (!name || !funcStr) throw new Error("Lengkapi data variabel.");
        try { v.push({ name: name, expr: math.compile(funcStr) }); }
        catch (e) { throw new Error(`Rumus Salah '${name}': ${e.message}`); }
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
// 3. PLOT GENERATOR
// =========================================
function generatePlot() {
    try {
        const p = getParams();
        const v = getVariables();
        const vNames = v.map(o => o.name);
        Plotly.purge('plot-area');

        if (currentMode === 'phase') {
            if (v.length === 3) runPhasePortrait3D(p, v, vNames);
            else if (v.length === 2) runPhasePortrait2D(p, v, vNames);
            else throw new Error("Potret Fase butuh 2 atau 3 variabel.");
        } else {
            runTimeSeries(p, v, vNames);
        }
    } catch (e) { alert("Error: " + e.message); }
}

function runTimeSeries(params, vars, vNames) {
    const tMax = parseFloat(document.getElementById('tMax').value) || 50;
    const initInputs = document.querySelectorAll('.init-val');
    let s = { ...params }, t = 0;
    vNames.forEach((n, i) => s[n] = parseFloat(initInputs[i]?.value) || 0.1);

    let xData = [0], yData = vNames.map(n => [s[n]]);
    let dt = 0.05;
    for (let step = 0; step < tMax / dt; step++) {
        let n = rk4Step(s, vars, dt);
        t += dt; s = { ...params, ...n };
        xData.push(t); vNames.forEach((name, i) => yData[i].push(s[name]));
        if (Math.abs(s[vNames[0]]) > 1e6) break;
    }
    Plotly.newPlot('plot-area', vNames.map((n, i) => ({ x: xData, y: yData[i], name: n })), { title: 'Time Series' });
}

function runPhasePortrait2D(params, vars, vNames) {
    let xMin = parseFloat(document.getElementById('xMin').value) || 0;
    let xMax = parseFloat(document.getElementById('xMax').value) || 5;
    let yMin = parseFloat(document.getElementById('yMin').value) || 0;
    let yMax = parseFloat(document.getElementById('yMax').value) || 5;

    let traces = [], annotations = [];

    // Direction Field
    const gridRes = 16;
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
                    x: x + u * sx * 0.5, y: y + v * sy * 0.5, ax: x - u * sx * 0.2, ay: y - v * sy * 0.2,
                    xref: 'x', yref: 'y', axref: 'x', ayref: 'y', showarrow: true, arrowhead: 3, arrowsize: 1, arrowwidth: 1,
                    arrowcolor: `rgb(0, ${cVal}, 200)`, opacity: 0.5
                });
            }
        }
    }

    // Trajectories 2D
    let startPoints = [];
    const xInputs = document.querySelectorAll('.traj-x');
    const yInputs = document.querySelectorAll('.traj-y');

    // Prioritaskan Input Manual
    if (xInputs.length > 0) {
        for (let i = 0; i < xInputs.length; i++) {
            let vx = parseFloat(xInputs[i].value), vy = parseFloat(yInputs[i].value);
            if (!isNaN(vx) && !isNaN(vy)) startPoints.push({ x: vx, y: vy });
        }
    } else {
        // Fallback Grid
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
        traces.push({ x: px, y: py, mode: 'lines', line: { width: 2.5, color: color }, name: `Start ${idx + 1}` });
        traces.push({ x: [pt.x], y: [pt.y], mode: 'markers', marker: { size: 6, color: color }, showlegend: false });
    });

    Plotly.newPlot('plot-area', traces, {
        title: `2D Phase Portrait (${vNames[0]} vs ${vNames[1]})`,
        xaxis: { title: vNames[0], range: [xMin, xMax] }, yaxis: { title: vNames[1], range: [yMin, yMax] }, annotations: annotations
    });
}

function runPhasePortrait3D(params, vars, vNames) {
    let traces = [];
    let startPoints = [];

    // Ambil Batas Grafik 3D (Z juga)
    let xMin = parseFloat(document.getElementById('xMin').value) || 0;
    let xMax = parseFloat(document.getElementById('xMax').value) || 10;
    let yMin = parseFloat(document.getElementById('yMin').value) || 0;
    let yMax = parseFloat(document.getElementById('yMax').value) || 10;
    let zMin = parseFloat(document.getElementById('zMin').value) || 0;
    let zMax = parseFloat(document.getElementById('zMax').value) || 10;

    const xInputs = document.querySelectorAll('.traj-x');
    const yInputs = document.querySelectorAll('.traj-y');
    const zInputs = document.querySelectorAll('.traj-z');

    if (xInputs.length > 0) {
        for (let i = 0; i < xInputs.length; i++) {
            let vx = parseFloat(xInputs[i].value), vy = parseFloat(yInputs[i].value), vz = parseFloat(zInputs[i]?.value);
            if (!isNaN(vx) && !isNaN(vy) && !isNaN(vz)) startPoints.push({ x: vx, y: vy, z: vz });
        }
    }
    if (startPoints.length === 0) startPoints.push({ x: 1, y: 1, z: 1 });

    startPoints.forEach((pt, idx) => {
        let px = [pt.x], py = [pt.y], pz = [pt.z];
        let s = { ...params }; s[vNames[0]] = pt.x; s[vNames[1]] = pt.y; s[vNames[2]] = pt.z;
        for (let k = 0; k < 3000; k++) {
            let n = rk4Step(s, vars, 0.02); s = { ...params, ...n };
            px.push(s[vNames[0]]); py.push(s[vNames[1]]); pz.push(s[vNames[2]]);
            if (Math.abs(s[vNames[0]]) > 1e4) break;
        }
        traces.push({
            type: 'scatter3d', mode: 'lines', x: px, y: py, z: pz, opacity: 0.8,
            line: { width: 4, color: trajColors[idx % trajColors.length] }, name: `Start ${idx + 1}`
        });
        traces.push({
            type: 'scatter3d', mode: 'markers', x: [pt.x], y: [pt.y], z: [pt.z],
            marker: { size: 4, color: trajColors[idx % trajColors.length] }, showlegend: false
        });
    });

    Plotly.newPlot('plot-area', traces, {
        title: `3D Phase Portrait`,
        scene: {
            xaxis: { title: vNames[0], range: [xMin, xMax] },
            yaxis: { title: vNames[1], range: [yMin, yMax] },
            zaxis: { title: vNames[2], range: [zMin, zMax] }
        },
        height: 700
    });
}

function downloadImage() {
    const plotDiv = document.getElementById('plot-area');
    if (plotDiv.data && plotDiv.data.length > 0) {
        Plotly.downloadImage(plotDiv, { format: 'png', width: 1200, height: 800, filename: 'MathSolver_Simulasi' });
    } else { alert("Generate dulu."); }
}
