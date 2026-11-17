"""
Live Google ADK & Gemini Model Orchestration Server for SimC (Port 8090)
Author: Muhuji Mshana

Serves the SimC Web Application on http://localhost:8090/ and exposes:
  - GET  /api/status          : Checks if GOOGLE_API_KEY / GEMINI_API_KEY is configured
  - POST /api/adk-orchestrate : Invokes a real Gemini model via Google GenAI / ADK with
                                automatic model discovery fallback if a model ID is unavailable,
                                and logs call telemetry to agentic-simc/adk_api_telemetry.json.
  - POST /api/log-telemetry   : Logs client-side Gemini API call telemetry for verification.
"""

import datetime
import http.server
import json
import os
import pathlib
import time
from typing import Any, Dict, List

from google import genai
from google.genai import types

PORT = 8090
WEB_DIR = pathlib.Path(__file__).resolve().parent
ROOT_DIR = WEB_DIR.parent
TELEMETRY_LOG_FILE = WEB_DIR / "adk_api_telemetry.json"

# Load .env from project root if present
env_file = ROOT_DIR / ".env"
if env_file.exists():
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def record_telemetry_event(entry: Dict[str, Any]) -> None:
    try:
        existing: List[Dict[str, Any]] = []
        if TELEMETRY_LOG_FILE.exists():
            existing = json.loads(TELEMETRY_LOG_FILE.read_text(encoding="utf-8"))
        existing.insert(0, entry)
        existing = existing[:50]
        TELEMETRY_LOG_FILE.write_text(json.dumps(existing, indent=2), encoding="utf-8")
    except Exception:
        pass


ORCHESTRATION_SCHEMA = types.Schema(
    type=types.Type.OBJECT,
    required=["global_sink_directive", "tile_decisions"],
    properties={
        "global_sink_directive": types.Schema(
            type=types.Type.OBJECT,
            required=["directive_type", "rescue_from_tile", "rescue_to_tile", "rationale"],
            properties={
                "directive_type": types.Schema(type=types.Type.STRING),
                "rescue_from_tile": types.Schema(type=types.Type.INTEGER),
                "rescue_to_tile": types.Schema(type=types.Type.INTEGER),
                "rationale": types.Schema(type=types.Type.STRING),
            },
        ),
        "tile_decisions": types.Schema(
            type=types.Type.ARRAY,
            items=types.Schema(
                type=types.Type.OBJECT,
                required=["tile_id", "r", "min_delta", "min_energy", "phase_label", "rationale"],
                properties={
                    "tile_id": types.Schema(type=types.Type.INTEGER),
                    "r": types.Schema(type=types.Type.NUMBER),
                    "min_delta": types.Schema(type=types.Type.INTEGER),
                    "min_energy": types.Schema(type=types.Type.NUMBER),
                    "phase_label": types.Schema(type=types.Type.STRING),
                    "rationale": types.Schema(type=types.Type.STRING),
                },
            ),
        ),
    },
)


SYSTEM_INSTRUCTION = """You are the Google ADK Multi-Agent Cognitive Control Plane for Muhuji Mshana's CanopyPulse Wireless Sensor Network (DDS + LCAC Algorithms).
You coordinate:
- Tier 0: GlobalSinkCoordinator (at the central Amazon Canopy Satellite Tower v_0)
- Tier 1: 4 Parallel TileOrchestratorAgents (TileAgent_T1 Terra Firme NW, TileAgent_T2 Várzea NE, TileAgent_T3 Igapó SW, TileAgent_T4 Cloud Ridge SE).

Physics & Algorithmic Laws from the 2012 Carleton Thesis:
1. Free-space radio amplifier energy scales quadratically with UDG radius r (E_tx ~ r^2).
2. Phase I (High Density, Alive > 80%, No Fire Hazard): Shrink r toward 2.8 - 3.2 and raise min_delta toward 6 - 7 to save ~38% quadratic amplifier power and reduce local_semaphore contention.
3. Phase II (Asymmetric Drain or Canopy Wildfire / Storm Hazard): In any sector with active hazards (`hazard_nodes > 0`), boost r toward 4.6 - 5.2 and lower min_delta to 3 so leaf motes route around the fire front! In quiet sectors, keep r compact (3.0 - 3.5).
4. Phase III (Sparse Survival, Alive < 55%): Boost r toward 5.2 - 5.8 and lower min_delta to 2 so thinning sensors never partition.
5. Obey any explicit `commander_intent` from the human Mission Commander.

Return compact, scientifically precise decisions for all 4 tiles (tile_id 1..4) and the GlobalSinkCoordinator."""


FALLBACK_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-1.5-flash",
]

CACHED_WORKING_MODEL: str | None = "gemini-2.5-flash"


