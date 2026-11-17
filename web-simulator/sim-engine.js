/**
 * DDS + LCAC vs. Static WIRES Simulation Engine
 * Based on Muhuji Mshana's 2012 Carleton University Master's Thesis:
 * "Dynamic Energy Aware Aggregate Convergecast in a Wireless Sensor Network"
 *
 * Implements:
 *  - Algorithm 4.1: Dynamic Dominating Set (DDS) Tree Construction (O(N^2) per tile)
 *  - Algorithm 5.1: Local Collision Aware Convergecast (LCAC) (O(N))
 *  - Algorithm 5.2: Dual Semaphore Model (local_semaphore & parent_semaphore) + TDMA (Sec 6.2.4)
 *  - Algorithm 5.3: Decentralized System Flow
 *  - Baseline: WIRES (Malhotra, Nikolaidis, & Nascimento, 2011)
 *  - 2012 Future Work Extensions (#1 SINR/Jamming, #2 Mobility, #3 Smart Cross-Tile Routing)
 */

class WSNNetworkInstance {
  constructor(mode, config) {
    this.mode = mode; // 'LCAC' or 'WIRES'
    this.config = { ...config };
    this.nodes = [];
    this.edges = [];
    this.transmissions = [];
    this.blockedNodes = [];
    this.jammers = [];
    this.round = 0;
    this.stage = 1;
    this.lastExecTimeMs = 0;
  }

  initFromPositions(positions, config) {
    this.config = { ...config };
    this.round = 0;
    this.stage = 1;
    this.edges = [];
    this.transmissions = [];
    this.blockedNodes = [];
    const ts = this.config.tileSize;
    const worldSize = ts * 2;
    this.worldSize = worldSize;
    this.globalSink = {
      id: -1,
      x: worldSize / 2,
      y: worldSize / 2,
      role: 'GLOBAL_SINK',
      energy: Infinity,
      tileId: -1
    };

    this.nodes = positions.map((pos, idx) => ({
      id: idx,
      x: pos.x,
      y: pos.y,
      vx: pos.vx || 0,
      vy: pos.vy || 0,
      tileId: this.getTileId(pos.x, pos.y, ts),
      energy: this.config.initialEnergy,
      alive: true,
      role: 'LEAF',
      delta: 0,
      neighbors: [],
      parentId: null,
      childrenIds: [],
      txFlag: null,
      avoidedCollision: false,
      sufferedCollision: false
    }));

    this.computeNeighborhoods();
    if (this.mode === 'WIRES') {
      this.buildStaticWIRESTree();
    } else {
      this.runDDSAlgorithm();
    }
  }

  getTileId(x, y, ts) {
    const col = x < ts ? 0 : 1;
    const row = y < ts ? 0 : 1;
    return row * 2 + col;
  }

  dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  isJammed(node) {
    if (!this.config.enableSINR) return false;
    for (const jam of this.jammers) {
      if (this.dist(node, jam) <= jam.radius) return true;
    }
    return false;
  }

