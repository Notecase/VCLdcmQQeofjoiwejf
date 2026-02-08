import {
  classifyRequestPolicyMode,
  inferAutoOutputPreference,
  type RequestOutputPreference,
  type RequestPolicyMode,
} from '@inkdown/shared'

export type DeepAgentOutputDestination = RequestOutputPreference
export type DeepAgentRequestMode = RequestPolicyMode

export function getAutoOutputDestinationForMessage(message: string): DeepAgentOutputDestination | undefined {
  return inferAutoOutputPreference(message)
}

export function getRequestModeForMessage(
  message: string,
  outputPreference?: DeepAgentOutputDestination,
): DeepAgentRequestMode {
  return classifyRequestPolicyMode(message, outputPreference)
}
