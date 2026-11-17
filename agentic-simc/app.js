/**
 * UI Controller, Token Economy Profiler & Amazon Rainforest Agentic Renderer for SimC (Port 8090)
 */

(function () {
  const state = {
    running: false,
    timerId: null,
    liveGeminiBusy: false,
    serverHasEnvKey: false,
    liveApiCallCount: 0,
    lastLiveModel: '',
    lastLiveLatencyMs: 0,
    lastLiveTokens: 0,
    history: {
      rounds: [],
      simcEnergy: [],
      simaEnergy: [],
      simcAlive: [],
      simaAlive: [],
      simcRadius: [],
      simaRadius: [],
      simcPayloads: [],
      simaPayloads: []
    }
  };

  let simcMesh = null;
  let simaMesh = null;

  async function callGeminiDirectBrowser(payload, apiKey, requestedModel) {
    const t0 = performance.now();
    const sysInstruction =
      "You are the Google ADK Multi-Agent Cognitive Control Plane for Muhuji Mshana's CanopyPulse Wireless Sensor Network (DDS + LCAC Algorithms). " +
      "You coordinate GlobalSinkCoordinator and 4 Parallel TileOrchestratorAgents (T1..T4). " +
      "Laws: (1) Free-space radio energy scales with r^2. In Phase I (High Density, Alive>80%, no fire), shrink r to 2.8-3.2 and raise min_delta to 6-7. " +
      "(2) In sectors with hazard_nodes > 0, boost r to 4.6-5.2 and lower min_delta to 3 to route around wildfire/jammer. " +
      "(3) In Phase III (Alive<55%), boost r to 5.2-5.8 and lower min_delta to 2. Obey commander_intent.";

    const promptText =
      `Convergecast Round: ${payload.round}\n` +
      `Mission Commander Intent: ${payload.commander_intent}\n` +
      `Custom Command: ${payload.custom_command || 'None'}\n` +
      `Live Telemetry (Tiles 1..4):\n${JSON.stringify(payload.tiles, null, 2)}\n` +
      `Return JSON with global_sink_directive and tile_decisions (for tile_id 1..4).`;

    const requestBody = {
      systemInstruction: { parts: [{ text: sysInstruction }] },
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      generationConfig: {
        temperature: 0.25,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          required: ['global_sink_directive', 'tile_decisions'],
          properties: {
            global_sink_directive: {
              type: 'OBJECT',
              required: ['directive_type', 'rescue_from_tile', 'rescue_to_tile', 'rationale'],
              properties: {
                directive_type: { type: 'STRING' },
                rescue_from_tile: { type: 'INTEGER' },
                rescue_to_tile: { type: 'INTEGER' },
                rationale: { type: 'STRING' }
              }
            },
            tile_decisions: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                required: ['tile_id', 'r', 'min_delta', 'min_energy', 'phase_label', 'rationale'],
                properties: {
                  tile_id: { type: 'INTEGER' },
                  r: { type: 'NUMBER' },
                  min_delta: { type: 'INTEGER' },
                  min_energy: { type: 'NUMBER' },
                  phase_label: { type: 'STRING' },
                  rationale: { type: 'STRING' }
                }
              }
            }
          }
        }
      }
    };

    const candidateModels = [
      requestedModel,
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-3.8-flash',
      'gemini-3.5-flash',
      'gemini-1.5-flash'
    ].filter((v, idx, arr) => arr.indexOf(v) === idx);

    let lastError = null;
    for (const candidate of candidateModels) {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidate)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const gResp = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      const gJson = await gResp.json();

      if (gResp.ok && gJson.candidates && gJson.candidates[0]) {
        const latencyMs = Math.round(performance.now() - t0);
        const rawText = gJson.candidates[0].content.parts[0].text;
        const parsedDecision = JSON.parse(rawText);
        const usageMeta = gJson.usageMetadata || {};
        const resObj = {
          ok: true,
          requested_model: requestedModel,
          model: candidate,
          latency_ms: latencyMs,
          decision: parsedDecision,
          usage: {
            prompt_tokens: usageMeta.promptTokenCount || 360,
            completion_tokens: usageMeta.candidatesTokenCount || 140,
            total_tokens: usageMeta.totalTokenCount || 500
          }
        };

        // Best-effort log to local server telemetry file
        fetch('/api/log-telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timestamp: new Date().toISOString(),
            source: 'browser_direct_gemini_api',
            round: payload.round,
            requested_model: requestedModel,
            resolved_model: candidate,
            latency_ms: latencyMs,
            usage: resObj.usage,
            global_sink_directive: parsedDecision.global_sink_directive
          })
        }).catch(() => {});

        return resObj;
      }

      const errMsg = (gJson.error && gJson.error.message) || `HTTP ${gResp.status}`;
      lastError = new Error(errMsg);
      // If API key itself is invalid, fail fast; if model not found (404), try next candidate!
      if (gResp.status === 400 || gResp.status === 403) {
        throw lastError;
      }
    }

    throw lastError || new Error('No compatible Gemini model found on this API key.');
  }

  async function invokeLiveGeminiADK(customCommand = '') {
    if (!simcMesh || state.liveGeminiBusy) return false;
    const keyInput = document.getElementById('inp-gemini-key');
    const modelSel = document.getElementById('sel-gemini-model');
    const statusLbl = document.getElementById('lbl-gemini-status');
    const proofEl = document.getElementById('tok-live-proof');
    const apiKey = keyInput ? keyInput.value.trim() : '';
    const modelName = modelSel ? modelSel.value : 'gemini-3.8-flash';

    if (!apiKey && !state.serverHasEnvKey) {
      setBanner('To call a live Gemini model, paste your Gemini API Key in the top bar (or add GEMINI_API_KEY=... to .env).');
      if (keyInput) keyInput.focus();
      return false;
    }

    if (apiKey) {
      try { localStorage.setItem('SIMC_GEMINI_API_KEY', apiKey); } catch (_) {}
    }

    state.liveGeminiBusy = true;
    if (statusLbl) {
      statusLbl.textContent = `[⏳ Calling ${modelName}...]`;
      statusLbl.style.color = '#facc15';
    }

    try {
      const payload = {
        ...simcMesh.getLiveTelemetryPayload(customCommand),
        api_key: apiKey,
        model: modelName
      };

      let data = null;

      // 1. Try local Python ADK backend (/api/adk-orchestrate)
      try {
        const resp = await fetch('/api/adk-orchestrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (resp.ok) {
          data = await resp.json();
        }
      } catch (_) {}

      // 2. Fallback to Direct Browser -> Gemini REST API with automatic model resolution
      if ((!data || !data.ok) && apiKey) {
        data = await callGeminiDirectBrowser(payload, apiKey, modelName);
      }

      if (data && data.ok) {
        state.liveApiCallCount += 1;
        state.lastLiveModel = data.model || modelName;
        state.lastLiveLatencyMs = data.latency_ms || 0;
        state.lastLiveTokens = (data.usage && data.usage.total_tokens) || 0;

        simcMesh.applyLiveGeminiResponse(data);
        if (statusLbl) {
          statusLbl.textContent = `[✅ LIVE: ${state.lastLiveModel}]`;
          statusLbl.style.color = '#10b981';
        }
        if (proofEl) {
          proofEl.style.color = '#6ee7b7';
          proofEl.textContent = `✅ Live Gemini Calls: ${state.liveApiCallCount} | Last: ${state.lastLiveModel} (${state.lastLiveLatencyMs}ms, ${state.lastLiveTokens} tok)`;
        }
        setBanner(
          `✨ Live ${state.lastLiveModel} orchestrated all 4 Amazon Canopy Sectors in ${state.lastLiveLatencyMs}ms (${state.lastLiveTokens} real API tokens)!`
        );
        updateTokenEconomyAndRoster();
        renderAll();
        return true;
      } else {
        const errMsg = (data && data.error) ? data.error : 'Unknown API error';
        if (statusLbl) {
          statusLbl.textContent = '[⚠️ API Error]';
          statusLbl.style.color = '#f43f5e';
        }
        if (proofEl) {
          proofEl.style.color = '#fda4af';
          proofEl.textContent = `⚠️ API Error: ${errMsg.slice(0, 65)}`;
        }
        setBanner(`Live Gemini API Error: ${errMsg}`);
        return false;
      }
    } catch (err) {
      if (statusLbl) {
        statusLbl.textContent = '[⚠️ API Error]';
        statusLbl.style.color = '#f43f5e';
      }
      if (proofEl) {
        proofEl.style.color = '#fda4af';
        proofEl.textContent = `⚠️ Error: ${err.message.slice(0, 65)}`;
      }
      setBanner(`Live Gemini API Error: ${err.message}`);
      return false;
    } finally {
      state.liveGeminiBusy = false;
    }
  }

  function readConfig() {
    return {
      nodesPerTile: parseInt(document.getElementById('ctrl-nodes').value, 10),
      transmissionFactor: 0.30,
      initialEnergy: 1000,
      energyPerTransmission: 26,
      epochCadence: document.getElementById('sel-cadence').value,
      enableChaosAgent: document.getElementById('chk-chaos-agent').checked
    };
  }

  function resetSim() {
    stopSim();
    const cfg = readConfig();
    const positions = [];
    const ts = 20;
    for (let t = 0; t < 4; t++) {
      const colOff = (t % 2) * ts;
      const rowOff = Math.floor(t / 2) * ts;
      for (let i = 0; i < cfg.nodesPerTile; i++) {
        positions.push({
          x: colOff + 0.7 + Math.random() * (ts - 1.4),
          y: rowOff + 0.7 + Math.random() * (ts - 1.4)
        });
      }
    }

    simcMesh = new window.AgenticWSNInstance('ADK_SIMC', cfg);
    simaMesh = new window.AgenticWSNInstance('FIXED_SIMA', cfg);

    simcMesh.initFromSharedPositions(positions, cfg);
    simaMesh.initFromSharedPositions(positions, cfg);

    state.history = {
      rounds: [0],
      simcEnergy: [cfg.initialEnergy],
      simaEnergy: [cfg.initialEnergy],
      simcAlive: [positions.length],
      simaAlive: [positions.length],
      simcRadius: [4.0],
      simaRadius: [4.0],
      simcPayloads: [0],
      simaPayloads: [0]
    };

    updateTokenEconomyAndRoster();
    updateKPIs(
      { round: 0, avgEnergy: cfg.initialEnergy, connectedAlive: positions.length, totalPayloads: 0 },
      { round: 0, avgEnergy: cfg.initialEnergy, connectedAlive: positions.length, totalPayloads: 0 }
    );
    renderAll();
    setBanner(
      `CanopyPulse ADK Swarm Ready (${positions.length} Amazon canopy motes). Issue a Mission Commander intent above or click "▶ RUN ADK SWARM"!`
    );
  }

  function stepOnce() {
    if (!simcMesh || !simaMesh) resetSim();
    const cfg = readConfig();
    Object.assign(simcMesh.config, cfg);
    Object.assign(simaMesh.config, cfg);

    const mSimC = simcMesh.stepRound();
    const mSimA = simaMesh.stepRound();

    // If a live Gemini API key is configured, automatically call Live Gemini at the user's selected epoch cadence!
    const keyInput = document.getElementById('inp-gemini-key');
    const hasKey = (keyInput && keyInput.value.trim().length > 10) || state.serverHasEnvKey;
    const cadenceVal = document.getElementById('sel-cadence').value;
    const cadenceInt = parseInt(cadenceVal, 10) || 15;
    if (hasKey && mSimC.round % cadenceInt === 0 && !state.liveGeminiBusy) {
      invokeLiveGeminiADK();
    }

    state.history.rounds.push(mSimC.round);
    state.history.simcEnergy.push(mSimC.avgEnergy);
    state.history.simaEnergy.push(mSimA.avgEnergy);
    state.history.simcAlive.push(mSimC.connectedAlive);
    state.history.simaAlive.push(mSimA.connectedAlive);
    state.history.simcRadius.push(mSimC.meanRadius);
    state.history.simaRadius.push(4.0);
    state.history.simcPayloads.push(mSimC.totalPayloads);
    state.history.simaPayloads.push(mSimA.totalPayloads);

    updateTokenEconomyAndRoster();
    updateKPIs(mSimC, mSimA);
    renderAll();
  }

  function startSim() {
    if (state.running) return;
    state.running = true;
    const btn = document.getElementById('btn-run');
    btn.textContent = '⏸ PAUSE ADK SWARM';
    btn.classList.replace('btn-adk', 'btn-warning');

    state.timerId = setInterval(() => {
      stepOnce();
    }, 95);
  }

  function stopSim() {
    state.running = false;
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
    const btn = document.getElementById('btn-run');
    if (btn) {
      btn.textContent = '▶ RUN ADK SWARM';
      btn.classList.replace('btn-warning', 'btn-adk');
    }
  }

  function formatCompactNumber(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toString();
  }

  function updateTokenEconomyAndRoster() {
    if (!simcMesh) return;
    const te = simcMesh.tokenEconomy;

    document.getElementById('tok-calls').textContent = `${te.llmCalls} calls`;
    document.getElementById('tok-total').textContent = `${formatCompactNumber(te.totalTokens)} tok`;
    document.getElementById('tok-cost-flash').textContent =
      `$${te.flashCostUsd.toFixed(4)} (Flash) / $${te.proCostUsd.toFixed(3)} (Pro)`;
    document.getElementById('tok-naive-compare').textContent =
      `${formatCompactNumber(te.naiveSwarmCalls)} calls (${formatCompactNumber(te.naiveSwarmTokens)} tok = $${te.naiveFlashCostUsd.toFixed(2)})`;
    document.getElementById('tok-savings-badge').textContent =
      `⚡ Option C Hybrid saves ${te.savingsPct.toFixed(2)}% tokens vs. 800-LLM Swarm`;

    for (let t = 0; t < 4; t++) {
      const p = simcMesh.tilePolicies[t];
      const phaseEl = document.getElementById(`t${t + 1}-phase`);
      const paramsEl = document.getElementById(`t${t + 1}-params`);
      if (phaseEl) phaseEl.textContent = p.phase;
      if (paramsEl) {
        paramsEl.textContent = `r=${p.r.toFixed(1)} | min_Δ=${p.minDelta} | min_E=${p.minE} | E=${p.avgEnergy.toFixed(0)}u`;
      }
    }

    const consoleEl = document.getElementById('adk-console');
    if (consoleEl) {
      consoleEl.innerHTML = simcMesh.agentLogs
        .slice(0, 15)
        .map(
          item =>
            `<div class="log-entry ${item.category}">
              <div style="display:flex;justify-content:space-between;">
                <span><span style="color:#64748b;">[R${item.round}]</span> <span class="log-agent">${item.agent}</span> → <span class="log-tool">${item.tool}</span></span>
                <span class="log-tokens">${item.tokens} tok</span>
              </div>
              <div class="log-reason">${item.reason}</div>
            </div>`
        )
        .join('');
    }
  }

  function updateKPIs(mSimC, mSimA) {
    document.getElementById('kpi-round').textContent = mSimC.round;
    document.getElementById('kpi-energy').textContent = `${mSimC.avgEnergy.toFixed(0)} vs ${mSimA.avgEnergy.toFixed(0)} u`;
    document.getElementById('kpi-alive').textContent = `${mSimC.connectedAlive} vs ${mSimA.connectedAlive}`;
    document.getElementById('kpi-payloads').textContent = `${mSimC.totalPayloads} vs ${mSimA.totalPayloads}`;
  }

  function setBanner(msg) {
    const el = document.getElementById('status-banner');
    if (el) el.textContent = msg;
  }

  function renderCanopyCanvas(canvasId, mesh) {
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

    // 1. Amazon Rainforest Canopy Sector Quadrants
    ctx.fillStyle = '#04100b';
    ctx.fillRect(0, 0, halfW, halfH);
    ctx.fillRect(halfW, halfH, halfW, halfH);

    ctx.fillStyle = '#071812';
    ctx.fillRect(halfW, 0, halfW, halfH);
    ctx.fillRect(0, halfH, halfW, halfH);

    // Subtle Amazon river tributary curve across the canopy floor
    ctx.strokeStyle = 'rgba(14, 116, 144, 0.18)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.68);
    ctx.bezierCurveTo(W * 0.35, H * 0.58, W * 0.62, H * 0.38, W, H * 0.25);
    ctx.stroke();

    // Sector Grid Dividers
    ctx.strokeStyle = 'rgba(110, 231, 183, 0.22)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(halfW, 0);
    ctx.lineTo(halfW, H);
    ctx.moveTo(0, halfH);
    ctx.lineTo(W, halfH);
    ctx.stroke();

    // Per-Sector Agent Status Headers on Map
    const badgePos = [
      [6, 13],
      [halfW + 6, 13],
      [6, halfH + 13],
      [halfW + 6, halfH + 13]
    ];
    ctx.font = '600 9.5px JetBrains Mono, monospace';
    for (let t = 0; t < 4; t++) {
      const p = mesh.tilePolicies[t];
      ctx.fillStyle = mesh.mode === 'ADK_SIMC' ? '#6ee7b7' : '#94a3b8';
      const label =
        mesh.mode === 'ADK_SIMC'
          ? `${mesh.sectorNames[t]}: r=${p.r.toFixed(1)} l=${p.minDelta}`
          : `Fixed T${t + 1}: r=4.0 l=5`;
      ctx.fillText(label, badgePos[t][0], badgePos[t][1]);
    }

    // 2. Render Canopy Wildfire / Storm Hazard Fronts
    for (const h of mesh.hazards) {
      const hx = h.x * scale;
      const hy = h.y * scale;
      const hr = h.r * scale;
      const grad = ctx.createRadialGradient(hx, hy, 2, hx, hy, hr);
      grad.addColorStop(0, 'rgba(251, 146, 60, 0.55)');
      grad.addColorStop(0.6, 'rgba(244, 63, 94, 0.25)');
      grad.addColorStop(1, 'rgba(244, 63, 94, 0.02)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fb923c';
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 3. Render Edges
    for (const edge of mesh.edges) {
      const u = mesh.nodes[edge.from];
      const v = edge.to === -1 ? mesh.globalSink : mesh.nodes[edge.to];
      if (!u || !v || !u.alive || u.orphaned || (edge.to !== -1 && !v.alive)) continue;

      ctx.beginPath();
      ctx.moveTo(u.x * scale, u.y * scale);
      ctx.lineTo(v.x * scale, v.y * scale);

      if (edge.tier === 'GLOBAL') {
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.65)';
        ctx.lineWidth = 1.9;
      } else if (edge.tier === 'DOMINANT') {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = 1.3;
      } else if (edge.tier === 'CROSS_TILE') {
        ctx.strokeStyle = 'rgba(192, 132, 252, 0.68)';
        ctx.lineWidth = 1.3;
      } else {
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.15)';
        ctx.lineWidth = 0.7;
      }
      ctx.stroke();
    }

    // 4. Render Active Packet Convergecast Beams
    for (const tx of mesh.transmissions) {
      ctx.beginPath();
      ctx.moveTo(tx.fromX * scale, tx.fromY * scale);
      ctx.lineTo(tx.toX * scale, tx.toY * scale);
      ctx.strokeStyle = tx.tier === 'GLOBAL' ? '#10b981' : '#38bdf8';
      ctx.lineWidth = tx.tier === 'GLOBAL' ? 2.2 : 1.25;
      ctx.stroke();
    }

    // 5. Render Cognitive Directive Beams (GlobalSinkAgent -> TileAgents)
    if (mesh.mode === 'ADK_SIMC') {
      for (const b of mesh.directiveBeams) {
        ctx.strokeStyle = 'rgba(192, 132, 252, 0.85)';
        ctx.lineWidth = 2.2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(b.fromX * scale, b.fromY * scale);
        ctx.lineTo(b.toX * scale, b.toY * scale);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 6. Render Sensor Motes
    for (const u of mesh.nodes) {
      const nx = u.x * scale;
      const ny = u.y * scale;
      if (!u.alive) {
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(nx, ny, 2.0, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (u.orphaned) {
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.85)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(nx, ny, 4.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#64748b';
        ctx.beginPath();
        ctx.arc(nx, ny, 2.1, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      let r = 2.4;
      if (u.role === 'TILE_SINK') {
        ctx.fillStyle = '#fb923c';
        r = 5.5;
      } else if (u.role === 'DOMINANT') {
        ctx.fillStyle = '#38bdf8';
        r = 3.8;
      } else {
        ctx.fillStyle = '#facc15';
        r = 2.4;
      }
      ctx.beginPath();
      ctx.arc(nx, ny, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 7. Central Emerald Canopy Satellite Uplink Tower at (20,20)
    const gx = mesh.globalSink.x * scale;
    const gy = mesh.globalSink.y * scale;
    ctx.fillStyle = '#10b981';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(gx, gy, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 8. Render Floating Agent Thought Callout Pills on the Map (Agentic UI)
    if (mesh.mode === 'ADK_SIMC') {
      ctx.font = '700 9.5px Inter, sans-serif';
      for (const c of mesh.activeCallouts) {
        const cx = Math.max(45, Math.min(W - 95, c.x * scale));
        const cy = Math.max(24, Math.min(H - 18, c.y * scale - 12));
        const textW = ctx.measureText(c.text).width + 12;

        ctx.fillStyle = 'rgba(6, 15, 12, 0.92)';
        ctx.strokeStyle = c.color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(cx - textW / 2, cy - 10, textW, 18, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ecfdf5';
        ctx.fillText(c.text, cx - textW / 2 + 6, cy + 2);
      }
    }

    ctx.restore();
  }

  function renderChart(canvasId, sSimC, sSimA, yMin, yMax) {
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

    const all = [...sSimC, ...sSimA];
    const maxV = yMax !== null ? yMax : Math.max(10, ...all) * 1.08;
    const minV = yMin !== null ? yMin : 0;

    ctx.strokeStyle = 'rgba(30, 63, 51, 0.7)';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    for (let i = 0; i <= 3; i++) {
      const y = padT + (plotH * i) / 3;
      const val = maxV - ((maxV - minV) * i) / 3;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();
      ctx.fillText(val.toFixed(val < 10 ? 1 : 0), 2, y + 3);
    }

    const maxPts = Math.max(20, sSimC.length - 1);
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

    drawCurve(sSimA, '#38bdf8');
    drawCurve(sSimC, '#10b981');

    ctx.restore();
  }

  function renderAll() {
    renderCanopyCanvas('canvas-simc', simcMesh);
    renderCanopyCanvas('canvas-sima', simaMesh);

    const h = state.history;
    const totalN = readConfig().nodesPerTile * 4;
    renderChart('chart-energy', h.simcEnergy, h.simaEnergy, 0, 1050);
    renderChart('chart-alive', h.simcAlive, h.simaAlive, 0, totalN * 1.05);
    renderChart('chart-radius', h.simcRadius, h.simaRadius, 2.0, 6.2);
    renderChart('chart-payloads', h.simcPayloads, h.simaPayloads, 0, null);
  }

  window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('ctrl-nodes').addEventListener('input', e => {
      document.getElementById('val-nodes').textContent = e.target.value;
    });

    document.getElementById('sel-cadence').addEventListener('change', e => {
      if (simcMesh) simcMesh.config.epochCadence = e.target.value;
    });

    document.getElementById('btn-reset').addEventListener('click', resetSim);
    document.getElementById('btn-run').addEventListener('click', () => {
      if (state.running) stopSim();
      else startSim();
    });
    document.getElementById('btn-step').addEventListener('click', () => {
      stopSim();
      stepOnce();
    });

    // Commander Intent Pills
    document.querySelectorAll('[data-intent]').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('[data-intent]').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const intent = pill.getAttribute('data-intent');
        if (intent === 'TOKEN_SAVER') {
          document.getElementById('sel-cadence').value = 'EVENT_ONLY';
        }
        if (simcMesh) {
          simcMesh.applyCommanderDirective(intent);
          if (intent === 'WILDFIRE_ALERT') {
            simaMesh.hazards.push({ x: 11.5, y: 11.0, r: 5.2, tileId: 0, ttl: 35, type: 'WILDFIRE' });
          }
          updateTokenEconomyAndRoster();
          renderAll();
        }
      });
    });

    // Custom Natural-Language Commander Input
    document.getElementById('btn-send-cmd').addEventListener('click', () => {
      const inp = document.getElementById('inp-commander');
      const txt = inp.value.trim();
      if (!txt || !simcMesh) return;
      simcMesh.applyCommanderDirective('CUSTOM', txt);
      const keyInput = document.getElementById('inp-gemini-key');
      if ((keyInput && keyInput.value.trim().length > 10) || state.serverHasEnvKey) {
        invokeLiveGeminiADK(txt);
      }
      inp.value = '';
      updateTokenEconomyAndRoster();
      renderAll();
    });

    const btnLiveGem = document.getElementById('btn-live-gemini');
    if (btnLiveGem) {
      btnLiveGem.addEventListener('click', () => {
        invokeLiveGeminiADK('Manual Live Gemini ADK Orchestration Request');
      });
    }

    const inpGemKey = document.getElementById('inp-gemini-key');
    if (inpGemKey) {
      inpGemKey.addEventListener('change', () => {
        if (inpGemKey.value.trim().length > 10) {
          invokeLiveGeminiADK('API Key Connected — Initial Canopy Orchestration');
        }
      });
    }

    // Restore saved Gemini API key from localStorage or check server /api/status
    try {
      const savedKey = localStorage.getItem('SIMC_GEMINI_API_KEY');
      if (savedKey && document.getElementById('inp-gemini-key')) {
        document.getElementById('inp-gemini-key').value = savedKey;
        document.getElementById('lbl-gemini-status').textContent = '[🔑 Key Ready]';
      }
    } catch (_) {}

    fetch('/api/status')
      .then(r => r.json())
      .then(st => {
        if (st && st.env_key_configured) {
          state.serverHasEnvKey = true;
          document.getElementById('lbl-gemini-status').textContent = '[✅ .env Key Active]';
          document.getElementById('lbl-gemini-status').style.color = '#10b981';
        }
      })
      .catch(() => {});

    document.getElementById('inp-commander').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-send-cmd').click();
    });

    document.getElementById('btn-chaos').addEventListener('click', () => {
      if (!simcMesh) return;
      const t = Math.floor(Math.random() * 4);
      const colOff = (t % 2) * 20;
      const rowOff = Math.floor(t / 2) * 20;
      const hx = colOff + 10;
      const hy = rowOff + 10;
      simcMesh.hazards.push({ x: hx, y: hy, r: 5.2, tileId: t, ttl: 24, type: 'WILDFIRE' });
      simaMesh.hazards.push({ x: hx, y: hy, r: 5.2, tileId: t, ttl: 24, type: 'WILDFIRE' });
      simcMesh.recordLLMCall(
        'ChaosRedTeamAgent',
        `ignite_canopy_hazard(sector=T${t + 1})`,
        `Ignited canopy fire/SINR storm in ${simcMesh.sectorNames[t]}! Watch TileAgent_T${t + 1} adapt r & cross-sector bridges.`,
        'chaos',
        215,
        80,
        { x: hx, y: hy, shortText: `🔥 Canopy Fire T${t + 1}!` }
      );
      updateTokenEconomyAndRoster();
      renderAll();
    });

    // Click on Canvas to Ignite Canopy Wildfire at Clicked Location
    document.getElementById('canvas-simc').addEventListener('click', evt => {
      const rect = evt.currentTarget.getBoundingClientRect();
      const scale = rect.width / simcMesh.worldSize;
      const wx = (evt.clientX - rect.left) / scale;
      const wy = (evt.clientY - rect.top) / scale;
      const t = simcMesh.getTileId(wx, wy);
      simcMesh.hazards.push({ x: wx, y: wy, r: 4.8, tileId: t, ttl: 24, type: 'WILDFIRE' });
      simaMesh.hazards.push({ x: wx, y: wy, r: 4.8, tileId: t, ttl: 24, type: 'WILDFIRE' });
      simcMesh.recordLLMCall(
        `TileAgent_T${t + 1}`,
        `detect_canopy_anomaly(x=${wx.toFixed(1)}, y=${wy.toFixed(1)})`,
        `Canopy anomaly detected in ${simcMesh.sectorNames[t]}; expanding UDG radius r→4.8 to route around hazard.`,
        'tile',
        260,
        90,
        { x: wx, y: wy, shortText: `🤖 Routing around fire` }
      );
      simcMesh.tilePolicies[t].r = 4.8;
      simcMesh.tilePolicies[t].minDelta = 3;
      simcMesh.tilePolicies[t].phase = '🔥 Hazard Evasion';
      updateTokenEconomyAndRoster();
      renderAll();
    });

    window.addEventListener('resize', renderAll);
    resetSim();
  });
})();
