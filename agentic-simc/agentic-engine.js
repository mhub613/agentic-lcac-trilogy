/**
 * SimC: CanopyPulse Agentic AI-DDS + LCAC Engine (with Token Economy Profiler & Amazon Rainforest Theme)
 *
 * Implements:
 *   - Hybrid 3-Tier Google ADK Architecture (1 GlobalSinkAgent + 4 TileAgents + 800 SensorMicroAgents)
 *   - Real-Time Token Economy & LLM Call Profiler (Option C Hybrid vs. Option A 800-LLM Swarm)
 *   - Natural-Language Mission Intent Commander & On-Canvas Agent Thought Callouts
 *   - Amazon Rainforest Canopy Sectors + Optional Canopy Wildfire / Storm Fronts
 */

class AgenticWSNInstance {
  constructor(mode, config) {
    this.mode = mode; // 'ADK_SIMC' or 'FIXED_SIMA'
    this.config = { ...config };
    this.worldSize = 40;
    this.nodes = [];
    this.edges = [];
    this.transmissions = [];
    this.hazards = [];         // Canopy wildfire or tropical storm RF interference zones
    this.directiveBeams = [];  // Visual violet beams from GlobalSinkAgent -> TileAgents
    this.activeCallouts = [];  // Floating thought bubbles on the rainforest canvas
    this.round = 0;
    this.totalPayloadsDelivered = 0;
    this.semaphoreBlocksThisRound = 0;
    this.agentLogs = [];
    this.missionIntent = 'BALANCED'; // 'BALANCED', 'ECO_HIBERNATE', 'WILDFIRE_ALERT', 'TOKEN_SAVER'

    // Token Economy & LLM Call Telemetry
    this.tokenEconomy = {
      llmCalls: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      naiveSwarmCalls: 0,
      naiveSwarmTokens: 0,
      flashCostUsd: 0.0,
      proCostUsd: 0.0,
      naiveFlashCostUsd: 0.0,
      savingsPct: 99.8
    };

    this.sectorNames = [
      'T1 · Terra Firme NW',
      'T2 · Várzea Floodplain NE',
      'T3 · Igapó Blackwater SW',
      'T4 · Cloud Ridge SE'
    ];

    this.tilePolicies = [0, 1, 2, 3].map(t => ({
      tileId: t,
      r: 4.0,
      minDelta: 5,
      minE: 450,
      txFactor: 0.30,
      crossTile: this.mode === 'ADK_SIMC',
      phase: 'Phase I: Init',
      alivePct: 100,
      avgEnergy: 1000,
      hubX: (t % 2) * 20 + 10,
      hubY: Math.floor(t / 2) * 20 + 10
    }));
  }

  initFromSharedPositions(positions, config) {
    this.config = { ...config };
    this.round = 0;
    this.totalPayloadsDelivered = 0;
    this.semaphoreBlocksThisRound = 0;
    this.edges = [];
    this.transmissions = [];
    this.hazards = [];
    this.directiveBeams = [];
    this.activeCallouts = [];
    this.agentLogs = [];

    this.tokenEconomy = {
      llmCalls: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      naiveSwarmCalls: 0,
      naiveSwarmTokens: 0,
      flashCostUsd: 0.0,
      proCostUsd: 0.0,
      naiveFlashCostUsd: 0.0,
      savingsPct: 99.8
    };

    this.globalSink = {
      id: -1,
      x: this.worldSize / 2,
      y: this.worldSize / 2,
      role: 'GLOBAL_SINK'
    };

    this.tilePolicies = [0, 1, 2, 3].map(t => ({
      tileId: t,
      r: 4.0,
      minDelta: 5,
      minE: 450,
      txFactor: config.transmissionFactor || 0.30,
      crossTile: this.mode === 'ADK_SIMC',
      phase: this.mode === 'ADK_SIMC' ? 'Phase I: Canopy Init' : 'Locked 2012 Sliders',
      alivePct: 100,
      avgEnergy: config.initialEnergy,
      hubX: (t % 2) * 20 + 10,
      hubY: Math.floor(t / 2) * 20 + 10
    }));

    this.nodes = positions.map((p, idx) => ({
      id: idx,
      x: p.x,
      y: p.y,
      tileId: this.getTileId(p.x, p.y),
      energy: config.initialEnergy,
      alive: true,
      orphaned: false,
      role: 'LEAF',
      delta: 0,
      neighbors: [],
      parentId: null,
      childrenIds: [],
      txFlag: false,
      avoidedCollision: false,
      consecutiveBlocks: 0,
      qParentBonus: {}
    }));

    if (this.mode === 'ADK_SIMC') {
      this.recordLLMCall(
        'GlobalSinkAgent',
        'init_canopypulse_swarm()',
        'Bootstrapped 1 GlobalSinkCoordinator + 4 Parallel TileAgents (Terra Firme, Várzea, Igapó, Cloud Ridge) + 800 SensorMicroAgents.',
        'global',
        340,
        95
      );
    }

    this.computeNeighborhoods();
    this.runDDS();
  }

