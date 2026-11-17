/**
 * UI & Topographic Canvas Renderer for the Real-World Wildfire Digital Twin
 * Port 8085 Companion to the 2012 NetLogo Simulator (Port 8080)
 */

(function () {
  const state = {
    running: false,
    timerId: null,
    tool: 'IGNITE', // 'IGNITE', 'RETARDANT', 'AIRDROP', 'RIDGE'
    scenario: 'LIGHTNING_NW',
    history: {
      rounds: [],
      lcacAlerts: [],
      wiresAlerts: [],
      lcacFunctional: [],
      wiresFunctional: [],
      lcacBattery: [],
      wiresBattery: [],
      lcacSaved: [],
      wiresDropped: []
    }
  };

  let lcacMesh = null;
  let wiresMesh = null;

  function readConfig() {
    return {
      nodesPerTile: parseInt(document.getElementById('ctrl-nodes').value, 10),
      neighborRadius: parseFloat(document.getElementById('ctrl-radius').value),
      minDelta: parseInt(document.getElementById('ctrl-delta').value, 10),
      windSpeedKmh: parseFloat(document.getElementById('ctrl-wind-speed').value),
      windDirectionDeg: parseFloat(document.getElementById('ctrl-wind-dir').value),
      fireSpreadMultiplier: parseFloat(document.getElementById('ctrl-spread').value),
      initialEnergy: 1000,
      energyPerTransmission: 18,
      enableCrossTile: document.getElementById('chk-cross-tile').checked,
      enableAIDDS: document.getElementById('chk-ai-dds').checked,
      enableTerrainObstruction: document.getElementById('chk-terrain').checked
    };
  }

  function buildScenarioGeometry(scenarioKey, nodesPerTile) {
    const positions = [];
    const ts = 20;
    for (let t = 0; t < 4; t++) {
      const colOff = (t % 2) * ts;
      const rowOff = Math.floor(t / 2) * ts;
      for (let i = 0; i < nodesPerTile; i++) {
        positions.push({
          x: colOff + 0.8 + Math.random() * (ts - 1.6),
          y: rowOff + 0.8 + Math.random() * (ts - 1.6)
        });
      }
    }

    // Default Granite Ridges (blocking direct line-of-sight across sectors unless routed around)
    let ridges = [
      { x1: 12.5, y1: 6.0, x2: 17.5, y2: 14.0 },
      { x1: 23.0, y1: 25.0, x2: 31.0, y2: 29.0 }
    ];

    let initialFires = [];
    if (scenarioKey === 'LIGHTNING_NW') {
      document.getElementById('ctrl-wind-dir').value = 38;
      document.getElementById('val-wind-dir').textContent = '38° (SE)';
      initialFires = [
        { x: 9.5, y: 9.0, flameR: 2.2, smokeR: 5.2, active: true }
      ];
    } else if (scenarioKey === 'PINCER_CANYON') {
      document.getElementById('ctrl-wind-dir').value = 15;
      document.getElementById('val-wind-dir').textContent = '15° (E)';
      ridges = [
        { x1: 14.0, y1: 4.5, x2: 18.5, y2: 15.5 },
        { x1: 21.5, y1: 24.0, x2: 27.5, y2: 35.0 }
      ];
      initialFires = [
        { x: 7.5, y: 12.0, flameR: 2.4, smokeR: 5.5, active: true },
        { x: 11.0, y: 29.0, flameR: 2.3, smokeR: 5.4, active: true }
      ];
    } else if (scenarioKey === 'HUB_ASSASSINATION') {
      // Ignites targeted fires near inner sector hubs to test 1-tick DDS self-healing vs WIRES collapse
      initialFires = [
        { x: 15.5, y: 15.5, flameR: 2.6, smokeR: 5.5, active: true },
        { x: 24.5, y: 15.5, flameR: 2.6, smokeR: 5.5, active: true }
      ];
    }

    return { positions, ridges, initialFires };
  }

  function resetSimulation() {
    stopSim();
    const cfg = readConfig();
    const { positions, ridges, initialFires } = buildScenarioGeometry(state.scenario, cfg.nodesPerTile);

    lcacMesh = new window.WildfireMeshInstance('LCAC', cfg);
    wiresMesh = new window.WildfireMeshInstance('WIRES', cfg);

    lcacMesh.initFromSharedState(positions, ridges, initialFires, cfg);
    wiresMesh.initFromSharedState(positions, ridges, initialFires, cfg);

    state.history = {
      rounds: [0],
      lcacAlerts: [0],
      wiresAlerts: [0],
      lcacFunctional: [positions.length],
      wiresFunctional: [positions.length],
      lcacBattery: [100],
      wiresBattery: [100],
      lcacSaved: [0],
      wiresDropped: [0]
    };

    updateKPIs(
      { round: 0, totalAlerts: 0, functionalSensors: positions.length, orphanedSensors: 0, burnedSensors: 0 },
      { round: 0, totalAlerts: 0, functionalSensors: positions.length, orphanedSensors: 0, burnedSensors: 0 }
    );
    renderAll();
    setBanner(
      `Wildfire Digital Twin Ready (${positions.length} canopy sensors across 4 sectors). Click "▶ RUN EMERGENCY SIM" or click on the forest map to ignite fires / drop retardant!`
    );
  }

  function stepOnce() {
    if (!lcacMesh || !wiresMesh) resetSimulation();
    const cfg = readConfig();
    Object.assign(lcacMesh.config, cfg);
    Object.assign(wiresMesh.config, cfg);

    const mLcac = lcacMesh.stepRound();
    const mWires = wiresMesh.stepRound();

    state.history.rounds.push(mLcac.round);
    state.history.lcacAlerts.push(mLcac.totalAlerts);
    state.history.wiresAlerts.push(mWires.totalAlerts);
    state.history.lcacFunctional.push(mLcac.functionalSensors);
    state.history.wiresFunctional.push(mWires.functionalSensors);
    state.history.lcacBattery.push(mLcac.avgBatteryPct);
    state.history.wiresBattery.push(mWires.avgBatteryPct);
    state.history.lcacSaved.push(mLcac.collisionsOrDrops);
    state.history.wiresDropped.push(mWires.collisionsOrDrops);

    updateKPIs(mLcac, mWires);
    renderAll();
  }

  function startSim() {
    if (state.running) return;
    state.running = true;
    const btn = document.getElementById('btn-run');
    btn.textContent = '⏸ PAUSE MISSION';
    btn.classList.replace('btn-fire', 'btn-warning');

    state.timerId = setInterval(() => {
      stepOnce();
    }, 115);
  }

  function stopSim() {
    state.running = false;
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
    const btn = document.getElementById('btn-run');
    if (btn) {
      btn.textContent = '▶ RUN EMERGENCY SIM';
      btn.classList.replace('btn-warning', 'btn-fire');
    }
  }

  function updateKPIs(mLcac, mWires) {
    document.getElementById('kpi-round').textContent = mLcac.round;
    document.getElementById('kpi-alerts').textContent = `${mLcac.totalAlerts} vs ${mWires.totalAlerts}`;
    document.getElementById('kpi-functional').textContent = `${mLcac.functionalSensors} vs ${mWires.functionalSensors}`;
    document.getElementById('kpi-orphaned').textContent = `${mLcac.orphanedSensors} vs ${mWires.orphanedSensors} cut off`;
  }

  function setBanner(msg) {
    const el = document.getElementById('status-banner');
    if (el) el.textContent = msg;
  }

  function renderForestCanvas(canvasId, mesh) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !mesh) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
    }

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const scale = W / mesh.worldSize;
    const halfW = W / 2;
    const halfH = H / 2;

    // 1. Forest Canopy Topographic Quadrants
    ctx.fillStyle = '#06120d';
    ctx.fillRect(0, 0, halfW, halfH);
    ctx.fillRect(halfW, halfH, halfW, halfH);

    ctx.fillStyle = '#0a1913';
    ctx.fillRect(halfW, 0, halfW, halfH);
    ctx.fillRect(0, halfH, halfW, halfH);

    // Subtle elevation contour rings
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.06)';
    ctx.lineWidth = 1;
    for (let r = 40; r < W * 0.7; r += 45) {
      ctx.beginPath();
      ctx.arc(halfW, halfH, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Sector Grid Lines
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(halfW, 0);
    ctx.lineTo(halfW, H);
    ctx.moveTo(0, halfH);
    ctx.lineTo(W, halfH);
    ctx.stroke();

    ctx.fillStyle = 'rgba(134, 239, 172, 0.45)';
    ctx.font = '600 10px Inter, sans-serif';
    ctx.fillText('SECTOR NW · PINE RIDGE', 7, 13);
    ctx.fillText('SECTOR NE · CANOPY VALLEY', halfW + 7, 13);
    ctx.fillText('SECTOR SW · RIVER GORGE', 7, halfH + 13);
    ctx.fillText('SECTOR SE · TIMBER BASIN', halfW + 7, halfH + 13);

    // 2. Render Wildfire Smoke Plumes & Active Flame Cores
    for (const f of mesh.fires) {
      if (!f.active) continue;
      const fx = f.x * scale;
      const fy = f.y * scale;
      const sr = f.smokeR * scale;
      const fr = f.flameR * scale;

      // Outer Smoke / Pre-Heat Plume (45°C - 120°C Alert Zone)
      const smokeGrad = ctx.createRadialGradient(fx, fy, fr * 0.4, fx, fy, sr);
      smokeGrad.addColorStop(0, 'rgba(249, 115, 22, 0.35)');
      smokeGrad.addColorStop(0.6, 'rgba(234, 88, 12, 0.16)');
      smokeGrad.addColorStop(1, 'rgba(234, 88, 12, 0.0)');
      ctx.fillStyle = smokeGrad;
      ctx.beginPath();
      ctx.arc(fx, fy, sr, 0, Math.PI * 2);
      ctx.fill();

      // Inner Active Flame Front (>300°C Thermal Destruction Zone)
      const flameGrad = ctx.createRadialGradient(fx, fy, 1, fx, fy, fr);
      flameGrad.addColorStop(0, 'rgba(254, 240, 138, 0.85)');
      flameGrad.addColorStop(0.55, 'rgba(239, 68, 68, 0.65)');
      flameGrad.addColorStop(1, 'rgba(185, 28, 28, 0.15)');
      ctx.fillStyle = flameGrad;
      ctx.beginPath();
      ctx.arc(fx, fy, fr, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(251, 146, 60, 0.65)';
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 3. Render Water Bomber Fire Retardant Drops
    for (const ret of mesh.retardants) {
      const rx = ret.x * scale;
      const ry = ret.y * scale;
      const rr = ret.r * scale;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(rx, ry, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 4. Render Granite Ridges (Terrain Obstacles)
    if (mesh.config.enableTerrainObstruction) {
      for (const r of mesh.ridges) {
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 4.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(r.x1 * scale, r.y1 * scale);
        ctx.lineTo(r.x2 * scale, r.y2 * scale);
        ctx.stroke();

        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2.0;
        ctx.stroke();
      }
    }

    // 5. Render Routing Tree Edges
    for (const edge of mesh.edges) {
      const u = mesh.nodes[edge.from];
      const v = edge.to === -1 ? mesh.globalSink : mesh.nodes[edge.to];
      if (!u || !v || !u.alive || u.orphaned || (edge.to !== -1 && !v.alive)) continue;

      ctx.beginPath();
      ctx.moveTo(u.x * scale, u.y * scale);
      ctx.lineTo(v.x * scale, v.y * scale);

      if (edge.tier === 'GLOBAL') {
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
        ctx.lineWidth = 1.9;
      } else if (edge.tier === 'DOMINANT') {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = 1.3;
      } else if (edge.tier === 'CROSS_TILE') {
        ctx.strokeStyle = 'rgba(192, 132, 252, 0.65)';
        ctx.lineWidth = 1.3;
      } else {
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.15)';
        ctx.lineWidth = 0.7;
      }
      ctx.stroke();
    }

    // 6. Render Active Emergency & Routine Transmissions
    for (const tx of mesh.transmissions) {
      ctx.beginPath();
      ctx.moveTo(tx.fromX * scale, tx.fromY * scale);
      ctx.lineTo(tx.toX * scale, tx.toY * scale);
      if (tx.urgent) {
        ctx.strokeStyle = '#fb923c';
        ctx.lineWidth = 2.1;
      } else {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
        ctx.lineWidth = 1.1;
      }
      ctx.stroke();
    }

    // 7. Render Sensor Motes
    for (const u of mesh.nodes) {
      const nx = u.x * scale;
      const ny = u.y * scale;

      if (u.burned) {
        // Burned sensor (Charred X / Dark Red dot)
        ctx.fillStyle = '#7f1d1d';
        ctx.beginPath();
        ctx.arc(nx, ny, 2.2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      if (!u.alive) {
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.arc(nx, ny, 2.0, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      if (u.orphaned) {
        // Orphaned node (alive but cut off from sink because static WIRES parent burned!)
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(nx, ny, 4.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#64748b';
        ctx.beginPath();
        ctx.arc(nx, ny, 2.2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      // Highlight sensor in high-temp smoke alert zone
      if (u.inAlertZone) {
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(nx, ny, 5.2, 0, Math.PI * 2);
        ctx.stroke();
      }

      let r = 2.5;
      if (u.role === 'TILE_SINK') {
        ctx.fillStyle = '#fb923c'; // Orange Sector Hub
        r = 5.4;
      } else if (u.role === 'DOMINANT') {
        ctx.fillStyle = '#38bdf8'; // Cyan Cluster Head
        r = 3.9;
      } else {
        ctx.fillStyle = '#facc15'; // Yellow Leaf Mote
        r = 2.4;
      }

      ctx.beginPath();
      ctx.arc(nx, ny, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 8. Central Fire Command Tower at (20, 20)
    const gx = mesh.globalSink.x * scale;
    const gy = mesh.globalSink.y * scale;
    ctx.fillStyle = '#10b981';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(gx, gy, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  function renderChart(canvasId, sLcac, sWires, yMin, yMax) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
    }

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const padL = 34, padR = 8, padT = 8, padB = 16;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    ctx.clearRect(0, 0, W, H);

    const all = [...sLcac, ...sWires];
    const maxV = yMax !== null ? yMax : Math.max(10, ...all) * 1.1;
    const minV = yMin !== null ? yMin : 0;

    ctx.strokeStyle = 'rgba(38, 64, 56, 0.7)';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    for (let i = 0; i <= 3; i++) {
      const y = padT + (plotH * i) / 3;
      const val = maxV - ((maxV - minV) * i) / 3;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();
      ctx.fillText(Math.round(val).toString(), 2, y + 3);
    }

    const maxPts = Math.max(20, sLcac.length - 1);
    function drawCurve(arr, color) {
      if (arr.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      for (let i = 0; i < arr.length; i++) {
        const x = padL + (i / maxPts) * plotW;
        const norm = (arr[i] - minV) / Math.max(1e-5, maxV - minV);
        const y = padT + plotH - Math.max(0, Math.min(1, norm)) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    drawCurve(sWires, '#ef4444');
    drawCurve(sLcac, '#10b981');

    ctx.restore();
  }

  function renderAll() {
    renderForestCanvas('canvas-lcac', lcacMesh);
    renderForestCanvas('canvas-wires', wiresMesh);

    const h = state.history;
    const totalN = readConfig().nodesPerTile * 4;
    renderChart('chart-alerts', h.lcacAlerts, h.wiresAlerts, 0, null);
    renderChart('chart-functional', h.lcacFunctional, h.wiresFunctional, 0, totalN * 1.05);
    renderChart('chart-battery', h.lcacBattery, h.wiresBattery, 0, 105);
    renderChart('chart-drops', h.lcacSaved, h.wiresDropped, 0, null);
  }

  function handleMapClick(evt, mesh) {
    const canvas = evt.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / mesh.worldSize;
    const wx = (evt.clientX - rect.left) / scale;
    const wy = (evt.clientY - rect.top) / scale;

    if (state.tool === 'IGNITE') {
      const newFire = { x: wx, y: wy, flameR: 1.8, smokeR: 4.5, active: true };
      lcacMesh.fires.push({ ...newFire });
      wiresMesh.fires.push({ ...newFire });
      setBanner(`Ignited new Wildfire Front at (${wx.toFixed(1)}km, ${wy.toFixed(1)}km)! Watch DDS+LCAC dynamically re-route around the flames.`);
    } else if (state.tool === 'RETARDANT') {
      const drop = { x: wx, y: wy, r: 4.2, ttl: 25 };
      lcacMesh.retardants.push({ ...drop });
      wiresMesh.retardants.push({ ...drop });
      setBanner(`Water Bomber dropped Fire Retardant at (${wx.toFixed(1)}km, ${wy.toFixed(1)}km), cooling nearby fire fronts!`);
    } else if (state.tool === 'AIRDROP') {
      for (let i = 0; i < 15; i++) {
        const nx = Math.max(0.8, Math.min(mesh.worldSize - 0.8, wx + (Math.random() - 0.5) * 5));
        const ny = Math.max(0.8, Math.min(mesh.worldSize - 0.8, wy + (Math.random() - 0.5) * 5));
        for (const m of [lcacMesh, wiresMesh]) {
          m.nodes.push({
            id: m.nodes.length,
            x: nx,
            y: ny,
            tileId: m.getTileId(nx, ny),
            energy: m.config.initialEnergy,
            alive: true,
            burned: false,
            orphaned: false,
            inAlertZone: false,
            tempC: 24.0,
            role: 'LEAF',
            delta: 0,
            neighbors: [],
            parentId: null,
            childrenIds: []
          });
        }
      }
      lcacMesh.updateEnvironmentAndNeighborhoods();
      lcacMesh.runWildfireDDS();
      setBanner(`Air-dropped 15 replacement CanopyPulse sensor motes at (${wx.toFixed(1)}km, ${wy.toFixed(1)}km)!`);
    } else if (state.tool === 'RIDGE') {
      const ridge = {
        x1: Math.max(1, wx - 3.5),
        y1: Math.max(1, wy - 2.0),
        x2: Math.min(mesh.worldSize - 1, wx + 3.5),
        y2: Math.min(mesh.worldSize - 1, wy + 2.0)
      };
      lcacMesh.ridges.push({ ...ridge });
      wiresMesh.ridges.push({ ...ridge });
      lcacMesh.updateEnvironmentAndNeighborhoods();
      lcacMesh.runWildfireDDS();
      setBanner(`Placed Granite Canyon Ridge barrier at (${wx.toFixed(1)}km, ${wy.toFixed(1)}km).`);
    }
    renderAll();
  }

  window.addEventListener('DOMContentLoaded', () => {
    const sliders = [
      ['ctrl-nodes', 'val-nodes', ''],
      ['ctrl-radius', 'val-radius', ' km'],
      ['ctrl-delta', 'val-delta', ''],
      ['ctrl-wind-speed', 'val-wind-speed', ' km/h'],
      ['ctrl-wind-dir', 'val-wind-dir', '°'],
      ['ctrl-spread', 'val-spread', 'x']
    ];

    for (const [id, lblId, suffix] of sliders) {
      const el = document.getElementById(id);
      const lbl = document.getElementById(lblId);
      if (el && lbl) {
        el.addEventListener('input', () => {
          lbl.textContent = el.value + suffix;
        });
      }
    }

    document.getElementById('btn-reset').addEventListener('click', resetSimulation);
    document.getElementById('btn-run').addEventListener('click', () => {
      if (state.running) stopSim();
      else startSim();
    });
    document.getElementById('btn-step').addEventListener('click', () => {
      stopSim();
      stepOnce();
    });

    document.querySelectorAll('[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.tool = btn.getAttribute('data-tool');
      });
    });

    document.querySelectorAll('[data-scenario]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.scenario = btn.getAttribute('data-scenario');
        resetSimulation();
      });
    });

    document.getElementById('canvas-lcac').addEventListener('click', e => handleMapClick(e, lcacMesh));
    document.getElementById('canvas-wires').addEventListener('click', e => handleMapClick(e, wiresMesh));

    window.addEventListener('resize', renderAll);
    resetSimulation();
  });
})();
