/**
 * Interactive UI Controller, Canvas Renderer & Live Chart Plotter
 * For Muhuji Mshana's 2012 Master's Thesis Simulator (DDS + LCAC vs. WIRES)
 */

(function () {
  const state = {
    running: false,
    timerId: null,
    activeStageFilter: 0, // 0 = show all, 1..5 highlights specific stage
    godTool: 'INSPECT',   // 'INSPECT', 'JAMMER', 'DRAIN', 'AIRDROP'
    inspectedNodeId: 0,
    history: {
      rounds: [],
      lcacEnergy: [],
      wiresEnergy: [],
      lcacAlive: [],
      wiresAlive: [],
      lcacTx: [],
      wiresTx: [],
      lcacCollisionAvoided: [],
      wiresCollisions: []
    }
  };

  function readConfigFromUI() {
    return {
      tileSize: parseInt(document.getElementById('ctrl-tile-size').value, 10),
      nodesPerTile: parseInt(document.getElementById('ctrl-nodes-per-tile').value, 10),
      neighborRadius: parseFloat(document.getElementById('ctrl-neighbor-radius').value),
      initialEnergy: parseFloat(document.getElementById('ctrl-initial-energy').value),
      energyPerTransmission: parseFloat(document.getElementById('ctrl-tx-energy').value),
      dominantEnergyThreshold: parseFloat(document.getElementById('ctrl-dom-energy').value),
      aliveEnergyThreshold: parseFloat(document.getElementById('ctrl-alive-energy').value),
      minDelta: parseInt(document.getElementById('ctrl-min-delta').value, 10),
      transmissionFactor: parseFloat(document.getElementById('ctrl-tx-factor').value),
      dominantPerNeighborhood: parseInt(document.getElementById('ctrl-dom-neighborhood').value, 10),
      enableCrossTile: document.getElementById('chk-cross-tile').checked,
      enableMobility: document.getElementById('chk-mobility').checked,
      enableSINR: document.getElementById('chk-sinr').checked
    };
  }

  let lcacSim = null;
  let wiresSim = null;

  function generateSharedPositions(config) {
    const ts = config.tileSize;
    const maxPerTile = Math.min(config.nodesPerTile, ts * ts);
    const positions = [];
    for (let t = 0; t < 4; t++) {
      const colOffset = (t % 2) * ts;
      const rowOffset = Math.floor(t / 2) * ts;
      for (let i = 0; i < maxPerTile; i++) {
        positions.push({
          x: colOffset + 0.6 + Math.random() * (ts - 1.2),
          y: rowOffset + 0.6 + Math.random() * (ts - 1.2),
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.22
        });
      }
    }
    return positions;
  }

  function setupSimulation() {
    stopSimulation();
    const cfg = readConfigFromUI();
    const sharedPos = generateSharedPositions(cfg);

    lcacSim = new window.WSNNetworkInstance('LCAC', cfg);
    wiresSim = new window.WSNNetworkInstance('WIRES', cfg);

    lcacSim.initFromPositions(sharedPos, cfg);
    wiresSim.initFromPositions(sharedPos, cfg);

    state.history = {
      rounds: [0],
      lcacEnergy: [cfg.initialEnergy],
      wiresEnergy: [cfg.initialEnergy],
      lcacAlive: [sharedPos.length],
      wiresAlive: [sharedPos.length],
      lcacTx: [0],
      wiresTx: [0],
      lcacCollisionAvoided: [0],
      wiresCollisions: [0]
    };

    updateKPIs();
    renderAll();
    setStatusBanner(
      `SETUP complete: Deployed ${sharedPos.length} total sensor nodes across 4 tiles (${cfg.nodesPerTile} nodes/tile, r=${cfg.neighborRadius}, min_Delta=${cfg.minDelta}). Ready to SIMULATE.`
    );
  }

  function stepOnce() {
    if (!lcacSim || !wiresSim) setupSimulation();
    const cfg = readConfigFromUI();
    Object.assign(lcacSim.config, cfg);
    Object.assign(wiresSim.config, cfg);

    const mLcac = lcacSim.stepRound();
    const mWires = wiresSim.stepRound();

    state.history.rounds.push(mLcac.round);
    state.history.lcacEnergy.push(mLcac.avgResidualEnergy);
    state.history.wiresEnergy.push(mWires.avgResidualEnergy);
    state.history.lcacAlive.push(mLcac.aliveNodes);
    state.history.wiresAlive.push(mWires.aliveNodes);
    state.history.lcacTx.push(mLcac.transmittedNodes);
    state.history.wiresTx.push(mWires.transmittedNodes);
    state.history.lcacCollisionAvoided.push(mLcac.collisionMetric);
    state.history.wiresCollisions.push(mWires.collisionMetric);

    updateKPIs();
    renderAll();

    if (mLcac.aliveNodes === 0 && mWires.aliveNodes === 0) {
      stopSimulation();
      setStatusBanner(`Simulation finished at Round ${mLcac.round}: All nodes exhausted residual energy.`);
    }
  }

  function startSimulation() {
    if (state.running) return;
    state.running = true;
    const btnSim = document.getElementById('btn-simulate');
    btnSim.textContent = '⏸ PAUSE SIMULATE';
    btnSim.classList.replace('btn-primary', 'btn-warning');

    state.timerId = setInterval(() => {
      stepOnce();
      if (lcacSim.round >= 200 && state.history.rounds.length === 201) {
        setStatusBanner(
          `Reached 200 Convergecast Rounds (2012 Thesis benchmark horizon)! DDS+LCAC Alive: ${lcacSim.nodes.filter(n => n.alive).length} vs. WIRES Alive: ${wiresSim.nodes.filter(n => n.alive).length}.`
        );
      }
    }, 95);
  }

  function stopSimulation() {
    state.running = false;
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
    const btnSim = document.getElementById('btn-simulate');
    if (btnSim) {
      btnSim.textContent = '▶ SIMULATE (CONTINUOUS)';
      btnSim.classList.replace('btn-warning', 'btn-primary');
    }
  }

  function toggleSimulation() {
    if (state.running) stopSimulation();
    else startSimulation();
  }

  function updateKPIs() {
    const h = state.history;
    const idx = h.rounds.length - 1;
    document.getElementById('kpi-round').textContent = h.rounds[idx];
    document.getElementById('kpi-lcac-energy').textContent = `${h.lcacEnergy[idx].toFixed(0)} / ${h.wiresEnergy[idx].toFixed(0)}`;
    document.getElementById('kpi-lcac-alive').textContent = `${h.lcacAlive[idx]} / ${h.wiresAlive[idx]}`;
    document.getElementById('kpi-lcac-avoided').textContent = `${h.lcacCollisionAvoided[idx]} saved / ${h.wiresCollisions[idx]} hit`;
  }

  function setStatusBanner(msg) {
    const el = document.getElementById('status-banner');
    if (el) el.textContent = msg;
  }

  // Render Network Canvas (Matches NetLogo 4-Tile Visual Convention + Modern HUD)
  function renderNetworkCanvas(canvasId, sim) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !sim) return;
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
    const scale = W / sim.worldSize;
    const halfW = W / 2;
    const halfH = H / 2;

    // 1. Draw 4-Tile Checkerboard Background (Thesis Figure 10: alternating dark/slate tiles)
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, halfW, halfH);
    ctx.fillRect(halfW, halfH, halfW, halfH);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(halfW, 0, halfW, halfH);
    ctx.fillRect(0, halfH, halfW, halfH);

    // Tile grid divider lines
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(halfW, 0);
    ctx.lineTo(halfW, H);
    ctx.moveTo(0, halfH);
    ctx.lineTo(W, halfH);
    ctx.stroke();

    // Tile Labels T1..T4
    ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.font = '600 10px Inter, sans-serif';
    ctx.fillText('TILE T1', 8, 14);
    ctx.fillText('TILE T2', halfW + 8, 14);
    ctx.fillText('TILE T3', 8, halfH + 14);
    ctx.fillText('TILE T4', halfW + 8, halfH + 14);

    // 2. Draw Active RF Jammers (Future Work #1 SINR)
    if (sim.config.enableSINR && sim.jammers.length > 0) {
      for (const jam of sim.jammers) {
        const jx = jam.x * scale;
        const jy = jam.y * scale;
        const jr = jam.radius * scale;
        const grad = ctx.createRadialGradient(jx, jy, 2, jx, jy, jr);
        grad.addColorStop(0, 'rgba(239, 68, 68, 0.38)');
        grad.addColorStop(1, 'rgba(239, 68, 68, 0.03)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(jx, jy, jr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 3. Highlight Inspected Node's UDG Transmission Zone (Thesis Figure 9)
    const inspected = sim.nodes[state.inspectedNodeId];
    if (inspected && inspected.alive) {
      const ix = inspected.x * scale;
      const iy = inspected.y * scale;
      const ir = sim.config.neighborRadius * scale;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.09)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ix, iy, ir, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 4. Draw DDS / WIRES Tree Edges
    if (state.activeStageFilter !== 1) {
      for (const edge of sim.edges) {
        const u = sim.nodes[edge.from];
        const v = edge.to === -1 ? sim.globalSink : sim.nodes[edge.to];
        if (!u || !v || !u.alive || (edge.to !== -1 && !v.alive)) continue;

        ctx.beginPath();
        ctx.moveTo(u.x * scale, u.y * scale);
        ctx.lineTo(v.x * scale, v.y * scale);

        if (edge.tier === 'GLOBAL') {
          ctx.strokeStyle = 'rgba(34, 197, 94, 0.55)';
          ctx.lineWidth = 1.8;
        } else if (edge.tier === 'DOMINANT') {
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
          ctx.lineWidth = 1.3;
        } else if (edge.tier === 'CROSS_TILE') {
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.55)';
          ctx.lineWidth = 1.2;
        } else {
          ctx.strokeStyle = 'rgba(250, 204, 21, 0.16)';
          ctx.lineWidth = 0.75;
        }
        ctx.stroke();
      }
    }

    // 5. Draw Active Packet Transmissions This Round
    if (state.activeStageFilter === 0 || state.activeStageFilter === 3 || state.activeStageFilter === 4) {
      for (const tx of sim.transmissions) {
        ctx.beginPath();
        ctx.moveTo(tx.fromX * scale, tx.fromY * scale);
        ctx.lineTo(tx.toX * scale, tx.toY * scale);
        if (tx.tier === 'GLOBAL') {
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 2.4;
        } else if (tx.tier === 'DOMINANT') {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.8;
        } else {
          ctx.strokeStyle = 'rgba(250, 204, 21, 0.65)';
          ctx.lineWidth = 1.1;
        }
        ctx.stroke();
      }
    }

    // 6. Draw Sensor Nodes (NetLogo Color Code: Yellow Leaf, Blue Dominant, Orange Tile Sink, Green Global Sink)
    for (const u of sim.nodes) {
      const nx = u.x * scale;
      const ny = u.y * scale;

      if (!u.alive) {
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.arc(nx, ny, 2.0, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      // Draw Red Ring if node avoided collision via Semaphore (LCAC) or suffered collision (WIRES)
      if ((state.activeStageFilter === 0 || state.activeStageFilter === 3) &&
          (u.avoidedCollision || u.sufferedCollision)) {
        ctx.strokeStyle = u.avoidedCollision ? 'rgba(239, 68, 68, 0.75)' : '#ef4444';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(nx, ny, 5.2, 0, Math.PI * 2);
        ctx.stroke();
      }

      let radius = 2.6;
      if (u.role === 'TILE_SINK') {
        ctx.fillStyle = '#fb923c'; // Orange Tile Sink
        radius = 5.2;
      } else if (u.role === 'DOMINANT') {
        ctx.fillStyle = '#38bdf8'; // Blue Dominant
        radius = 3.8;
      } else {
        ctx.fillStyle = '#facc15'; // Yellow Leaf Sensor
        radius = 2.4;
      }

      ctx.beginPath();
      ctx.arc(nx, ny, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 7. Draw Global Sink at (0,0) center of plane (Green Node, Section 6.2.1)
    const gx = sim.globalSink.x * scale;
    const gy = sim.globalSink.y * scale;
    ctx.fillStyle = '#22c55e';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(gx, gy, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  // Render Live Time-Series Line Charts (Matching Thesis Figures 14-22 a, b, c, d)
  function renderChart(canvasId, seriesLCAC, seriesWIRES, yMinFixed, yMaxFixed) {
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
    const padL = 34;
    const padR = 8;
    const padT = 8;
    const padB = 18;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    ctx.clearRect(0, 0, W, H);

    const allVals = [...seriesLCAC, ...seriesWIRES];
    const maxVal = yMaxFixed !== null ? yMaxFixed : Math.max(10, ...allVals) * 1.08;
    const minVal = yMinFixed !== null ? yMinFixed : 0;

    // Horizontal grid lines
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.6)';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = padT + (plotH * i) / 3;
      const val = maxVal - ((maxVal - minVal) * i) / 3;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();
      ctx.fillText(Math.round(val).toString(), 2, y + 3);
    }

    const maxPoints = Math.max(20, seriesLCAC.length - 1);

    function drawLine(data, color) {
      if (data.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const x = padL + (i / maxPoints) * plotW;
        const norm = (data[i] - minVal) / Math.max(1e-5, maxVal - minVal);
        const y = padT + plotH - Math.max(0, Math.min(1, norm)) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    drawLine(seriesWIRES, '#f43f5e'); // WIRES in Rose/Red
    drawLine(seriesLCAC, '#38bdf8');  // DDS + LCAC in Cyan

    ctx.restore();
  }

  function renderAll() {
    renderNetworkCanvas('canvas-lcac', lcacSim);
    renderNetworkCanvas('canvas-wires', wiresSim);

    const h = state.history;
    const cfg = readConfigFromUI();
    renderChart('chart-energy', h.lcacEnergy, h.wiresEnergy, 0, cfg.initialEnergy * 1.05);
    renderChart('chart-alive', h.lcacAlive, h.wiresAlive, 0, cfg.nodesPerTile * 4 * 1.05);
    renderChart('chart-tx', h.lcacTx, h.wiresTx, 0, null);
    renderChart('chart-collision', h.lcacCollisionAvoided, h.wiresCollisions, 0, null);
  }

  // Handle God Mode Canvas Clicks (Inspect, RF Jammer, Drain Battery, Air-Drop Nodes)
  function handleCanvasClick(evt, sim) {
    const canvas = evt.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / sim.worldSize;
    const wx = (evt.clientX - rect.left) / scale;
    const wy = (evt.clientY - rect.top) / scale;

    if (state.godTool === 'JAMMER') {
      document.getElementById('chk-sinr').checked = true;
      lcacSim.config.enableSINR = true;
      wiresSim.config.enableSINR = true;
      const jam = { x: wx, y: wy, radius: sim.config.neighborRadius * 1.35 };
      lcacSim.jammers.push(jam);
      wiresSim.jammers.push(jam);
      setStatusBanner(`God Mode: Placed SINR RF Jammer at (${wx.toFixed(1)}, ${wy.toFixed(1)}). Watch DDS route around jammed nodes!`);
    } else if (state.godTool === 'DRAIN') {
      let drained = 0;
      for (const s of [lcacSim, wiresSim]) {
        for (const u of s.nodes) {
          if (s.dist(u, { x: wx, y: wy }) <= s.config.neighborRadius) {
            u.energy = Math.max(0, u.energy - 550);
            if (u.energy <= s.config.aliveEnergyThreshold) {
              u.alive = false;
              u.role = 'DEAD';
            }
            drained++;
          }
        }
      }
      setStatusBanner(`God Mode: Drained battery from ${Math.floor(drained / 2)} sensors near (${wx.toFixed(1)}, ${wy.toFixed(1)}). DDS will promote fresh dominants next round!`);
    } else if (state.godTool === 'AIRDROP') {
      for (let i = 0; i < 12; i++) {
        const nx = Math.max(0.5, Math.min(sim.worldSize - 0.5, wx + (Math.random() - 0.5) * 4));
        const ny = Math.max(0.5, Math.min(sim.worldSize - 0.5, wy + (Math.random() - 0.5) * 4));
        for (const s of [lcacSim, wiresSim]) {
          s.nodes.push({
            id: s.nodes.length,
            x: nx,
            y: ny,
            vx: (Math.random() - 0.5) * 0.2,
            vy: (Math.random() - 0.5) * 0.2,
            tileId: s.getTileId(nx, ny, s.config.tileSize),
            energy: s.config.initialEnergy,
            alive: true,
            role: 'LEAF',
            delta: 0,
            neighbors: [],
            parentId: null,
            childrenIds: []
          });
        }
      }
      lcacSim.computeNeighborhoods();
      lcacSim.runDDSAlgorithm();
      setStatusBanner(`God Mode: Air-dropped 12 fresh sensor nodes at (${wx.toFixed(1)}, ${wy.toFixed(1)})!`);
    } else {
      // Inspect nearest node
      let nearest = sim.nodes[0];
      let bestD = Infinity;
      for (const u of sim.nodes) {
        const d = sim.dist(u, { x: wx, y: wy });
        if (d < bestD) {
          bestD = d;
          nearest = u;
        }
      }
      if (nearest) {
        state.inspectedNodeId = nearest.id;
        setStatusBanner(
          `Inspected Node #${nearest.id} (Tile T${nearest.tileId + 1}): Role=${nearest.role} | Residual Energy E=${nearest.energy.toFixed(0)} | Degree Δ=${nearest.delta} | Parent=${nearest.parentId}`
        );
      }
    }
    renderAll();
  }

  // Apply 2012 Thesis Table Presets
  function applyPreset(presetKey) {
    const presets = {
      'T2_100': { nodesPerTile: 100, neighborRadius: 4, minDelta: 5, label: 'Table 2 Test 1 (Low Density TDMA: 100 nodes/tile, r=4)' },
      'T2_200': { nodesPerTile: 200, neighborRadius: 4, minDelta: 5, label: 'Table 2 Test 3 (Med Density TDMA: 200 nodes/tile, r=4)' },
      'T2_250': { nodesPerTile: 250, neighborRadius: 4, minDelta: 5, label: 'Table 2 Test 4 (High Density TDMA: 250 nodes/tile, r=4)' },
      'T3_R2':  { nodesPerTile: 200, neighborRadius: 2, minDelta: 4, label: 'Table 3 Test 1 (Neighbor Degree r=2, min_Delta=4)' },
      'T3_R5':  { nodesPerTile: 200, neighborRadius: 5, minDelta: 6, label: 'Table 3 Test 4 (Neighbor Degree r=5, min_Delta=6)' },
      'T3_R6':  { nodesPerTile: 200, neighborRadius: 6, minDelta: 6, label: 'Table 3 Test 5 (Dense Neighborhood r=6, min_Delta=6)' }
    };
    const p = presets[presetKey];
    if (!p) return;

    document.getElementById('ctrl-nodes-per-tile').value = p.nodesPerTile;
    document.getElementById('val-nodes-per-tile').textContent = p.nodesPerTile;
    document.getElementById('ctrl-neighbor-radius').value = p.neighborRadius;
    document.getElementById('val-neighbor-radius').textContent = p.neighborRadius;
    document.getElementById('ctrl-min-delta').value = p.minDelta;
    document.getElementById('val-min-delta').textContent = p.minDelta;

    setupSimulation();
    setStatusBanner(`Loaded 2012 Thesis Preset: ${p.label}`);
  }

  // Export CSV Telemetry
  function exportCSV() {
    const h = state.history;
    let csv = 'Round,LCAC_Avg_Energy,WIRES_Avg_Energy,LCAC_Alive_Nodes,WIRES_Alive_Nodes,LCAC_Transmitted,WIRES_Transmitted,LCAC_Collisions_Avoided,WIRES_Collisions\n';
    for (let i = 0; i < h.rounds.length; i++) {
      csv += `${h.rounds[i]},${h.lcacEnergy[i].toFixed(2)},${h.wiresEnergy[i].toFixed(2)},${h.lcacAlive[i]},${h.wiresAlive[i]},${h.lcacTx[i]},${h.wiresTx[i]},${h.lcacCollisionAvoided[i]},${h.wiresCollisions[i]}\n`;
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dds_lcac_vs_wires_telemetry_r${h.rounds.length - 1}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  window.addEventListener('DOMContentLoaded', () => {
    // Bind slider value labels
    const sliders = [
      ['ctrl-tile-size', 'val-tile-size'],
      ['ctrl-nodes-per-tile', 'val-nodes-per-tile'],
      ['ctrl-neighbor-radius', 'val-neighbor-radius'],
      ['ctrl-dom-energy', 'val-dom-energy'],
      ['ctrl-alive-energy', 'val-alive-energy'],
      ['ctrl-min-delta', 'val-min-delta'],
      ['ctrl-tx-factor', 'val-tx-factor'],
      ['ctrl-dom-neighborhood', 'val-dom-neighborhood']
    ];

    for (const [inputId, labelId] of sliders) {
      const el = document.getElementById(inputId);
      const lbl = document.getElementById(labelId);
      if (el && lbl) {
        el.addEventListener('input', () => {
          lbl.textContent = el.value;
        });
      }
    }

    document.getElementById('btn-setup').addEventListener('click', setupSimulation);
    document.getElementById('btn-simulate').addEventListener('click', toggleSimulation);
    document.getElementById('btn-step').addEventListener('click', () => {
      stopSimulation();
      stepOnce();
    });
    document.getElementById('btn-export-csv').addEventListener('click', exportCSV);

    // Preset buttons
    document.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => applyPreset(btn.getAttribute('data-preset')));
    });

    // God mode tool buttons
    document.querySelectorAll('[data-godtool]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-godtool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.godTool = btn.getAttribute('data-godtool');
      });
    });

    // 5-Stage Stepper pills
    document.querySelectorAll('[data-stage]').forEach(pill => {
      pill.addEventListener('click', () => {
        const s = parseInt(pill.getAttribute('data-stage'), 10);
        state.activeStageFilter = state.activeStageFilter === s ? 0 : s;
        document.querySelectorAll('[data-stage]').forEach(p => {
          p.classList.toggle('active', parseInt(p.getAttribute('data-stage'), 10) === state.activeStageFilter);
        });
        renderAll();
      });
    });

    // Canvas click listeners
    document.getElementById('canvas-lcac').addEventListener('click', e => handleCanvasClick(e, lcacSim));
    document.getElementById('canvas-wires').addEventListener('click', e => handleCanvasClick(e, wiresSim));

    window.addEventListener('resize', renderAll);

    setupSimulation();
  });
})();