  getTileId(x, y) {
    const col = x < 20 ? 0 : 1;
    const row = y < 20 ? 0 : 1;
    return row * 2 + col;
  }

  dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // Build telemetry snapshot for Live Gemini ADK API call (/api/adk-orchestrate)
  getLiveTelemetryPayload(customCommand = '') {
    const initialPerTile = this.nodes.length / 4;
    const tiles = [0, 1, 2, 3].map(t => {
      const tNodes = this.nodes.filter(n => n.tileId === t);
      const aliveNodes = tNodes.filter(n => n.alive);
      const alivePct = (aliveNodes.length / Math.max(1, initialPerTile)) * 100;
      const avgE = tNodes.reduce((s, n) => s + n.energy, 0) / Math.max(1, tNodes.length);
      const avgDelta = aliveNodes.reduce((s, n) => s + n.delta, 0) / Math.max(1, aliveNodes.length);
      const hazardNodes = aliveNodes.filter(n => this.isInHazard(n)).length;
      const blockedNodes = aliveNodes.filter(n => n.consecutiveBlocks > 0).length;
      return {
        tile_id: t + 1,
        sector_name: this.sectorNames[t],
        alive_pct: Math.round(alivePct * 10) / 10,
        avg_residual_energy: Math.round(avgE * 10) / 10,
        avg_neighbor_degree_delta: Math.round(avgDelta * 10) / 10,
        hazard_nodes: hazardNodes,
        semaphore_blocked_nodes: blockedNodes,
        current_r: this.tilePolicies[t].r,
        current_min_delta: this.tilePolicies[t].minDelta
      };
    });

    return {
      round: this.round,
      commander_intent: this.missionIntent,
      custom_command: customCommand,
      tiles
    };
  }

