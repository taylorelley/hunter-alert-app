/**
 * Weather API Integration
 * Uses OpenWeatherMap API for weather data
 *
 * To use this module, set NEXT_PUBLIC_WEATHER_API_KEY in .env.local
 * Get a free API key at: https://openweathermap.org/api
 */

import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { get, set } from "idb-keyval";

export interface WeatherData {
  temperature: number; // Fahrenheit
  temperatureCelsius: number;
  condition: string;
  description: string;
  icon: string;
  humidity: number;
  windSpeed: number; // mph
  windSpeedKmh: number;
  location: string;
  sunrise?: number; // Unix timestamp
  sunset?: number; // Unix timestamp
  fetchedAt: number; // Unix timestamp (ms)
}

interface WeatherRequestOptions {
  constrained?: boolean;
}

interface CachedWeatherPayload {
  data: WeatherData;
  timestamp: number;
}

const API_KEY = (process.env.NEXT_PUBLIC_WEATHER_API_KEY || "").trim();
const BASE_URL = "https://api.openweathermap.org/data/2.5";
const WEATHER_CACHE_KEY = "weather:last-success";
const REQUEST_TIMEOUT_MS = 12000;
const configuredBackoff = Number(process.env.SYNC_BASE_BACKOFF_MS ?? 4000);
const BASE_BACKOFF_MS = Number.isFinite(configuredBackoff) ? Math.max(configuredBackoff, 1000) : 4000;

function buildMockWeather(location: string): WeatherData {
  const now = Date.now();
  return {
    temperature: 65,
    temperatureCelsius: 18,
    condition: "Clear",
    description: "Offline sample weather",
    icon: "01d",
    humidity: 40,
    windSpeed: 5,
    windSpeedKmh: 8,
    location,
    fetchedAt: now,
  };
}

async function resolveApiKeyOrFallback(location: string): Promise<{
  apiKey: string | null;
  fallback: WeatherData | null;
}> {
  if (API_KEY) return { apiKey: API_KEY, fallback: null };

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_WEATHER_API_KEY is required for live weather in production. Add it to your environment (OpenWeatherMap API key).",
    );
  }

  const cached = await readCachedWeather();
  if (cached) return { apiKey: null, fallback: cached };

  const mock = buildMockWeather(location);
  await cacheWeather(mock);
  return { apiKey: null, fallback: mock };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithBackoff(url: string, { constrained }: WeatherRequestOptions = {}) {
  const attempts = constrained ? 4 : 3;
  const baseDelay = constrained ? BASE_BACKOFF_MS * 1.5 : BASE_BACKOFF_MS;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) {
        throw new Error(`Weather API error: ${response.status}`);
      }
      return response;
    } catch (error) {
      clearTimeout(timeout);
      if (attempt === attempts) {
        throw error;
      }
      const backoff = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 500;
      await delay(backoff);
    }
  }

  // TypeScript: unreachable, but satisfies return type in case control flow analysis changes
  throw new Error("Weather request failed after retries");
}

async function cacheWeather(data: WeatherData): Promise<void> {
  const payload: CachedWeatherPayload = { data, timestamp: data.fetchedAt };

  try {
    if (typeof window === "undefined") return;

    if (Capacitor.isNativePlatform()) {
      await Preferences.set({ key: WEATHER_CACHE_KEY, value: JSON.stringify(payload) });
    } else {
      await set(WEATHER_CACHE_KEY, payload);
    }
  } catch (error) {
    console.warn("Unable to cache weather data", error);
  }
}

async function readCachedWeather(): Promise<WeatherData | null> {
  try {
    if (typeof window === "undefined") return null;

    const stored = Capacitor.isNativePlatform()
      ? (await Preferences.get({ key: WEATHER_CACHE_KEY })).value
      : ((await get(WEATHER_CACHE_KEY)) as CachedWeatherPayload | null);

    if (!stored) return null;

    const payload: CachedWeatherPayload =
      typeof stored === "string" ? JSON.parse(stored) : (stored as CachedWeatherPayload);

    if (!payload?.data) return null;

    return { ...payload.data, fetchedAt: payload.timestamp ?? payload.data.fetchedAt };
  } catch (error) {
    console.warn("Unable to read cached weather data", error);
    return null;
  }
}

