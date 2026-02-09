import {
  classifyRequestPolicyMode,
  shouldUseResearchFileTools,
  type RequestOutputPreference,
  type RequestPolicyMode,
} from '@inkdown/shared'

export type ResearchRequestMode = RequestPolicyMode
export type ResearchOutputPreference = RequestOutputPreference

export function classifyResearchRequest(
  message: string,
  outputPreference?: ResearchOutputPreference
): ResearchRequestMode {
  return classifyRequestPolicyMode(message, outputPreference)
}

export function shouldEnableResearchFiles(
  message: string,
  outputPreference?: ResearchOutputPreference
): boolean {
  return shouldUseResearchFileTools(message, outputPreference)
}