  // Apply real Gemini Model response from POST /api/adk-orchestrate
  applyLiveGeminiResponse(apiResult) {
    if (!apiResult || !apiResult.ok || !apiResult.decision) return;
    const { decision, usage, model } = apiResult;
    const tag = `[LIVE ${model.toUpperCase()}]`;

    // Apply per-tile decisions
    if (Array.isArray(decision.tile_decisions)) {
      for (const td of decision.tile_decisions) {
        const idx = (td.tile_id || 1) - 1;
        const pol = this.tilePolicies[idx];
        if (!pol) continue;
        pol.r = Math.max(2.2, Math.min(6.2, Number(td.r) || pol.r));
        pol.minDelta = Math.max(2, Math.min(9, parseInt(td.min_delta, 10) || pol.minDelta));
        pol.minE = Math.max(40, Math.min(850, Number(td.min_energy) || pol.minE));
        pol.phase = `✨ ${td.phase_label}`;

        this.activeCallouts.push({
          x: pol.hubX,
          y: pol.hubY,
          agent: `TileAgent_T${idx + 1}`,
          text: `${tag} T${idx + 1}: r→${pol.r.toFixed(1)}, l→${pol.minDelta}`,
          color: '#10b981',
          ttl: 18
        });

        this.agentLogs.unshift({
          round: this.round,
          agent: `${tag} TileAgent_T${idx + 1}`,
          tool: `tune_dds(r=${pol.r.toFixed(1)}, l=${pol.minDelta}, min_E=${pol.minE})`,
          reason: td.rationale,
          category: 'tile',
          tokens: Math.round((usage.total_tokens || 480) / 5)
        });
      }
    }

    // Apply GlobalSinkCoordinator directive
    if (decision.global_sink_directive) {
      const gd = decision.global_sink_directive;
      for (const p of this.tilePolicies) {
        this.directiveBeams.push({
          fromX: this.globalSink.x,
          fromY: this.globalSink.y,
          toX: p.hubX,
          toY: p.hubY,
          ttl: 14
        });
      }

      this.recordLLMCall(
        `${tag} GlobalSink`,
        `${gd.directive_type}(T${gd.rescue_from_tile}→T${gd.rescue_to_tile})`,
        gd.rationale,
        'global',
        usage.prompt_tokens || 380,
        usage.completion_tokens || 140,
        { x: this.globalSink.x, y: this.globalSink.y - 2.2, shortText: `${tag} ${gd.directive_type}` }
      );
    }

    this.computeNeighborhoods();
    this.runDDS();
  }

  recordLLMCall(agent, tool, reason, category, promptTok, compTok, calloutPos = null) {
    this.tokenEconomy.llmCalls += 1;
    this.tokenEconomy.promptTokens += promptTok;
    this.tokenEconomy.completionTokens += compTok;
    this.tokenEconomy.totalTokens = this.tokenEconomy.promptTokens + this.tokenEconomy.completionTokens;

    // Gemini 2.5 Flash (~$0.15 / 1M input, $0.60 / 1M output) & Pro (~$1.25 / 1M input, $5.00 / 1M output)
    this.tokenEconomy.flashCostUsd =
      (this.tokenEconomy.promptTokens * 0.15 + this.tokenEconomy.completionTokens * 0.60) / 1e6;
    this.tokenEconomy.proCostUsd =
      (this.tokenEconomy.promptTokens * 1.25 + this.tokenEconomy.completionTokens * 5.00) / 1e6;

    this.agentLogs.unshift({
      round: this.round,
      agent,
      tool,
      reason,
      category,
      tokens: promptTok + compTok
    });
    if (this.agentLogs.length > 45) this.agentLogs.pop();

    if (calloutPos) {
      this.activeCallouts.push({
        x: calloutPos.x,
        y: calloutPos.y,
        agent,
        text: calloutPos.shortText || tool,
        color: category === 'global' ? '#c084fc' : category === 'chaos' ? '#f43f5e' : '#34d399',
        ttl: 12
      });
    }
  }

