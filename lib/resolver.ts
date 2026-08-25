import { generateText, stepCountIs } from 'ai';
import { google } from '@ai-sdk/google';
import { fastModel } from './ai';
import { stableSeed } from './utils';

const URL_REGEX = /https?:\/\/[^\s"'<>)\]]+/i;

/**
 * Resolves a free-text query (business name, description, "name + city", etc.)
 * to the business's own official website using AI-powered, Google Search-grounded
 * lookup — favoring the business's own domain over directory/marketplace listings.
 */
export async function resolveBusinessWebsite(query: string): Promise<string> {
  const { text } = await generateText({
    model: fastModel,
    tools: { google_search: google.tools.googleSearch({}) },
    stopWhen: stepCountIs(3),
    temperature: 0,
    seed: stableSeed(query.toLowerCase().trim()),
    maxRetries: 3,
    system: `You are a precise web research assistant. Given a local business's name or description (a hotel, restaurant, shop, clinic, salon, or any other local business), use Google Search to find that business's own official website homepage.

Rules:
- Prefer the business's own domain (or its parent chain/group's domain), never a third-party directory, marketplace, or listing site such as Yelp, TripAdvisor, Booking.com, Expedia, Agoda, Google Maps/Business listing pages, Facebook, Instagram, or Yellow Pages.
- Respond with ONLY the single canonical https URL of the business's official homepage. No markdown, no explanation, no extra words.
- If you cannot confidently identify an official website, respond with exactly: NOT_FOUND`,
    prompt: `Find the official website for: ${query}`,
  });

  const match = text.trim().match(URL_REGEX);
  if (!match) {
    throw new Error(
      `Could not find an official website for "${query}". Try pasting the business's URL directly.`
    );
  }

  const url = match[0].replace(/[.,)\]]+$/, '');
  // Validate before handing back — throws if the model produced something malformed.
  new URL(url);
  return url;
}
