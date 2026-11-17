/**
 * DDS + LCAC Physical Ad-Hoc WSN Firmware for ESP32 (ESP-NOW)
 * Fulfills Chapter 7.1 "Future Work #1" (p. 93) of Muhuji Mshana's 2012 Master's Thesis:
 * "Dynamic Energy Aware Aggregate Convergecast in a Wireless Sensor Network"
 *
 * Target Hardware: ESP32 / ESP32-S3 / ESP32-C6 (with onboard WS2812 RGB LED)
 * Protocol: Connectionless 2.4 GHz ESP-NOW (Broadcast Discovery + 8-Byte RTS/CTS Semaphores + Aggregate Payload)
 *
 * Onboard RGB LED Color Code (Matches 2012 NetLogo Model):
 *   - Yellow (255, 200, 0) : LeafSet Sensor Node
 *   - Blue   (0, 160, 255) : Dominant Cluster Head (CDS)
 *   - Orange (255, 90, 0)  : Regional Tile Sink (G_D)
 *   - Green  (0, 220, 80)  : Global Sink (v_0)
 *   - Red    (255, 0, 0)   : Semaphore Lock / Collision Avoided
 */

#include <WiFi.h>
#include <esp_now.h>

// ---------------- CONFIGURATION ----------------
#define IS_GLOBAL_SINK       false     // Set true on the central collector board connected to PC USB
#define NODE_ID              101       // Unique ID (1..254), or 0 for Global Sink
#define TILE_ID              1         // Assigned Tile T_i (0..3)
#define INITIAL_ENERGY       1000.0f   // Thesis Table 2/3 default: 1000 units
#define ENERGY_PER_TX        30.0f     // Thesis Table 2/3 default: 30 units
#define MIN_DELTA_THRESHOLD  3         // Minimum 1-hop neighbors to qualify as Dominant
#define MIN_ENERGY_THRESHOLD 350.0f    // Minimum energy to qualify as Dominant
#define RSSI_NEIGHBOR_LIMIT  -72       // Physical SINR/RSSI equivalent of UDG Neighbor-degree-distance r

// Packet Types for Algorithm 5.3 System Flow
enum MsgType : uint8_t {
  MSG_HELLO_DISCOVERY = 1, // Stage 1: Broadcast E_v and Delta_v
  MSG_DDS_ROLE_ANNOUNCE = 2, // Stage 2: Announce DOMINANT or TILE_SINK role
  MSG_SEMAPHORE_RTS = 3,   // Stage 3: 8-byte over-the-air lock (local_semaphore & parent_semaphore)
  MSG_SEMAPHORE_RELEASE = 4,
  MSG_CONVERGECAST_DATA = 5 // Stage 4: Aggregated sensor payload
};

enum NodeRole : uint8_t {
  ROLE_DEAD = 0,
  ROLE_LEAF = 1,
  ROLE_DOMINANT = 2,
  ROLE_TILE_SINK = 3,
  ROLE_GLOBAL_SINK = 4
};

#pragma pack(push, 1)
// Compact 8-Byte Semaphore Control Frame (Solves Section 5.2 Control Overhead on Real Hardware)
struct SemaphoreFrame {
  uint8_t msgType;      // MSG_SEMAPHORE_RTS or MSG_SEMAPHORE_RELEASE
  uint8_t senderId;
  uint8_t parentId;
  uint8_t tileId;
  uint16_t roundNum;
  uint16_t lockDurationMs;
};

// Discovery & Aggregate Convergecast Frame
struct LCACPacket {
  uint8_t msgType;
  uint8_t senderId;
  uint8_t targetParentId;
  uint8_t tileId;
  uint8_t role;
  uint8_t delta;
  uint16_t roundNum;
  float residualEnergy;
  uint8_t aggregatedCount; // Number of merged child readings in this packet
  float aggregatedTempSum; // Example merged sensor reading
};
#pragma pack(pop)

// ---------------- RUNTIME STATE ----------------
struct NeighborEntry {
  uint8_t nodeId;
  uint8_t tileId;
  uint8_t role;
  uint8_t delta;
  float energy;
  int8_t lastRssi;
  uint32_t lastSeenMs;
};

NeighborEntry neighbors[32];
uint8_t neighborCount = 0;

float residualEnergy = INITIAL_ENERGY;
NodeRole currentRole = IS_GLOBAL_SINK ? ROLE_GLOBAL_SINK : ROLE_LEAF;
uint8_t currentParentId = 0;
uint16_t currentRound = 0;