  // Handle High-Level Natural Language Commander Directives from the User
  applyCommanderDirective(intentKey, customText = '') {
    this.missionIntent = intentKey;
    if (this.mode !== 'ADK_SIMC') return;

    let summary = '';
    if (intentKey === 'ECO_HIBERNATE') {
      summary = 'Mission Commander ordered ECO-HIBERNATE: Shrinking r_i→2.7 & throttling routine TX to stretch battery past 300 rounds.';
      for (const p of this.tilePolicies) {
        p.r = 2.7;
        p.minDelta = 6;
        p.txFactor = 0.20;
        p.phase = 'Eco-Hibernate Mode';
      }
    } else if (intentKey === 'WILDFIRE_ALERT') {
      summary = 'Mission Commander declared CANOPY WILDFIRE ALERT: Igniting hazard front & boosting r_i→4.8 for emergency perimeter convergecast!';
      this.hazards.push({ x: 11.5, y: 11.0, r: 5.2, tileId: 0, ttl: 35, type: 'WILDFIRE' });
      for (const p of this.tilePolicies) {
        p.r = p.tileId === 0 ? 4.9 : 3.4;
        p.minDelta = p.tileId === 0 ? 3 : 5;
        p.txFactor = p.tileId === 0 ? 0.65 : 0.30;
        p.phase = p.tileId === 0 ? '🔥 Wildfire Evasion' : 'Cross-Tile Support';
      }
    } else if (intentKey === 'TOKEN_SAVER') {
      summary = 'Mission Commander activated ULTRA-LOW TOKEN BUDGET: Switching ADK agents to Event-Driven Escalation Only (0 periodic polling tokens).';
      this.config.epochCadence = 'EVENT_ONLY';
    } else if (intentKey === 'CUSTOM') {
      summary = `Mission Commander Directive: "${customText}" → GlobalSinkCoordinator parsed intent & updated 4 TileAgents.`;
      const lower = customText.toLowerCase();
      if (lower.includes('fire') || lower.includes('jam') || lower.includes('boost')) {
        for (const p of this.tilePolicies) { p.r = 4.7; p.minDelta = 3; p.phase = 'Commander Boost'; }
      } else if (lower.includes('save') || lower.includes('eco') || lower.includes('sleep')) {
        for (const p of this.tilePolicies) { p.r = 2.8; p.minDelta = 6; p.phase = 'Commander Eco'; }
      } else {
        for (const p of this.tilePolicies) { p.r = 3.4; p.minDelta = 5; p.phase = 'Custom Intent'; }
      }
    } else {
      summary = 'Mission Commander set BALANCED CANOPY AUTO-PILOT across all 4 rainforest sectors.';
      for (const p of this.tilePolicies) {
        p.r = 3.2;
        p.minDelta = 6;
        p.txFactor = 0.30;
        p.phase = 'Phase I: Balanced';
      }
    }

    // Fire visible cognitive directive beams from Global Tower to all 4 Sector Hubs
    for (const p of this.tilePolicies) {
      this.directiveBeams.push({
        fromX: this.globalSink.x,
        fromY: this.globalSink.y,
        toX: p.hubX,
        toY: p.hubY,
        ttl: 10
      });
    }

    this.recordLLMCall(
      'GlobalSinkCoordinator',
      `broadcast_commander_intent("${intentKey}")`,
      summary,
      'global',
      410,
      135,
      { x: this.globalSink.x, y: this.globalSink.y - 2.2, shortText: `Directive: ${intentKey}` }
    );
  }

  isInHazard(u) {
    for (const h of this.hazards) {
      if (this.dist(u, h) <= h.r) return true;
    }
    return false;
  }

