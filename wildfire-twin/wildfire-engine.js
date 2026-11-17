/**
 * Real-World Wildfire Early-Warning & Canopy Digital Twin Engine
 * Applies Muhuji Mshana's 2012 Carleton Thesis (DDS + LCAC Algorithms)
 * to a dynamic forest wildfire monitoring & self-healing emergency mesh.
 */

class WildfireMeshInstance {
  constructor(mode, config) {
    this.mode = mode; // 'LCAC' or 'WIRES'
    this.config = { ...config };
    this.worldSize = 40; // 40km x 40km (4 sectors of 20x20)
    this.nodes = [];
    this.edges = [];
    this.transmissions = [];
    this.fires = [];      // {x, y, flameR, smokeR, active}
    this.retardants = []; // {x, y, r, ttl}
    this.ridges = [];     // [{x1, y1, x2, y2}] Granite terrain obstacles blocking RF
    this.round = 0;
    this.totalEmergencyAlertsDelivered = 0;
    this.roundEmergencyAlerts = 0;
    this.collisionsOrDrops = 0;
    this.orphanedLiveNodes = 0;
  }

  initFromSharedState(positions, ridges, initialFires, config) {
    this.config = { ...config };
    this.round = 0;
    this.totalEmergencyAlertsDelivered = 0;
    this.roundEmergencyAlerts = 0;
    this.collisionsOrDrops = 0;
    this.orphanedLiveNodes = 0;
    this.edges = [];
    this.transmissions = [];
    this.retardants = [];

    this.ridges = ridges.map(r => ({ ...r }));
    this.fires = initialFires.map(f => ({ ...f }));

    this.globalSink = {
      id: -1,
      x: this.worldSize / 2,
      y: this.worldSize / 2,
      role: 'COMMAND_TOWER'
    };

    this.nodes = positions.map((p, idx) => ({
      id: idx,
      x: p.x,
      y: p.y,
      tileId: this.getTileId(p.x, p.y),
      energy: this.config.initialEnergy,
      alive: true,
      burned: false,
      orphaned: false,
      inAlertZone: false,
      tempC: 24.0,
      role: 'LEAF',
      delta: 0,
      neighbors: [],
      parentId: null,
      childrenIds: [],
      txFlag: false,
      avoidedCollision: false,
      sufferedCollision: false
    }));

    this.updateEnvironmentAndNeighborhoods();
    if (this.mode === 'WIRES') {
      this.buildStaticWIRESTree();
    } else {
      this.runWildfireDDS();
    }
  }

  getTileId(x, y) {
    const half = this.worldSize / 2;
    const col = x < half ? 0 : 1;
    const row = y < half ? 0 : 1;
    return row * 2 + col;
  }

  dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // Line-segment intersection for Granite Ridge RF Shadowing
  segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const ccw = (p1x, p1y, p2x, p2y, p3x, p3y) =>
      (p3y - p1y) * (p2x - p1x) > (p2y - p1y) * (p3x - p1x);
    return (
      ccw(ax, ay, cx, cy, dx, dy) !== ccw(bx, by, cx, cy, dx, dy) &&
      ccw(ax, ay, bx, by, cx, cy) !== ccw(ax, ay, bx, by, dx, dy)
    );
  }

  isBlockedByRidge(u, v) {
    if (!this.config.enableTerrainObstruction) return false;
    for (const r of this.ridges) {
      if (this.segmentsIntersect(u.x, u.y, v.x, v.y, r.x1, r.y1, r.x2, r.y2)) {
        return true;
      }
    }
    return false;
  }

  // Advance wildfire spread based on wind speed & direction
  stepFirePhysics() {
    const windRad = (this.config.windDirectionDeg * Math.PI) / 180;
    const driftSpeed = (this.config.windSpeedKmh / 100) * 0.28;
    const dx = Math.cos(windRad) * driftSpeed;
    const dy = Math.sin(windRad) * driftSpeed;
    const spreadRate = 0.045 * (this.config.fireSpreadMultiplier || 1.0);

    for (const f of this.fires) {
      if (!f.active) continue;
      f.x = Math.max(2, Math.min(this.worldSize - 2, f.x + dx));
      f.y = Math.max(2, Math.min(this.worldSize - 2, f.y + dy));
      f.flameR = Math.min(11.5, f.flameR + spreadRate);
      f.smokeR = f.flameR * 1.65 + 1.5;

      // Check if retardant cools this fire
      for (const ret of this.retardants) {
        if (this.dist(f, ret) <= ret.r + f.flameR * 0.6) {
          f.flameR = Math.max(0.8, f.flameR - 0.18);
          f.smokeR = f.flameR * 1.5 + 1.0;
        }
      }
    }

    // Decay retardant drops
    for (const ret of this.retardants) {
      ret.ttl--;
    }
    this.retardants = this.retardants.filter(r => r.ttl > 0);
  }

  updateEnvironmentAndNeighborhoods() {
    // 1. Update node temperatures, alert states, and thermal destruction
    for (const u of this.nodes) {
      if (!u.alive) continue;
      u.inAlertZone = false;
      u.tempC = 24.0;

      for (const f of this.fires) {
        if (!f.active) continue;
        const d = this.dist(u, f);
        if (d <= f.flameR) {
          // Direct flame front destroys the sensor mote!
          u.tempC = 450.0;
          u.alive = false;
          u.burned = true;
          u.role = 'BURNED';
          break;
        } else if (d <= f.smokeR) {
          // Inside smoke / pre-heat warning plume -> High-Urgency Alert State!
          u.inAlertZone = true;
          const heatRatio = 1 - (d - f.flameR) / Math.max(0.5, f.smokeR - f.flameR);
          u.tempC = Math.max(u.tempC, 48.0 + heatRatio * 140.0);
        }
      }
    }

    // 2. Compute UDG neighborhoods with terrain ridge blocking & optional AI range boost
    const baseR = this.config.neighborRadius;
    const effectiveR = (this.mode === 'LCAC' && this.config.enableAIDDS) ? baseR * 1.25 : baseR;

    for (let i = 0; i < this.nodes.length; i++) {
      const u = this.nodes[i];
      u.neighbors = [];
      u.delta = 0;
      if (!u.alive) continue;
      for (let j = 0; j < this.nodes.length; j++) {
        if (i === j) continue;
        const v = this.nodes[j];
        if (!v.alive) continue;
        if (!this.config.enableCrossTile && this.mode === 'LCAC' && u.tileId !== v.tileId) {
          continue;
        }
        if (this.dist(u, v) <= effectiveR && !this.isBlockedByRidge(u, v)) {
          u.neighbors.push(v.id);
        }
      }
      u.delta = u.neighbors.length;
    }
  }

  // Algorithm 4.1: Hazard-Aware Dynamic Dominating Set (DDS)
  runWildfireDDS() {
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

    const baseR = this.config.neighborRadius;
    const effectiveR = this.config.enableAIDDS ? baseR * 1.32 : baseR;

    for (let t = 0; t < 4; t++) {
      const tNodes = tileGroups[t];
      if (tNodes.length === 0) continue;

      const avgE = tNodes.reduce((s, n) => s + n.energy, 0) / tNodes.length;
      const effMinE = avgE * 0.80;
      const effMinDelta = this.config.enableAIDDS
        ? Math.max(2, this.config.minDelta - 1)
        : this.config.minDelta;

      // Hazard-aware DDS score: prefers high residual energy, high degree, and safe distance from flame core
      const scored = tNodes.map(u => {
        const thermalPenalty = u.inAlertZone ? 90 : 0;
        const score = u.energy * 1.25 + u.delta * 20 - thermalPenalty;
        return { node: u, score };
      }).sort((a, b) => b.score - a.score);

      const dominants = [];
      for (const item of scored) {
        const u = item.node;
        if (u.delta >= effMinDelta && u.energy >= effMinE) {
          const nearDoms = dominants.filter(d => this.dist(u, d) <= effectiveR * 0.85).length;
          if (nearDoms < 3) {
            u.role = 'DOMINANT';
            dominants.push(u);
          }
        }
      }

      if (dominants.length === 0 && scored.length > 0) {
        scored[0].node.role = 'DOMINANT';
        dominants.push(scored[0].node);
      }

      // Elect Sector Hub (Orange Tile Sink) with clear line-of-sight to Command Tower if possible
      let tileSink = dominants[0];
      let bestSinkScore = -Infinity;
      for (const d of dominants) {
        const blockedToGlobal = this.isBlockedByRidge(d, this.globalSink) ? 350 : 0;
        const sScore = d.energy * 1.4 + d.delta * 22 - this.dist(d, this.globalSink) * 6 - blockedToGlobal;
        if (sScore > bestSinkScore) {
          bestSinkScore = sScore;
          tileSink = d;
        }
      }
      tileSink.role = 'TILE_SINK';
      tileSink.parentId = -1;
      this.edges.push({ from: tileSink.id, to: -1, tier: 'GLOBAL' });

      const connected = [tileSink];
      const rem = dominants.filter(d => d.id !== tileSink.id)
        .sort((a, b) => this.dist(a, tileSink) - this.dist(b, tileSink));

      for (const d of rem) {
        let bestP = tileSink;
        let bestDist = Infinity;
        for (const c of connected) {
          if (this.isBlockedByRidge(d, c)) continue;
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

    // Bind Leaf Nodes (Smart Cross-Sector Routing rescues sensors cut off by fire or ridges!)
    const allDominants = aliveNodes.filter(n => n.role === 'DOMINANT' || n.role === 'TILE_SINK');
    for (const u of aliveNodes) {
      if (u.role !== 'LEAF') continue;
      const candidates = this.config.enableCrossTile
        ? allDominants
        : allDominants.filter(d => d.tileId === u.tileId);

      let chosen = null;
      let bestScore = -Infinity;
      for (const d of candidates) {
        if (this.isBlockedByRidge(u, d)) continue;
        const dist = this.dist(u, d);
        if (dist <= effectiveR * 1.45) {
          const score = (d.energy / this.config.initialEnergy) * 60 - dist * 10;
          if (score > bestScore) {
            bestScore = score;
            chosen = d;
          }
        }
      }

      if (!chosen && candidates.length > 0) {
        const unblocked = candidates.filter(d => !this.isBlockedByRidge(u, d));
        const pool = unblocked.length > 0 ? unblocked : candidates;
        chosen = pool.reduce((b, c) => (this.dist(u, c) < this.dist(u, b) ? c : b), pool[0]);
      }

      if (chosen && this.dist(u, chosen) <= effectiveR * 1.85) {
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

  // Static WIRES Baseline: Built once at initialization; never re-elects burned hubs!
  buildStaticWIRESTree() {
    this.edges = [];
    const alive = this.nodes.filter(n => n.alive);
    if (alive.length === 0) return;

    const sorted = [...alive].sort((a, b) => this.dist(a, this.globalSink) - this.dist(b, this.globalSink));
    const inTree = [];
    for (let i = 0; i < Math.min(6, sorted.length); i++) {
      sorted[i].role = 'TILE_SINK';
      sorted[i].parentId = -1;
      inTree.push(sorted[i]);
      this.edges.push({ from: sorted[i].id, to: -1, tier: 'GLOBAL' });
    }

    for (let i = inTree.length; i < sorted.length; i++) {
      const u = sorted[i];
      let bestP = inTree[0];
      let bestScore = Infinity;
      for (const p of inTree) {
        const d = this.dist(u, p);
        const ridgePenalty = this.isBlockedByRidge(u, p) ? 50 : 0;
        const score = p.childrenIds.length * 3.2 + d + ridgePenalty;
        if (score < bestScore) {
          bestScore = score;
          bestP = p;
        }
      }
      u.parentId = bestP.id;
      bestP.childrenIds.push(u.id);
      if (bestP.role === 'LEAF') bestP.role = 'DOMINANT';
      inTree.push(u);
      this.edges.push({ from: u.id, to: bestP.id, tier: 'LEAF' });
    }
  }

  hasLiveAncestorPath(u) {
    let curr = u;
    let hops = 0;
    while (curr && curr.parentId !== -1 && hops < 25) {
      if (curr.parentId === null) return false;
      const p = this.nodes[curr.parentId];
      if (!p || !p.alive || this.isBlockedByRidge(curr, p)) return false;
      curr = p;
      hops++;
    }
    return curr !== null && curr.alive;
  }

  stepRound() {
    this.round++;
    this.transmissions = [];
    this.roundEmergencyAlerts = 0;
    this.collisionsOrDrops = 0;

    this.stepFirePhysics();
    this.updateEnvironmentAndNeighborhoods();

    for (const u of this.nodes) {
      u.txFlag = false;
      u.avoidedCollision = false;
      u.sufferedCollision = false;
    }

    const txCost = this.config.energyPerTransmission;

    if (this.mode === 'LCAC') {
      // Self-heal routing tree every round around burned nodes & ridges!
      this.runWildfireDDS();

      const parentSemaphore = new Set();
      const activeTx = [];

      // Prioritize emergency smoke/heat alert sensors first!
      const leaves = this.nodes.filter(n => n.alive && !n.orphaned && n.role === 'LEAF' && n.parentId !== null);
      leaves.sort((a, b) => (b.inAlertZone ? 1 : 0) - (a.inAlertZone ? 1 : 0));

      for (const leaf of leaves) {
        const txProb = leaf.inAlertZone ? 0.92 : 0.14;
        if (Math.random() > txProb) continue;

        const parent = this.nodes[leaf.parentId];
        if (!parent || !parent.alive) continue;

        const parentBusy = parentSemaphore.has(parent.id);
        const localBusy = activeTx.some(
          t => this.dist(t, parent) <= this.config.neighborRadius * 0.95
        );

        if (!parentBusy && !localBusy) {
          parentSemaphore.add(parent.id);
          activeTx.push(leaf);
          leaf.energy = Math.max(0, leaf.energy - txCost * 0.7);
          parent.energy = Math.max(0, parent.energy - txCost * 0.25);
          leaf.txFlag = true;

          if (leaf.inAlertZone) {
            this.roundEmergencyAlerts++;
            this.totalEmergencyAlertsDelivered++;
          }

          this.transmissions.push({
            fromX: leaf.x,
            fromY: leaf.y,
            toX: parent.x,
            toY: parent.y,
            urgent: leaf.inAlertZone,
            tier: 'LEAF'
          });
        } else {
          leaf.avoidedCollision = true;
          this.collisionsOrDrops++;
        }
      }

      // Layer 2: Dominants aggregate & forward
      const doms = this.nodes.filter(n => n.alive && n.role === 'DOMINANT' && n.parentId !== null);
      for (const dom of doms) {
        const childSent = dom.childrenIds.some(cid => this.nodes[cid] && this.nodes[cid].txFlag);
        if (!childSent && !dom.inAlertZone) continue;
        const parent = this.nodes[dom.parentId];
        if (!parent || !parent.alive) continue;

        dom.energy = Math.max(0, dom.energy - txCost * 0.85);
        parent.energy = Math.max(0, parent.energy - txCost * 0.3);
        dom.txFlag = true;
        if (dom.inAlertZone) {
          this.roundEmergencyAlerts++;
          this.totalEmergencyAlertsDelivered++;
        }
        this.transmissions.push({
          fromX: dom.x,
          fromY: dom.y,
          toX: parent.x,
          toY: parent.y,
          urgent: dom.inAlertZone,
          tier: 'DOMINANT'
        });
      }

      // Layer 3: Sector Hubs (Tile Sinks) -> Central Command Tower
      const sinks = this.nodes.filter(n => n.alive && n.role === 'TILE_SINK');
      for (const ts of sinks) {
        ts.energy = Math.max(0, ts.energy - txCost * 0.95);
        ts.txFlag = true;
        this.transmissions.push({
          fromX: ts.x,
          fromY: ts.y,
          toX: this.globalSink.x,
          toY: this.globalSink.y,
          urgent: true,
          tier: 'GLOBAL'
        });
      }
    } else {
      // Static WIRES Baseline:
      // Any sensor whose static ancestor was burned by the wildfire or exhausted battery is ORPHANED!
      const activeSenders = [];
      for (const u of this.nodes) {
        if (!u.alive) continue;
        u.orphaned = !this.hasLiveAncestorPath(u);
        if (u.orphaned) {
          // Node still tries to beacon for its dead parent, wasting battery & dropping emergency alerts!
          if (u.inAlertZone) {
            u.energy = Math.max(0, u.energy - txCost * 0.8);
            this.collisionsOrDrops++;
          }
          continue;
        }

        const txProb = u.inAlertZone ? 0.92 : 0.18;
        if (Math.random() > txProb) continue;

        const parent = u.parentId === -1 ? this.globalSink : this.nodes[u.parentId];
        const hasCollision = activeSenders.some(
          s => this.dist(s, parent) <= this.config.neighborRadius * 1.1
        );

        const roleLoad = u.role === 'TILE_SINK' ? 1.8 : u.role === 'DOMINANT' ? 1.45 : 1.0;
        u.energy = Math.max(0, u.energy - txCost * roleLoad);

        if (hasCollision) {
          u.sufferedCollision = true;
          this.collisionsOrDrops++;
        } else {
          activeSenders.push(u);
          if (u.inAlertZone) {
            this.roundEmergencyAlerts++;
            this.totalEmergencyAlertsDelivered++;
          }
          this.transmissions.push({
            fromX: u.x,
            fromY: u.y,
            toX: parent.x,
            toY: parent.y,
            urgent: u.inAlertZone,
            tier: u.role === 'TILE_SINK' ? 'GLOBAL' : 'LEAF'
          });
        }
      }
    }

    for (const u of this.nodes) {
      if (u.alive && u.energy <= 25) {
        u.alive = false;
        u.role = 'DEAD';
      }
    }

    const aliveNodes = this.nodes.filter(n => n.alive);
    const connectedLiveNodes = aliveNodes.filter(n => !n.orphaned);
    this.orphanedLiveNodes = aliveNodes.length - connectedLiveNodes.length;
    const avgBatteryPct =
      (this.nodes.reduce((s, n) => s + n.energy, 0) / (this.nodes.length * this.config.initialEnergy)) * 100;

    return {
      round: this.round,
      totalAlerts: this.totalEmergencyAlertsDelivered,
      roundAlerts: this.roundEmergencyAlerts,
      functionalSensors: connectedLiveNodes.length,
      orphanedSensors: this.orphanedLiveNodes,
      burnedSensors: this.nodes.filter(n => n.burned).length,
      avgBatteryPct,
      collisionsOrDrops: this.collisionsOrDrops
    };
  }
}

window.WildfireMeshInstance = WildfireMeshInstance;
