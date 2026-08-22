import { generateText, stepCountIs } from 'ai';
import { google } from '@ai-sdk/google';
import { fastModel } from './ai';
import { stableSeed } from './utils';

const URL_REGEX = /https?:\/\/[^\s"'<>)\]]+/i;

/**
 * Resolves a free-text query (hotel name, description, "name + city", etc.)
 * to the hotel's own official website using AI-powered, Google Search-grounded
 * lookup — favoring the property's own domain over OTA/aggregator listings.
 */
export async function resolveHotelWebsite(query: string): Promise<string> {
  const { text } = await generateText({
    model: fastModel,
    tools: { google_search: google.tools.googleSearch({}) },
    stopWhen: stepCountIs(3),
    temperature: 0,
    seed: stableSeed(query.toLowerCase().trim()),
    system: `You are a precise web research assistant. Given a hotel name or description, use Google Search to find the hotel's own official website homepage.

Rules:
- Prefer the property's own domain (or its parent hotel group's domain), never a third-party OTA/aggregator such as Booking.com, Expedia, Agoda, Hotels.com, TripAdvisor, or Google's own listing pages.
- Respond with ONLY the single canonical https URL of the hotel's official homepage. No markdown, no explanation, no extra words.
- If you cannot confidently identify an official website, respond with exactly: NOT_FOUND`,
    prompt: `Find the official website for: ${query}`,
  });

  const match = text.trim().match(URL_REGEX);
  if (!match) {
    throw new Error(
      `Could not find an official website for "${query}". Try pasting the hotel's URL directly.`
    );
  }

  const url = match[0].replace(/[.,)\]]+$/, '');
  // Validate before handing back — throws if the model produced something malformed.
  new URL(url);
  return url;
}
