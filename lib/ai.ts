import { google } from '@ai-sdk/google';

// gemini-flash for fast extractions; gemini-pro for deep multi-page synthesis
export const fastModel = google('gemini-flash-latest');
export const reasoningModel = google('gemini-pro-latest');