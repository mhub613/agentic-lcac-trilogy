# Agentic LCAC Trilogy: Dynamic Energy Aware Convergecast in Wireless Sensor Networks

> **From a 2012 Carleton University Master's Thesis (NetLogo) to a 2026 Simulation Trilogy (`Sim-A`, `Sim-B`, `Sim-C`), Google ADK Multi-Agent Swarm, Programmatic Video Suite, and ESP32 Physical Ad-Hoc Mesh.**

- **Author:** Muhuji Mshana (Master of Computer Science, School of Computer Science, Carleton University, Ottawa, Canada, September 2012)
- **ISBN:** `978-0-494-93629-0`
- **Carleton Scholaris Archive:** [https://carleton.scholaris.ca/items/2f83b153-fbd1-4eb2-a899-78365beb5f96](https://carleton.scholaris.ca/items/2f83b153-fbd1-4eb2-a899-78365beb5f96)
- **Built with:** Google AntiGravity + Google Agent Development Kit (ADK) + Gemini

---

## Overview

In 2012, the **Dynamic Dominating Set (DDS)** and **Local Collision Aware Convergecast (LCAC)** algorithms were introduced to solve the joint convergecast optimization problem in Wireless Sensor Networks (WSNs): minimizing schedule latency, eliminating primary and secondary packet collisions without global synchronization, and rotating relay roles to prevent battery burnout.

This repository provides the complete open-source implementation and modernization of the DDS–LCAC framework across a **Three-Generation Simulation Trilogy**, alongside embedded firmware, headless benchmark suites, and mathematical animations.

---

## The Three-Generation Simulation Trilogy (`Sim-A` $\to$ `Sim-B` $\to$ `Sim-C`)

| Simulation Tier | Directory | Paradigm & Architecture |
| :--- | :--- | :--- |
| **`Sim-A`: Legacy NetLogo Benchmark** | [`web-simulator/`](./web-simulator/) | **2012 Exact Replication:** 60 FPS pure JavaScript engine with all 10 original NetLogo sliders/inputs, comparing **DDS + LCAC** vs. **Static WIRES (2011)** on an idealized 4-tile UDG plane with 4 live telemetry charts. |
| **`Sim-B`: Wildfire Digital Twin** | [`wildfire-twin/`](./wildfire-twin/) | **Real-World Hazard Scenario:** Dynamic wind-driven wildfire fronts, thermal node destruction ($>300^\circ\text{C}$), smoke plume urgency ($>48^\circ\text{C}$), and granite RF barriers with 1-tick topological self-healing. |
| **`Sim-C`: Agentic AI-DDS Swarm** | [`agentic-simc/`](./agentic-simc/) | **Cognitive Multi-Agent Control:** 1 `GlobalSinkCoordinator` + 4 parallel `TileOrchestratorAgents` (`google-adk`) + 800 `SensorMicroAgents` dynamically tuning $(r_i, l_i, \text{min\_E}_i)$ per tile using live Gemini models. |

---

## Repository Structure

```text
agentic-lcac-trilogy/
├── README.md                                  # Repository overview, architecture, & quickstart
├── .gitignore                                 # Clean git ignore for Python, keys, and builds
├── .env.example                               # Environment template for Gemini API key
├── web-simulator/                             # Sim-A: 2012 NetLogo Benchmark Simulator
│   ├── index.html                             # Dual-view canvas interface
│   ├── styles.css                             # NetLogo retro-modern UI theme
│   ├── sim-engine.js                          # DDS & LCAC core mathematical engine
│   └── app.js                                 # Event handling & chart synchronization
├── wildfire-twin/                             # Sim-B: Real-World Wildfire Early-Warning Twin
│   ├── index.html                             # Wildfire dashboard
│   ├── styles.css                             # Hazard visual styling
│   ├── wildfire-engine.js                     # Smoke, fire propagation & RF barrier physics
│   └── app.js                                 # Telemetry stream & self-healing controls
├── agentic-simc/                              # Sim-C: Google ADK Multi-Agent AI-DDS
│   ├── server.py                              # Python HTTP + ADK Gemini Orchestrator server
│   ├── adk_agents.py                          # Google ADK agent declarations & tool contracts
│   ├── index.html                             # CanopyPulse UI + Mission Commander
│   ├── styles.css                             # Amazon rainforest theme
│   ├── agentic-engine.js                      # 800-mote physics & A2A protocol simulation
│   └── app.js                                 # Token economy profiler & live tool stream
├── benchmarks/                                # Headless Python Monte Carlo Benchmark Suite
│   ├── run_experiments.py                     # Headless Monte Carlo benchmark runner
│   ├── results/                               # Generated CSV datasets & benchmark reports
│   └── results/BENCHMARK_REPORT.md            # Formatted performance comparison table
├── animations/                                # Manim (3Blue1Brown engine) Mathematical Animations
│   └── dds_lcac_manim.py                      # Renders UDG tiles, DDS tree growth, Dual Semaphores
└── hardware-esp32/                            # Physical Ad-Hoc Mesh Firmware (ESP32 / ESP-NOW)
    └── lcac_node_firmware/
        └── lcac_node_firmware.ino             # 8-byte over-the-air RTS/CTS semaphores + JSON telemetry
```

---

## Quick Start: Running the Simulators Locally

All simulation tiers are self-contained and run locally in any modern browser:

### 1. Launch `Sim-A` (2012 NetLogo Exact Benchmark)
```powershell
python -m http.server 8080 --directory web-simulator
# Open http://localhost:8080 in your browser
```

### 2. Launch `Sim-B` (Wildfire Early-Warning Digital Twin)
```powershell
python -m http.server 8085 --directory wildfire-twin
# Open http://localhost:8085 in your browser
```

### 3. Launch `Sim-C` (Google ADK Multi-Agent AI-DDS Swarm)
```powershell
python agentic-simc/server.py
# Open http://localhost:8090 in your browser
# Optional: Paste your Gemini API key in the top bar to run live Gemini model orchestration!
```

---

## Headless Monte Carlo Benchmarks

To reproduce the multi-seed sweep comparing **Static WIRES**, **2012 DDS+LCAC**, **Smart Cross-Tile (`DDS-XR`)**, and **Agentic AI-DDS (`Sim-C`)**:

```powershell
python benchmarks/run_experiments.py
```

Results are exported to `benchmarks/results/benchmark_summary.csv` and `benchmarks/results/BENCHMARK_REPORT.md`.

---

## Physical Hardware Firmware (ESP32 / ESP-NOW)

The `hardware-esp32/lcac_node_firmware/` directory provides compilable C++ firmware for Espressif **ESP32-C6 / ESP32-S3** microcontrollers.

Instead of heavy Wi-Fi association handshakes, it implements LCAC's `local_semaphore` and `parent_semaphore(P)` using connectionless 8-byte **ESP-NOW RTS/CTS MAC frames**:
```
+---------------+---------------+---------------+---------------+
| MSG_TYPE (1B) | SENDER_ID(1B) | PARENT_ID(1B) |  TILE_ID (1B) |
+---------------+---------------+---------------+---------------+
|  SEQ_NUM (1B) |    TTL (1B)   | E_RES_HI (1B) | E_RES_LO (1B) |
+---------------+---------------+---------------+---------------+
```
Resolves channel mutex locks in $<3\text{ ms}$ with $<4.8\%$ MAC airtime overhead.

---

## Mathematical Vector Animations (Manim)

To render the programmatic 3Blue1Brown-style Manim animations of DDS dominating set tree growth and dual-semaphore packet scheduling:

```powershell
pip install manim
manim -pql animations/dds_lcac_manim.py LCACConvergecastScene
```

---

## Citation

```bibtex
@article{mshana2026agentic_lcac,
  author    = {Muhuji Mshana},
  title     = {Agentic LCAC Trilogy: Dynamic Energy Aware Aggregate Convergecast in Wireless Sensor Networks},
  journal   = {Technical Preprint},
  year      = {2026},
  url       = {https://github.com/mhub613/agentic-lcac-trilogy},
  note      = {Extends 2012 Carleton University Master's Thesis, ISBN 978-0-494-93629-0}
}

@mastersthesis{mshana2012dynamic,
  author       = {Muhuji Mshana},
  title        = {Dynamic Energy Aware Aggregate Convergecast in a Wireless Sensor Network},
  school       = {School of Computer Science, Carleton University},
  address      = {Ottawa, Ontario, Canada},
  year         = {2012},
  month        = {September},
  isbn         = {978-0-494-93629-0},
  url          = {https://carleton.scholaris.ca/items/2f83b153-fbd1-4eb2-a899-78365beb5f96}
}
```