// Algorithm 5.2 Dual Semaphore Flags
volatile bool localSemaphoreLocked = false;
volatile bool parentSemaphoreLocked = false;
volatile uint32_t semaphoreUnlockAtMs = 0;

// Aggregation Buffer
uint8_t rxChildPackets = 0;
float rxTempAccum = 0.0f;

uint8_t broadcastMac[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

void deductEnergy(float factor) {
  if (IS_GLOBAL_SINK) return;
  residualEnergy -= ENERGY_PER_TX * factor;
  if (residualEnergy <= 30.0f) {
    residualEnergy = 0.0f;
    currentRole = ROLE_DEAD;
  }
}

// ESP-NOW Receive Callback
void onDataRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  if (currentRole == ROLE_DEAD || len < 1) return;
  uint8_t mType = data[0];
  int8_t rssi = info->rx_ctrl ? info->rx_ctrl->rssi : -50;

  // Enforce physical UDG / SINR range threshold
  if (rssi < RSSI_NEIGHBOR_LIMIT) return;

  if (mType == MSG_SEMAPHORE_RTS && len == sizeof(SemaphoreFrame)) {
    const SemaphoreFrame *sf = (const SemaphoreFrame *)data;
    // Any 1-hop neighbor locks local_semaphore; siblings sharing parentId lock parent_semaphore
    localSemaphoreLocked = true;
    if (sf->parentId == currentParentId) {
      parentSemaphoreLocked = true;
    }
    semaphoreUnlockAtMs = millis() + sf->lockDurationMs;
    return;
  }

  if (mType == MSG_SEMAPHORE_RELEASE && len == sizeof(SemaphoreFrame)) {
    localSemaphoreLocked = false;
    parentSemaphoreLocked = false;
    return;
  }

  if (len == sizeof(LCACPacket)) {
    const LCACPacket *pkt = (const LCACPacket *)data;
    // Update 1-hop neighbor table
    int idx = -1;
    for (int i = 0; i < neighborCount; i++) {
      if (neighbors[i].nodeId == pkt->senderId) { idx = i; break; }
    }
    if (idx == -1 && neighborCount < 32) {
      idx = neighborCount++;
    }
    if (idx >= 0) {
      neighbors[idx].nodeId = pkt->senderId;
      neighbors[idx].tileId = pkt->tileId;
      neighbors[idx].role = pkt->role;
      neighbors[idx].delta = pkt->delta;
      neighbors[idx].energy = pkt->residualEnergy;
      neighbors[idx].lastRssi = rssi;
      neighbors[idx].lastSeenMs = millis();
    }

    // If packet is addressed to us as Parent, aggregate it!
    if (pkt->msgType == MSG_CONVERGECAST_DATA && pkt->targetParentId == NODE_ID) {
      deductEnergy(0.25f); // RX cost
      rxChildPackets += pkt->aggregatedCount;
      rxTempAccum += pkt->aggregatedTempSum;

      if (IS_GLOBAL_SINK) {
        // Output JSON line over Serial for live Web Dashboard visualization
        Serial.printf(
          "{\"event\":\"rx_sink\",\"round\":%u,\"from\":%u,\"tile\":%u,\"merged_nodes\":%u,\"energy\":%.1f,\"rssi\":%d}\n",
          pkt->roundNum, pkt->senderId, pkt->tileId, pkt->aggregatedCount, pkt->residualEnergy, rssi
        );
      }
    }
  }
}

// Algorithm 4.1: Dynamic Dominating Set (DDS) Election
void runDDS() {
  if (IS_GLOBAL_SINK || currentRole == ROLE_DEAD) return;

  if (neighborCount >= MIN_DELTA_THRESHOLD && residualEnergy >= MIN_ENERGY_THRESHOLD) {
    currentRole = ROLE_DOMINANT;
    // Check if we have highest (Delta, Energy) in our tile -> Become Orange Tile Sink
    bool highestInTile = true;
    for (int i = 0; i < neighborCount; i++) {
      if (neighbors[i].tileId == TILE_ID && neighbors[i].energy > residualEnergy + 15.0f) {
        highestInTile = false;
        break;
      }
    }
    if (highestInTile) currentRole = ROLE_TILE_SINK;
  } else {
    currentRole = ROLE_LEAF;
  }

  // Select best parent (Smart Cross-Tile Routing enabled)
  if (currentRole == ROLE_TILE_SINK) {
    currentParentId = 0; // Global Sink ID
  } else {
    uint8_t bestParent = 0;
    float bestScore = -9999.0f;
    for (int i = 0; i < neighborCount; i++) {
      if (neighbors[i].role == ROLE_DOMINANT || neighbors[i].role == ROLE_TILE_SINK) {
        float score = neighbors[i].energy + neighbors[i].lastRssi * 4.0f;
        if (score > bestScore) {
          bestScore = score;
          bestParent = neighbors[i].nodeId;
        }
      }
    }
    currentParentId = bestParent;
  }
}