/**
 * Fetch current weather by coordinates
 */
export async function getWeatherByCoordinates(
  latitude: number,
  longitude: number,
  options: WeatherRequestOptions = {},
): Promise<WeatherData> {
  const { apiKey, fallback } = await resolveApiKeyOrFallback("Current location");
  if (!apiKey) {
    if (fallback) return fallback;
    throw new Error("Weather unavailable: missing API key");
  }

  try {
    const url = `${BASE_URL}/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=imperial`;
    const response = await fetchWithBackoff(url, options);
    const data = await response.json();

    const weather: WeatherData = {
      temperature: Math.round(data.main.temp),
      temperatureCelsius: Math.round((data.main.temp - 32) * (5 / 9)),
      condition: data.weather[0].main,
      description: data.weather[0].description,
      icon: data.weather[0].icon,
      humidity: data.main.humidity,
      windSpeed: Math.round(data.wind.speed),
      windSpeedKmh: Math.round(data.wind.speed * 1.60934),
      location: data.name || "Unknown",
      sunrise: data.sys.sunrise,
      sunset: data.sys.sunset,
      fetchedAt: Date.now(),
    };

    cacheWeather(weather);
    return weather;
  } catch (error) {
    console.error("Error fetching weather:", error);
    const cached = await readCachedWeather();
    if (cached) return cached;
    throw error instanceof Error
      ? error
      : new Error("Unable to fetch weather data. Check connectivity or try again.");
  }
}

/**
 * Fetch current weather by city name
 */
export async function getWeatherByCity(city: string, options: WeatherRequestOptions = {}): Promise<WeatherData> {
  const { apiKey, fallback } = await resolveApiKeyOrFallback(city);
  if (!apiKey) {
    if (fallback) return fallback;
    throw new Error("Weather unavailable: missing API key");
  }

  try {
    const url = `${BASE_URL}/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=imperial`;
    const response = await fetchWithBackoff(url, options);
    const data = await response.json();

    const weather: WeatherData = {
      temperature: Math.round(data.main.temp),
      temperatureCelsius: Math.round((data.main.temp - 32) * (5 / 9)),
      condition: data.weather[0].main,
      description: data.weather[0].description,
      icon: data.weather[0].icon,
      humidity: data.main.humidity,
      windSpeed: Math.round(data.wind.speed),
      windSpeedKmh: Math.round(data.wind.speed * 1.60934),
      location: data.name,
      sunrise: data.sys.sunrise,
      sunset: data.sys.sunset,
      fetchedAt: Date.now(),
    };

    cacheWeather(weather);
    return weather;
  } catch (error) {
    console.error("Error fetching weather:", error);
    const cached = await readCachedWeather();
    if (cached) return cached;
    throw error instanceof Error
      ? error
      : new Error("Unable to fetch weather data. Check connectivity or try again.");
  }
}

/**
 * Get weather icon URL from OpenWeatherMap
 */
export function getWeatherIconUrl(icon: string, size: '2x' | '4x' = '2x'): string {
  return `https://openweathermap.org/img/wn/${icon}@${size}.png`;
}

/**
 * Format weather condition for display
 */
export function formatCondition(condition: string): string {
  switch (condition.toLowerCase()) {
    case 'clear':
      return 'Clear';
    case 'clouds':
      return 'Cloudy';
    case 'rain':
      return 'Rainy';
    case 'drizzle':
      return 'Drizzle';
    case 'thunderstorm':
      return 'Stormy';
    case 'snow':
      return 'Snowy';
    case 'mist':
    case 'fog':
      return 'Foggy';
    default:
      return condition;
  }
}

/**
 * Check if weather API is configured
 */
export function isWeatherApiConfigured(): boolean {
  return !!API_KEY;
}

export async function getCachedWeather(): Promise<WeatherData | null> {
  return readCachedWeather();
}
