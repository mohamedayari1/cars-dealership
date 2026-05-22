// Batch Processing Library
// For Gemini Batch API with webhooks

export { buildBatchJsonl, buildAngleValidationJsonl } from "./jsonl-builder";

export {
  uploadJsonlToGemini,
  getFileState,
  waitForFileActive,
  deleteGeminiFile,
} from "./file-upload";

export {
  dispatchBatchJob,
  getBatchJobStatus,
  cancelBatchJob,
  listBatchJobs,
} from "./dispatcher";

export {
  downloadBatchResults,
  processAndStoreResults,
  extractTextResults,
} from "./results";

export {
  loadGarageBackgrounds,
  selectBestBackground,
  getBackgroundByName,
  getBackgroundOptions,
  type GarageBackground,
} from "./backgrounds";