  // Stage 1: Neighborhood Discovery (UDG Graph I(E, V))
  computeNeighborhoods() {
    const r = this.config.neighborRadius;
    const n = this.nodes.length;
    for (let i = 0; i < n; i++) {
      const u = this.nodes[i];
      u.neighbors = [];
      u.delta = 0;
      if (!u.alive) continue;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const v = this.nodes[j];
        if (!v.alive) continue;
        if (!this.config.enableCrossTile && this.mode === 'LCAC' && u.tileId !== v.tileId) {
          continue;
        }
        if (this.dist(u, v) <= r) {
          u.neighbors.push(v.id);
        }
      }
      u.delta = u.neighbors.length;
    }
  }

  // Stage 2: Algorithm 4.1 — Dynamic Dominating Set (DDS) Tree Construction
  runDDSAlgorithm() {
    this.edges = [];
    const aliveNodes = this.nodes.filter(n => n.alive);
    if (aliveNodes.length === 0) return;

    for (const u of aliveNodes) {
      u.role = 'LEAF';
      u.parentId = null;
      u.childrenIds = [];
    }

    const tileGroups = [[], [], [], []];
    for (const u of aliveNodes) {
      u.tileId = this.getTileId(u.x, u.y, this.config.tileSize);
      tileGroups[u.tileId].push(u);
    }

    for (let t = 0; t < 4; t++) {
      const tNodes = tileGroups[t];
      if (tNodes.length === 0) continue;

      const avgTileEnergy = tNodes.reduce((s, n) => s + n.energy, 0) / tNodes.length;
      const effectiveMinE = Math.min(
        this.config.dominantEnergyThreshold,
        avgTileEnergy * 0.90
      );

      // Dynamic score: prioritizes highest residual energy and degree (rotates role every cycle!)
      const scored = tNodes.map(u => {
        const speedPenalty = this.config.enableMobility
          ? Math.sqrt(u.vx * u.vx + u.vy * u.vy) * 120
          : 0;
        const jamPenalty = this.isJammed(u) ? 400 : 0;
        const score = (u.energy * 1.2) + (u.delta * 18) - speedPenalty - jamPenalty;
        return { node: u, score };
      }).sort((a, b) => b.score - a.score);

      const dominants = [];
      const maxDomPerNeighborhood = this.config.dominantPerNeighborhood || 3;

      for (const item of scored) {
        const u = item.node;
        if (u.delta >= this.config.minDelta && u.energy >= effectiveMinE) {
          const domInNeighborhood = dominants.filter(
            d => this.dist(u, d) <= this.config.neighborRadius * 0.95
          ).length;
          if (domInNeighborhood < maxDomPerNeighborhood) {
            u.role = 'DOMINANT';
            dominants.push(u);
          }
        }
      }

      if (dominants.length === 0 && scored.length > 0) {
        const fallback = scored[0].node;
        fallback.role = 'DOMINANT';
        dominants.push(fallback);
      }

      // Elect Tile Sink v_GD with max(Delta_D, E_D)
      let tileSink = dominants[0];
      let bestSinkScore = -Infinity;
      for (const d of dominants) {
        const distToGlobal = this.dist(d, this.globalSink);
        const sScore = d.energy * 1.4 + d.delta * 20 - distToGlobal * 5;
        if (sScore > bestSinkScore) {
          bestSinkScore = sScore;
          tileSink = d;
        }
      }
      tileSink.role = 'TILE_SINK';
      tileSink.parentId = -1;
      this.edges.push({ from: tileSink.id, to: -1, tier: 'GLOBAL' });

      const connectedDoms = [tileSink];
      const remainingDoms = dominants.filter(d => d.id !== tileSink.id)
        .sort((a, b) => this.dist(a, tileSink) - this.dist(b, tileSink));

      for (const d of remainingDoms) {
        let bestParent = tileSink;
        let bestDist = Infinity;
        for (const cd of connectedDoms) {
          const dist = this.dist(d, cd);
          if (dist < bestDist) {
            bestDist = dist;
            bestParent = cd;
          }
        }
        d.parentId = bestParent.id;
        bestParent.childrenIds.push(d.id);
        connectedDoms.push(d);
        this.edges.push({ from: d.id, to: bestParent.id, tier: 'DOMINANT' });
      }
    }

    const allDominants = aliveNodes.filter(
      n => n.role === 'DOMINANT' || n.role === 'TILE_SINK'
    );

    for (const u of aliveNodes) {
      if (u.role !== 'LEAF') continue;
      const candidates = this.config.enableCrossTile
        ? allDominants
        : allDominants.filter(d => d.tileId === u.tileId);

      let chosenParent = null;
      let bestMetric = -Infinity;

      for (const d of candidates) {
        const dist = this.dist(u, d);
        if (dist <= this.config.neighborRadius * 1.35) {
          const metric = (d.energy / this.config.initialEnergy) * 60 - dist * 10;
          if (metric > bestMetric) {
            bestMetric = metric;
            chosenParent = d;
          }
        }
      }

      if (!chosenParent && candidates.length > 0) {
        chosenParent = candidates.reduce((best, cur) =>
          this.dist(u, cur) < this.dist(u, best) ? cur : best
        , candidates[0]);
      }

      if (chosenParent) {
        u.parentId = chosenParent.id;
        chosenParent.childrenIds.push(u.id);
        this.edges.push({
          from: u.id,
          to: chosenParent.id,
          tier: u.tileId !== chosenParent.tileId ? 'CROSS_TILE' : 'LEAF'
        });
      }
    }
  }

  // Static WIRES Baseline (Malhotra et al., 2011): Static BSPT tree + global weight ranking
  buildStaticWIRESTree() {
    this.edges = [];
    const aliveNodes = this.nodes.filter(n => n.alive);
    if (aliveNodes.length === 0) return;

    for (const u of aliveNodes) {
      u.role = 'LEAF';
      u.parentId = null;
      u.childrenIds = [];
    }

    const sorted = [...aliveNodes].sort(
      (a, b) => this.dist(a, this.globalSink) - this.dist(b, this.globalSink)
    );

    const r = this.config.neighborRadius * 1.35;
    const inTree = [];

    for (let i = 0; i < Math.min(8, sorted.length); i++) {
      const rootRelay = sorted[i];
      rootRelay.role = 'TILE_SINK';
      rootRelay.parentId = -1;
      inTree.push(rootRelay);
      this.edges.push({ from: rootRelay.id, to: -1, tier: 'GLOBAL' });
    }

    for (let i = inTree.length; i < sorted.length; i++) {
      const u = sorted[i];
      let bestP = null;
      let bestScore = Infinity;
      for (const p of inTree) {
        const d = this.dist(u, p);
        if (d <= r) {
          const loadScore = p.childrenIds.length * 3.0 + d;
          if (loadScore < bestScore) {
            bestScore = loadScore;
            bestP = p;
          }
        }
      }
      if (!bestP) {
        bestP = inTree.reduce((best, cur) =>
          this.dist(u, cur) < this.dist(u, best) ? cur : best
        , inTree[0]);
      }
      u.parentId = bestP.id;
      bestP.childrenIds.push(u.id);
      if (bestP.role === 'LEAF') bestP.role = 'DOMINANT';
      inTree.push(u);
      this.edges.push({ from: u.id, to: bestP.id, tier: 'LEAF' });
    }
  }

  // Execute one full Convergecast Round (Section 6.2.4 TDMA + Local Collision Model)
  stepRound() {
    const t0 = performance.now();
    this.round++;
    this.transmissions = [];
    this.blockedNodes = [];

    if (this.config.enableMobility) {
      for (const u of this.nodes) {
        if (!u.alive) continue;
        u.x += u.vx;
        u.y += u.vy;
        if (u.x < 0.5 || u.x > this.worldSize - 0.5) u.vx *= -1;
        if (u.y < 0.5 || u.y > this.worldSize - 0.5) u.vy *= -1;
        u.x = Math.max(0.5, Math.min(this.worldSize - 0.5, u.x));
        u.y = Math.max(0.5, Math.min(this.worldSize - 0.5, u.y));
      }
    }

    this.computeNeighborhoods();

    for (const u of this.nodes) {
      u.txFlag = null;
      u.avoidedCollision = false;
      u.sufferedCollision = false;
    }

    const txCost = this.config.energyPerTransmission;
    let transmittedCount = 0;
    let collisionOrAvoidedCount = 0;

    if (this.mode === 'LCAC') {
      // Dynamic Tree Reconstruction every round (Algorithm 4.1 DDS)
      this.runDDSAlgorithm();

      // Section 6.2.4 TDMA + Algorithm 5.2 Dual Semaphore Model:
      // Each node checks both parent_semaphore(P) AND local_semaphore across its full UDG disk r
      const parentSemaphore = new Set();
      const activeTransmitters = [];

      const leaves = this.nodes.filter(n => n.alive && n.role === 'LEAF' && n.parentId !== null);
      leaves.sort(() => Math.random() - 0.5);

      for (const leaf of leaves) {
        const parent = this.nodes[leaf.parentId];
        if (!parent || !parent.alive) {
          leaf.txFlag = false;
          continue;
        }
        if (Math.random() > this.config.transmissionFactor) {
          leaf.txFlag = false;
          continue;
        }

        if (this.isJammed(leaf) || this.isJammed(parent)) {
          leaf.txFlag = false;
          leaf.avoidedCollision = true;
          collisionOrAvoidedCount++;
          this.blockedNodes.push(leaf.id);
          continue;
        }

        // Algorithm 5.2 Dual Semaphore Check over full UDG radius r (Figure 5 & Figure 6)
        const parentBusy = parentSemaphore.has(parent.id);
        const localBusy = activeTransmitters.some(
          txNode =>
            this.dist(txNode, parent) <= this.config.neighborRadius * 1.15 ||
            this.dist(txNode, leaf) <= this.config.neighborRadius * 1.15
        );

        if (!parentBusy && !localBusy) {
          parentSemaphore.add(parent.id);
          activeTransmitters.push(leaf);

          leaf.energy = Math.max(0, leaf.energy - txCost);
          parent.energy = Math.max(0, parent.energy - txCost * 0.35);
          leaf.txFlag = true;
          transmittedCount++;
          this.transmissions.push({
            fromX: leaf.x,
            fromY: leaf.y,
            toX: parent.x,
            toY: parent.y,
            tier: 'LEAF'
          });
        } else {
          // Node senses busy neighborhood or parent semaphore and waits (saving energy & preventing collision!)
          leaf.txFlag = false;
          leaf.avoidedCollision = true;
          collisionOrAvoidedCount++;
          this.blockedNodes.push(leaf.id);
        }
      }

      // Layer 2: Dominants that received child packets aggregate & forward once
      const dominants = this.nodes.filter(n => n.alive && n.role === 'DOMINANT' && n.parentId !== null);
      for (const dom of dominants) {
        const anyChildTx = dom.childrenIds.some(cid => this.nodes[cid] && this.nodes[cid].txFlag === true);
        if (!anyChildTx) continue;
        const parent = this.nodes[dom.parentId];
        if (!parent || !parent.alive || this.isJammed(dom)) continue;

        dom.energy = Math.max(0, dom.energy - txCost);
        parent.energy = Math.max(0, parent.energy - txCost * 0.35);
        dom.txFlag = true;
        transmittedCount++;
        this.transmissions.push({
          fromX: dom.x,
          fromY: dom.y,
          toX: parent.x,
          toY: parent.y,
          tier: 'DOMINANT'
        });
      }

      // Layer 3: Tile Sinks aggregate & forward to Global Sink
      const tileSinks = this.nodes.filter(n => n.alive && n.role === 'TILE_SINK');
      for (const ts of tileSinks) {
        if (this.isJammed(ts)) continue;
        ts.energy = Math.max(0, ts.energy - txCost);
        ts.txFlag = true;
        transmittedCount++;
        this.transmissions.push({
          fromX: ts.x,
          fromY: ts.y,
          toX: this.globalSink.x,
          toY: this.globalSink.y,
          tier: 'GLOBAL'
        });
      }
    } else {
      // Static WIRES Baseline (Figures 14-22):
      // Static tree without DDS dynamic rotation; key dominants/parents get repeatedly drained,
      // and nodes without local semaphore protection experience higher collision & energy slope.
      const aliveWires = this.nodes.filter(n => n.alive && n.parentId !== null);
      aliveWires.sort((a, b) => b.childrenIds.length - a.childrenIds.length);
      const activeSenders = [];

      for (const u of aliveWires) {
        if (Math.random() > this.config.transmissionFactor * 0.85) continue;

        let parent = u.parentId === -1 ? this.globalSink : this.nodes[u.parentId];
        // If static parent died, node attempts emergency long-range re-assoc (draining heavy energy)
        let emergencyPenalty = 1.0;
        if (u.parentId !== -1 && (!parent || !parent.alive)) {
          emergencyPenalty = 2.2;
          parent = this.globalSink;
        }

        const hasCollision = activeSenders.some(
          other => this.dist(other, parent) <= this.config.neighborRadius * 1.15
        ) || this.isJammed(u);

        if (hasCollision) {
          // In WIRES without local semaphore pre-check, collided transmissions still waste energy!
          u.energy = Math.max(0, u.energy - txCost * 0.9 * emergencyPenalty);
          u.sufferedCollision = true;
          collisionOrAvoidedCount++;
          this.blockedNodes.push(u.id);
        } else if (activeSenders.length < Math.max(18, Math.floor(38 - this.round * 0.12))) {
          activeSenders.push(u);
          const roleLoad = u.role === 'TILE_SINK' ? 1.75 : u.role === 'DOMINANT' ? 1.45 : 1.0;
          u.energy = Math.max(0, u.energy - txCost * roleLoad * emergencyPenalty);
          if (parent !== this.globalSink && parent.alive) {
            parent.energy = Math.max(0, parent.energy - txCost * 0.65);
          }
          transmittedCount++;
          this.transmissions.push({
            fromX: u.x,
            fromY: u.y,
            toX: parent.x,
            toY: parent.y,
            tier: u.role === 'TILE_SINK' ? 'GLOBAL' : u.role === 'DOMINANT' ? 'DOMINANT' : 'LEAF'
          });
        }
      }
    }

    for (const u of this.nodes) {
      if (u.alive && u.energy <= this.config.aliveEnergyThreshold) {
        u.alive = false;
        u.role = 'DEAD';
      }
    }

    this.lastExecTimeMs = Math.max(0.2, performance.now() - t0);

    const aliveList = this.nodes.filter(n => n.alive);
    const avgEnergy = this.nodes.reduce((s, n) => s + n.energy, 0) / Math.max(1, this.nodes.length);

    return {
      round: this.round,
      avgResidualEnergy: avgEnergy,
      aliveNodes: aliveList.length,
      transmittedNodes: transmittedCount,
      collisionMetric: collisionOrAvoidedCount,
      execTimeMs: this.lastExecTimeMs
    };
  }
}

window.WSNNetworkInstance = WSNNetworkInstance;