  runADKCognitiveEpoch(escalationTriggered) {
    // Update Naive 800-LLM Swarm baseline counter (every live sensor calling an LLM each round)
    const liveCount = this.nodes.filter(n => n.alive).length;
    this.tokenEconomy.naiveSwarmCalls += liveCount;
    this.tokenEconomy.naiveSwarmTokens += liveCount * 380;
    this.tokenEconomy.naiveFlashCostUsd = (this.tokenEconomy.naiveSwarmTokens * 0.30) / 1e6;
    if (this.tokenEconomy.naiveSwarmTokens > 0) {
      this.tokenEconomy.savingsPct = Math.max(
        0,
        100 * (1 - this.tokenEconomy.totalTokens / this.tokenEconomy.naiveSwarmTokens)
      );
    }

    if (this.mode !== 'ADK_SIMC') return;

    // Decay visual beams, callouts, and hazards
    for (const b of this.directiveBeams) b.ttl--;
    this.directiveBeams = this.directiveBeams.filter(b => b.ttl > 0);

    for (const c of this.activeCallouts) c.ttl--;
    this.activeCallouts = this.activeCallouts.filter(c => c.ttl > 0);

    for (const h of this.hazards) h.ttl--;
    this.hazards = this.hazards.filter(h => h.ttl > 0);

    // Optional Red-Team Wildfire / Jammer Injection
    if (this.config.enableChaosAgent && this.round > 0 && this.round % 40 === 0) {
      const targetTile = Math.floor(Math.random() * 4);
      const colOff = (targetTile % 2) * 20;
      const rowOff = Math.floor(targetTile / 2) * 20;
      const hx = colOff + 7 + Math.random() * 6;
      const hy = rowOff + 7 + Math.random() * 6;
      this.hazards.push({ x: hx, y: hy, r: 4.8, tileId: targetTile, ttl: 22, type: 'WILDFIRE' });
      this.recordLLMCall(
        'ChaosRedTeamAgent',
        `ignite_canopy_hazard(sector=T${targetTile + 1})`,
        `Injected localized canopy fire/SINR storm in ${this.sectorNames[targetTile]}!`,
        'chaos',
        210,
        75,
        { x: hx, y: hy, shortText: `🔥 Canopy Hazard!` }
      );
    }

    // Check Cognitive Cadence: Periodic (5, 10, 20) vs. Event-Driven Escalation Only
    const cadence = this.config.epochCadence || '10';
    let shouldWakeAgents = false;
    if (this.round === 1) {
      shouldWakeAgents = true;
    } else if (cadence === 'EVENT_ONLY') {
      shouldWakeAgents = escalationTriggered || this.hazards.some(h => h.ttl === 21);
    } else {
      const interval = parseInt(cadence, 10) || 10;
      shouldWakeAgents = (this.round % interval === 0) || this.hazards.some(h => h.ttl === 21);
    }

    if (!shouldWakeAgents) return;

    const initialPerTile = this.nodes.length / 4;
    let minTileEnergy = Infinity;
    let maxTileEnergy = -Infinity;
    let minTileId = 0;
    let maxTileId = 0;

    for (let t = 0; t < 4; t++) {
      const tNodes = this.nodes.filter(n => n.tileId === t);
      const aliveNodes = tNodes.filter(n => n.alive);
      const alivePct = (aliveNodes.length / Math.max(1, initialPerTile)) * 100;
      const avgE = tNodes.reduce((s, n) => s + n.energy, 0) / Math.max(1, tNodes.length);
      const pol = this.tilePolicies[t];
      pol.alivePct = alivePct;
      pol.avgEnergy = avgE;

      if (avgE < minTileEnergy) { minTileEnergy = avgE; minTileId = t; }
      if (avgE > maxTileEnergy) { maxTileEnergy = avgE; maxTileId = t; }

      const oldR = pol.r;
      const oldL = pol.minDelta;
      const hazardNodes = aliveNodes.filter(n => this.isInHazard(n)).length;

      if (this.missionIntent === 'ECO_HIBERNATE' && alivePct > 50) {
        pol.phase = '🌿 Eco-Hibernate';
        pol.r = 2.7;
        pol.minDelta = 6;
        pol.minE = Math.round(avgE * 0.85);
      } else if (hazardNodes > 0) {
        pol.phase = '🔥 Hazard Evasion';
        pol.r = 4.7;
        pol.minDelta = 3;
        pol.minE = Math.round(avgE * 0.68);
      } else if (alivePct >= 80 && avgE > 580) {
        pol.phase = 'Phase I: Contention Opt';
        pol.r = 3.1;
        pol.minDelta = 6;
        pol.minE = Math.round(avgE * 0.86);
      } else if (alivePct >= 48 && avgE > 240) {
        pol.phase = 'Phase II: Load Rotate';
        pol.r = 3.7;
        pol.minDelta = 4;
        pol.minE = Math.round(avgE * 0.72);
      } else {
        pol.phase = 'Phase III: Survival Boost';
        pol.r = 5.5;
        pol.minDelta = 2;
        pol.minE = 40;
      }

      if (Math.abs(oldR - pol.r) >= 0.15 || oldL !== pol.minDelta || this.round === 1 || hazardNodes > 0) {
        this.recordLLMCall(
          `TileAgent_T${t + 1}`,
          `tune_dds(r=${pol.r.toFixed(1)}, l=${pol.minDelta})`,
          `${this.sectorNames[t]} → ${pol.phase} (E_avg=${avgE.toFixed(0)}u, Alive=${alivePct.toFixed(0)}%).`,
          'tile',
          290,
          95,
          { x: pol.hubX, y: pol.hubY, shortText: `T${t + 1}: r→${pol.r.toFixed(1)}, l→${pol.minDelta}` }
        );
      }
    }

    if (maxTileEnergy - minTileEnergy > 65) {
      this.directiveBeams.push({
        fromX: this.globalSink.x,
        fromY: this.globalSink.y,
        toX: this.tilePolicies[minTileId].hubX,
        toY: this.tilePolicies[minTileId].hubY,
        ttl: 8
      });
      this.recordLLMCall(
        'GlobalSinkCoordinator',
        `bridge_sectors(T${maxTileId + 1}→T${minTileId + 1})`,
        `Cross-sector energy delta=${Math.round(maxTileEnergy - minTileEnergy)}u; routing border leaves from T${minTileId + 1} via T${maxTileId + 1}.`,
        'global',
        380,
        115,
        { x: this.globalSink.x, y: this.globalSink.y + 2.2, shortText: `Bridge T${maxTileId + 1}→T${minTileId + 1}` }
      );
    }
  }

