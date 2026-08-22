from agent.tools import (
    check_camera_status, 
    check_device_status,
    scan_network, 
    block_ip, 
    get_recent_threats,
    generate_threat_report,
    get_device_list,
    get_predictions
)
from agent.ai_engine import invoke_autonomous_agent
import json

# Try importing Polly — optional, only works if AWS creds are configured
try:
    from agent.polly_engine import synthesize_speech as _polly_synthesize
except Exception:
    _polly_synthesize = None

def synthesize_speech(text: str):
    """Use Polly if available, otherwise return None (browser TTS fallback)."""
    if _polly_synthesize:
        try:
            return _polly_synthesize(text)
        except Exception:
            pass
    return None

# Map string tool names from Claude's JSON to actual Python functions
AVAILABLE_TOOLS = {
    "check_device_status": check_device_status,
    "check_camera_status": check_camera_status,
    "scan_network": scan_network,
    "block_ip": block_ip,
    "get_recent_threats": get_recent_threats,
    "generate_threat_report": generate_threat_report,
    "get_device_list": get_device_list,
    "get_predictions": get_predictions
}

def process_command(command: str = None, event_data: dict = None):
    """
    Acts as the Autonomous AI router. 
    Sends the context to Claude, receives the structured JSON, executes any requested backend tools, 
    and returns the final payload (including navigation commands) back to the frontend.
    """
    
    # Step 1: Feed the command and/or telemetry to Claude
    ai_response = invoke_autonomous_agent(event_data=event_data, command_override=command)
    
    # Step 2: Extract the actions array
    actions_to_execute = ai_response.get("actions", [])
    executed_results = []
    
    frontend_actions = []

    # Step 3: Execute the autonomous actions
    for action in actions_to_execute:
        action_type = action.get("type")
        
        if action_type == "tool":
            tool_name = action.get("name")
            args = action.get("arguments", {})
            
            if tool_name in AVAILABLE_TOOLS:
                print(f"🤖 AI Autonomous Tool Execution: {tool_name}({args})")
                try:
                    # Unpack arguments into the function call dynamically
                    result = AVAILABLE_TOOLS[tool_name](**args)
                    executed_results.append({
                        "tool": tool_name,
                        "status": "success",
                        "data": result
                    })
                except Exception as e:
                    print(f"❌ Tool Execution Error [{tool_name}]: {e}")
                    executed_results.append({
                        "tool": tool_name,
                        "status": "error",
                        "message": str(e)
                    })
            else:
                print(f"⚠️ AI requested unknown tool: {tool_name}")
                
        elif action_type == "navigate":
            # Pass navigation actions back to the frontend React router
            frontend_actions.append(action)
            print(f"🧭 AI requested dashboard navigation to: {action.get('page')}")

    # Step 4: Return the cohesive payload to the frontend
    # Hackathon Demo Fallback: If Nova Lite ignores the system prompt for Threat Correlation, force the phrase it back in.
    final_message = ai_response.get("response", "Processing complete.")
    if event_data and "dashboard_alerts" in event_data:
        final_message = "Possible coordinated attack detected. Investigating further. " + final_message
        ai_response["threat_level"] = 9
        
    # Amazon Polly TTS Magic!
    audio_base64 = synthesize_speech(final_message)

    return {
        "success": True,
        "threat_level": ai_response.get("threat_level", 0),
        "message": final_message,
        "audio_base64": audio_base64,
        "backend_executions": executed_results,
        "actions": frontend_actions
    }
