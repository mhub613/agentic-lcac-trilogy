# Reproducible Benchmark Results: 2012 DDS+LCAC vs. Static WIRES vs. 2026 DDS-XR+LCAC

> **Note on Collision Metric Column:** As defined in Thesis Section 6.2.4 (Figures 14d–22d), for **WIRES** this column reports *Nodes Suffering Collision* (corrupted packets), whereas for **DDS_LCAC** and **DDS_XR_LCAC** it reports *Nodes Sensed & Avoided Collision* via the Dual Semaphore Model (`local_semaphore` and `parent_semaphore`).

| Suite | Protocol | Nodes/Tile ($k$) | Radius ($r$) | Final Avg Energy | Final Alive Nodes (%) | Avg TX/Round | Avoided (LCAC) / Collided (WIRES) | Schedule Cost Index |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `Table2_Density` | **WIRES** | 100 ($N=400$) | 4.0 | 11.5 units | 7 / 400 (1.8%) | 19.7 | 25.9 | 5379.0 |
| `Table2_Density` | **DDS_LCAC** | 100 ($N=400$) | 4.0 | 23.5 units | 58 / 400 (14.5%) | 49.2 | 34.4 | 1048.0 |
| `Table2_Density` | **DDS_XR_LCAC** | 100 ($N=400$) | 4.0 | 15.8 units | 7 / 400 (1.8%) | 49.5 | 27.0 | 1048.0 |
| `Table2_Density` | **WIRES** | 150 ($N=600$) | 4.0 | 88.3 units | 128 / 600 (21.3%) | 22.7 | 46.9 | 9963.0 |
| `Table2_Density` | **DDS_LCAC** | 150 ($N=600$) | 4.0 | 38.4 units | 263 / 600 (43.8%) | 72.3 | 66.3 | 1887.0 |
| `Table2_Density` | **DDS_XR_LCAC** | 150 ($N=600$) | 4.0 | 13.6 units | 0 / 600 (0.0%) | 74.1 | 54.1 | 1887.0 |
| `Table2_Density` | **WIRES** | 200 ($N=800$) | 4.0 | 172.6 units | 280 / 800 (35.0%) | 23.0 | 67.4 | 15428.0 |
| `Table2_Density` | **DDS_LCAC** | 200 ($N=800$) | 4.0 | 196.3 units | 799 / 800 (99.9%) | 80.4 | 106.1 | 2864.0 |
| `Table2_Density` | **DDS_XR_LCAC** | 200 ($N=800$) | 4.0 | 58.8 units | 593 / 800 (74.1%) | 94.0 | 100.8 | 2864.0 |
| `Table2_Density` | **WIRES** | 250 ($N=1000$) | 4.0 | 258.9 units | 448 / 1000 (44.8%) | 23.0 | 82.8 | 21657.0 |
| `Table2_Density` | **DDS_LCAC** | 250 ($N=1000$) | 4.0 | 291.5 units | 1000 / 1000 (100.0%) | 88.5 | 142.0 | 3959.0 |
| `Table2_Density` | **DDS_XR_LCAC** | 250 ($N=1000$) | 4.0 | 175.0 units | 999 / 1000 (99.9%) | 102.9 | 137.6 | 3959.0 |
| `Table3_DegreeRadius` | **WIRES** | 200 ($N=800$) | 2.0 | 494.3 units | 472 / 800 (59.0%) | 23.0 | 19.2 | 12926.0 |
| `Table3_DegreeRadius` | **DDS_LCAC** | 200 ($N=800$) | 2.0 | 190.2 units | 787 / 800 (98.4%) | 81.0 | 109.1 | 2517.0 |
| `Table3_DegreeRadius` | **DDS_XR_LCAC** | 200 ($N=800$) | 2.0 | 153.4 units | 777 / 800 (97.1%) | 84.7 | 108.4 | 2517.0 |
| `Table3_DegreeRadius` | **WIRES** | 200 ($N=800$) | 3.0 | 346.8 units | 391 / 800 (48.9%) | 23.0 | 41.1 | 14177.0 |
| `Table3_DegreeRadius` | **DDS_LCAC** | 200 ($N=800$) | 3.0 | 19.6 units | 103 / 800 (12.9%) | 97.9 | 70.1 | 2691.0 |
| `Table3_DegreeRadius` | **DDS_XR_LCAC** | 200 ($N=800$) | 3.0 | 14.0 units | 0 / 800 (0.0%) | 98.4 | 55.2 | 2691.0 |
| `Table3_DegreeRadius` | **WIRES** | 200 ($N=800$) | 4.0 | 172.6 units | 280 / 800 (35.0%) | 23.0 | 67.4 | 15428.0 |
| `Table3_DegreeRadius` | **DDS_LCAC** | 200 ($N=800$) | 4.0 | 196.3 units | 799 / 800 (99.9%) | 80.4 | 106.1 | 2864.0 |
| `Table3_DegreeRadius` | **DDS_XR_LCAC** | 200 ($N=800$) | 4.0 | 59.6 units | 603 / 800 (75.4%) | 93.9 | 100.9 | 2864.0 |
| `Table3_DegreeRadius` | **WIRES** | 200 ($N=800$) | 5.0 | 52.2 units | 150 / 800 (18.8%) | 21.5 | 88.8 | 16678.0 |
| `Table3_DegreeRadius` | **DDS_LCAC** | 200 ($N=800$) | 5.0 | 409.7 units | 800 / 800 (100.0%) | 59.3 | 123.7 | 3038.0 |
| `Table3_DegreeRadius` | **DDS_XR_LCAC** | 200 ($N=800$) | 5.0 | 297.9 units | 800 / 800 (100.0%) | 70.4 | 119.3 | 3038.0 |
| `Table3_DegreeRadius` | **WIRES** | 200 ($N=800$) | 6.0 | 21.7 units | 79 / 800 (9.9%) | 18.6 | 100.3 | 17929.0 |
| `Table3_DegreeRadius` | **DDS_LCAC** | 200 ($N=800$) | 6.0 | 541.3 units | 800 / 800 (100.0%) | 46.3 | 135.0 | 3211.0 |
| `Table3_DegreeRadius` | **DDS_XR_LCAC** | 200 ($N=800$) | 6.0 | 458.0 units | 800 / 800 (100.0%) | 54.6 | 131.8 | 3211.0 |