  computeNeighborhoods() {
    const n = this.nodes.length;
    for (let i = 0; i < n; i++) {
      const u = this.nodes[i];
      u.neighbors = [];
      u.delta = 0;
      if (!u.alive) continue;
      const tilePol = this.tilePolicies[u.tileId];
      const r = this.mode === 'ADK_SIMC' ? tilePol.r : 4.0;
      const allowCross = this.mode === 'ADK_SIMC' ? tilePol.crossTile : false;

      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const v = this.nodes[j];
        if (!v.alive) continue;
        if (!allowCross && u.tileId !== v.tileId) continue;
        if (this.dist(u, v) <= r) {
          u.neighbors.push(v.id);
        }
      }
      u.delta = u.neighbors.length;
    }
  }

  runDDS() {
    this.edges = [];
    const aliveNodes = this.nodes.filter(n => n.alive);
    if (aliveNodes.length === 0) return;

    for (const u of aliveNodes) {
      u.role = 'LEAF';
      u.parentId = null;
      u.childrenIds = [];
      u.orphaned = false;
    }

    const tileGroups = [[], [], [], []];
    for (const u of aliveNodes) {
      tileGroups[u.tileId].push(u);
    }

    for (let t = 0; t < 4; t++) {
      const tNodes = tileGroups[t];
      if (tNodes.length === 0) continue;

      const pol = this.tilePolicies[t];
      const reqDelta = this.mode === 'ADK_SIMC' ? pol.minDelta : 5;
      const reqMinE = this.mode === 'ADK_SIMC' ? pol.minE : 380;
      const tileR = this.mode === 'ADK_SIMC' ? pol.r : 4.0;

      const scored = tNodes.map(u => {
        const hazPen = this.isInHazard(u) ? 450 : 0;
        const score = u.energy * 1.3 + u.delta * 18 - hazPen;
        return { node: u, score };
      }).sort((a, b) => b.score - a.score);

      const dominants = [];
      for (const item of scored) {
        const u = item.node;
        if (u.delta >= reqDelta && u.energy >= reqMinE) {
          const nearDoms = dominants.filter(d => this.dist(u, d) <= tileR * 0.88).length;
          if (nearDoms < 3) {
            u.role = 'DOMINANT';
            dominants.push(u);
          }
        }
      }

      if (dominants.length === 0 && scored.length > 0 && (this.mode === 'ADK_SIMC' || scored[0].node.energy >= 220)) {
        scored[0].node.role = 'DOMINANT';
        dominants.push(scored[0].node);
      }

      if (dominants.length === 0) continue;

      let tileSink = dominants[0];
      let bestSinkScore = -Infinity;
      for (const d of dominants) {
        const sScore = d.energy * 1.4 + d.delta * 20 - this.dist(d, this.globalSink) * 5;
        if (sScore > bestSinkScore) {
          bestSinkScore = sScore;
          tileSink = d;
        }
      }
      tileSink.role = 'TILE_SINK';
      tileSink.parentId = -1;
      pol.hubX = tileSink.x;
      pol.hubY = tileSink.y;
      this.edges.push({ from: tileSink.id, to: -1, tier: 'GLOBAL' });

      const connected = [tileSink];
      const rem = dominants.filter(d => d.id !== tileSink.id)
        .sort((a, b) => this.dist(a, tileSink) - this.dist(b, tileSink));

      for (const d of rem) {
        let bestP = tileSink;
        let bestDist = Infinity;
        for (const c of connected) {
          const dist = this.dist(d, c);
          if (dist < bestDist) {
            bestDist = dist;
            bestP = c;
          }
        }
        d.parentId = bestP.id;
        bestP.childrenIds.push(d.id);
        connected.push(d);
        this.edges.push({ from: d.id, to: bestP.id, tier: 'DOMINANT' });
      }
    }

    const allDominants = aliveNodes.filter(n => n.role === 'DOMINANT' || n.role === 'TILE_SINK');
    for (const u of aliveNodes) {
      if (u.role !== 'LEAF') continue;
      const pol = this.tilePolicies[u.tileId];
      const tileR = this.mode === 'ADK_SIMC' ? pol.r : 4.0;
      const allowCross = this.mode === 'ADK_SIMC' ? pol.crossTile : false;

      const candidates = allowCross
        ? allDominants
        : allDominants.filter(d => d.tileId === u.tileId);

      let chosen = null;
      let bestMetric = -Infinity;
      for (const d of candidates) {
        const dist = this.dist(u, d);
        if (dist <= tileR * 1.35) {
          const qBonus = this.mode === 'ADK_SIMC' ? (u.qParentBonus[d.id] || 0) * 18 : 0;
          const metric = (d.energy / this.config.initialEnergy) * 65 - dist * 10 + qBonus;
          if (metric > bestMetric) {
            bestMetric = metric;
            chosen = d;
          }
        }
      }

      if (chosen) {
        u.parentId = chosen.id;
        chosen.childrenIds.push(u.id);
        this.edges.push({
          from: u.id,
          to: chosen.id,
          tier: u.tileId !== chosen.tileId ? 'CROSS_TILE' : 'LEAF'
        });
      } else {
        u.orphaned = true;
      }
    }
  }

  stepRound() {
    this.round++;
    this.transmissions = [];
    this.semaphoreBlocksThisRound = 0;

    let escalationTriggered = false;
    for (const u of this.nodes) {
      if (u.alive && u.consecutiveBlocks >= 5) {
        escalationTriggered = true;
        break;
      }
    }

    this.runADKCognitiveEpoch(escalationTriggered);
    this.computeNeighborhoods();
    this.runDDS();

    for (const u of this.nodes) {
      u.txFlag = false;
      u.avoidedCollision = false;
    }

    const baseTxCost = this.config.energyPerTransmission;
    const parentSemaphore = new Set();
    const activeTx = [];

    const leaves = this.nodes.filter(n => n.alive && !n.orphaned && n.role === 'LEAF' && n.parentId !== null);
    leaves.sort(() => Math.random() - 0.5);

    let loggedMicroEscalation = false;

    for (const leaf of leaves) {
      const pol = this.tilePolicies[leaf.tileId];
      const txProb = this.mode === 'ADK_SIMC' ? pol.txFactor : this.config.transmissionFactor;
      if (Math.random() > txProb) continue;

      const parent = this.nodes[leaf.parentId];
      if (!parent || !parent.alive || this.isInHazard(leaf)) continue;

      const tileR = this.mode === 'ADK_SIMC' ? pol.r : 4.0;
      const parentBusy = parentSemaphore.has(parent.id);
      const localBusy = activeTx.some(
        t => this.dist(t, parent) <= tileR * 0.95 || this.dist(t, leaf) <= tileR * 0.95
      );

      if (!parentBusy && !localBusy) {
        parentSemaphore.add(parent.id);
        activeTx.push(leaf);

        // Quadratic free-space radio amplifier power scaling (E_tx ~ r^2, Gupta et al. [10], Thesis p. 31)
        const powerScale = this.mode === 'ADK_SIMC'
          ? 0.65 * Math.pow(tileR / 4.0, 2.0)
          : 1.0;

        leaf.energy = Math.max(0, leaf.energy - baseTxCost * powerScale);
        parent.energy = Math.max(0, parent.energy - baseTxCost * 0.24 * powerScale);
        leaf.txFlag = true;
        leaf.consecutiveBlocks = 0;
        leaf.qParentBonus[parent.id] = Math.min(2.0, (leaf.qParentBonus[parent.id] || 0) + 0.25);

        this.totalPayloadsDelivered++;
        this.transmissions.push({
          fromX: leaf.x,
          fromY: leaf.y,
          toX: parent.x,
          toY: parent.y,
          tier: 'LEAF'
        });
      } else {
        leaf.avoidedCollision = true;
        leaf.consecutiveBlocks++;
        leaf.qParentBonus[parent.id] = Math.max(-2.0, (leaf.qParentBonus[parent.id] || 0) - 0.35);
        this.semaphoreBlocksThisRound++;

        if (this.mode === 'ADK_SIMC' && !loggedMicroEscalation && leaf.consecutiveBlocks >= 5 && this.round % 8 === 0) {
          loggedMicroEscalation = true;
          this.recordLLMCall(
            `SensorMicroAgent #${leaf.id}`,
            `escalate_contention(T${leaf.tileId + 1})`,
            `Blocked ${leaf.consecutiveBlocks}x on parent #${parent.id}; updated local Q-table & signaled TileAgent_T${leaf.tileId + 1}.`,
            'micro',
            120,
            45
          );
        }
      }
    }

    // Layer 2: Dominants
    const doms = this.nodes.filter(n => n.alive && n.role === 'DOMINANT' && n.parentId !== null);
    for (const dom of doms) {
      const childSent = dom.childrenIds.some(cid => this.nodes[cid] && this.nodes[cid].txFlag);
      if (!childSent) continue;
      const parent = this.nodes[dom.parentId];
      if (!parent || !parent.alive) continue;

      dom.energy = Math.max(0, dom.energy - baseTxCost * 0.75);
      parent.energy = Math.max(0, parent.energy - baseTxCost * 0.25);
      dom.txFlag = true;
      this.totalPayloadsDelivered++;
      this.transmissions.push({
        fromX: dom.x,
        fromY: dom.y,
        toX: parent.x,
        toY: parent.y,
        tier: 'DOMINANT'
      });
    }

    // Layer 3: Tile Sinks
    const sinks = this.nodes.filter(n => n.alive && n.role === 'TILE_SINK');
    for (const ts of sinks) {
      ts.energy = Math.max(0, ts.energy - baseTxCost * 0.85);
      ts.txFlag = true;
      this.totalPayloadsDelivered++;
      this.transmissions.push({
        fromX: ts.x,
        fromY: ts.y,
        toX: this.globalSink.x,
        toY: this.globalSink.y,
        tier: 'GLOBAL'
      });
    }

    for (const u of this.nodes) {
      if (u.alive && u.energy <= 25) {
        u.alive = false;
        u.role = 'DEAD';
      }
    }

    const connectedAlive = this.nodes.filter(n => n.alive && !n.orphaned).length;
    const avgEnergy = this.nodes.reduce((s, n) => s + n.energy, 0) / Math.max(1, this.nodes.length);
    const meanRadius = this.tilePolicies.reduce((s, p) => s + p.r, 0) / 4;

    return {
      round: this.round,
      avgEnergy,
      connectedAlive,
      meanRadius,
      totalPayloads: this.totalPayloadsDelivered,
      tokenEconomy: this.tokenEconomy
    };
  }
}

window.AgenticWSNInstance = AgenticWSNInstance;