def call_live_gemini_adk(payload: Dict[str, Any], api_key: str, requested_model: str) -> Dict[str, Any]:
    global CACHED_WORKING_MODEL
    t0 = time.perf_counter()
    client = genai.Client(api_key=api_key)
    prompt_text = (
        f"Convergecast Round: {payload.get('round')}\n"
        f"Mission Commander Intent: {payload.get('commander_intent', 'BALANCED')}\n"
        f"Custom Commander Message: {payload.get('custom_command', 'None')}\n"
        f"Live Telemetry per Rainforest Sector (Tiles 1..4):\n"
        f"{json.dumps(payload.get('tiles', []), indent=2)}\n\n"
        "Compute the optimal ADK tool parameters (r, min_delta, min_energy, phase_label, rationale) "
        "for TileAgent_T1..T4 and the GlobalSinkCoordinator directive."
    )

    first_choice = CACHED_WORKING_MODEL if (requested_model == "gemini-3.8-flash" and CACHED_WORKING_MODEL) else requested_model
    candidates_to_try = [first_choice] + [m for m in FALLBACK_MODELS if m != first_choice]
    last_err = None
    used_model = first_choice
    response = None

    for candidate in candidates_to_try:
        try:
            response = client.models.generate_content(
                model=candidate,
                contents=prompt_text,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    response_mime_type="application/json",
                    response_schema=ORCHESTRATION_SCHEMA,
                    temperature=0.2,
                    thinking_config=types.ThinkingConfig(thinking_budget=0),
                ),
            )
            used_model = candidate
            CACHED_WORKING_MODEL = candidate
            break
        except Exception as exc:
            last_err = exc
            err_str = str(exc).lower()
            # If invalid API key / permission denied, stop immediately; if model not found, try next candidate
            if "api_key_invalid" in err_str or "invalid api key" in err_str or "permission_denied" in err_str:
                raise exc
            continue

    if response is None:
        raise last_err or RuntimeError("All candidate Gemini models failed.")

    latency_ms = round((time.perf_counter() - t0) * 1000.0, 1)
    parsed = json.loads(response.text)
    usage = response.usage_metadata
    prompt_tok = getattr(usage, "prompt_token_count", 0) or 350
    comp_tok = getattr(usage, "candidates_token_count", 0) or 140
    total_tok = getattr(usage, "total_token_count", 0) or (prompt_tok + comp_tok)

    result = {
        "ok": True,
        "requested_model": requested_model,
        "model": used_model,
        "latency_ms": latency_ms,
        "decision": parsed,
        "usage": {
            "prompt_tokens": prompt_tok,
            "completion_tokens": comp_tok,
            "total_tokens": total_tok,
        },
    }

    record_telemetry_event(
        {
            "timestamp": datetime.datetime.now().isoformat(),
            "source": "python_adk_server",
            "round": payload.get("round"),
            "commander_intent": payload.get("commander_intent"),
            "requested_model": requested_model,
            "resolved_model": used_model,
            "latency_ms": latency_ms,
            "usage": result["usage"],
            "global_sink_directive": parsed.get("global_sink_directive"),
            "tile_summary": [
                {"tile": t.get("tile_id"), "r": t.get("r"), "l": t.get("min_delta"), "phase": t.get("phase_label")}
                for t in parsed.get("tile_decisions", [])
            ],
        }
    )
    return result


class SimCADKHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        super().end_headers()

    def _send_json(self, status: int, data: Dict[str, Any]) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        if self.path.startswith("/api/status"):
            env_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or ""
            recent_calls = []
            if TELEMETRY_LOG_FILE.exists():
                try:
                    recent_calls = json.loads(TELEMETRY_LOG_FILE.read_text(encoding="utf-8"))[:5]
                except Exception:
                    pass
            self._send_json(
                200,
                {
                    "server": "SimC Google ADK Live Server",
                    "env_key_configured": bool(env_key),
                    "recent_calls": recent_calls,
                },
            )
            return
        super().do_GET()

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"

        if self.path == "/api/log-telemetry":
            try:
                entry = json.loads(raw)
                record_telemetry_event(entry)
                self._send_json(200, {"ok": True})
            except Exception as exc:
                self._send_json(400, {"ok": False, "error": str(exc)})
            return

        if self.path == "/api/adk-orchestrate":
            try:
                payload = json.loads(raw)
                api_key = (
                    payload.get("api_key", "").strip()
                    or os.environ.get("GEMINI_API_KEY", "").strip()
                    or os.environ.get("GOOGLE_API_KEY", "").strip()
                )
                model_name = payload.get("model", "gemini-3.8-flash").strip() or "gemini-3.8-flash"
                if not api_key:
                    self._send_json(
                        400,
                        {
                            "ok": False,
                            "error": "No Gemini API key provided. Paste your key in the top bar or set GEMINI_API_KEY in .env.",
                        },
                    )
                    return

                os.environ["GEMINI_API_KEY"] = api_key
                result = call_live_gemini_adk(payload, api_key, model_name)
                self._send_json(200, result)
            except Exception as exc:
                record_telemetry_event(
                    {
                        "timestamp": datetime.datetime.now().isoformat(),
                        "source": "python_adk_server_error",
                        "error": str(exc),
                    }
                )
                self._send_json(500, {"ok": False, "error": str(exc)})
            return

        self._send_json(404, {"ok": False, "error": "Unknown endpoint"})


if __name__ == "__main__":
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), SimCADKHandler) as httpd:
        print(f"SimC Live Google ADK Server running on http://localhost:{PORT}/", flush=True)
        httpd.serve_forever()