// Algorithm 5.2: Send_message(Parent P) with Over-the-Air Dual Semaphore Lock
bool sendMessageWithSemaphore(uint8_t parentId) {
  if (millis() > semaphoreUnlockAtMs) {
    localSemaphoreLocked = false;
    parentSemaphoreLocked = false;
  }

  // Check local_semaphore == False AND parent_semaphore(P) == False
  if (localSemaphoreLocked || parentSemaphoreLocked) {
    Serial.printf("{\"event\":\"semaphore_wait\",\"node\":%u,\"round\":%u}\n", NODE_ID, currentRound);
    return false;
  }

  // 1. Broadcast 8-byte RTS Semaphore Lock
  SemaphoreFrame rts = {MSG_SEMAPHORE_RTS, NODE_ID, parentId, TILE_ID, currentRound, 12};
  esp_now_send(broadcastMac, (uint8_t *)&rts, sizeof(rts));
  delay(2);

  // 2. Transmit Aggregated Convergecast Payload
  LCACPacket pkt = {
    MSG_CONVERGECAST_DATA,
    NODE_ID,
    parentId,
    TILE_ID,
    (uint8_t)currentRole,
    neighborCount,
    currentRound,
    residualEnergy,
    (uint8_t)(1 + rxChildPackets),
    24.5f + rxTempAccum
  };
  esp_now_send(broadcastMac, (uint8_t *)&pkt, sizeof(pkt));
  deductEnergy(1.0f);

  // 3. Release Semaphore
  SemaphoreFrame rel = {MSG_SEMAPHORE_RELEASE, NODE_ID, parentId, TILE_ID, currentRound, 0};
  esp_now_send(broadcastMac, (uint8_t *)&rel, sizeof(rel));

  rxChildPackets = 0;
  rxTempAccum = 0.0f;
  return true;
}

void setup() {
  Serial.begin(115200);
  WiFi.mode(WIFI_STA);
  if (esp_now_init() != ESP_OK) {
    Serial.println("{\"error\":\"ESP-NOW init failed\"}");
    return;
  }
  esp_now_register_recv_cb(onDataRecv);

  esp_now_peer_info_t peerInfo = {};
  memcpy(peerInfo.peer_addr, broadcastMac, 6);
  peerInfo.channel = 0;
  peerInfo.encrypt = false;
  esp_now_add_peer(&peerInfo);

  Serial.printf("{\"status\":\"boot\",\"node\":%u,\"tile\":%u,\"role\":%u}\n", NODE_ID, TILE_ID, currentRole);
}

void loop() {
  if (IS_GLOBAL_SINK || currentRole == ROLE_DEAD) {
    delay(250);
    return;
  }

  currentRound++;

  // Stage 1: Broadcast E and Delta to neighbors
  LCACPacket hello = {
    MSG_HELLO_DISCOVERY, NODE_ID, currentParentId, TILE_ID,
    (uint8_t)currentRole, neighborCount, currentRound, residualEnergy, 1, 24.5f
  };
  esp_now_send(broadcastMac, (uint8_t *)&hello, sizeof(hello));
  delay(120 + (NODE_ID % 40));

  // Stage 2: Run DDS Algorithm
  runDDS();
  delay(80);

  // Stage 3 & 4: Run LCAC Algorithm with Dual Semaphore Lock
  sendMessageWithSemaphore(currentParentId);

  Serial.printf(
    "{\"event\":\"round_done\",\"node\":%u,\"round\":%u,\"role\":%u,\"energy\":%.1f,\"delta\":%u,\"parent\":%u}\n",
    NODE_ID, currentRound, currentRole, residualEnergy, neighborCount, currentParentId
  );

  delay(800);
}
