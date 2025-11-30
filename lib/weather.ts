/**
 * Weather API Integration
 * Uses OpenWeatherMap API for weather data
 *
 * To use this module, set NEXT_PUBLIC_WEATHER_API_KEY in .env.local
 * Get a free API key at: https://openweathermap.org/api
 */

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
}

const API_KEY = process.env.NEXT_PUBLIC_WEATHER_API_KEY;
const BASE_URL = 'https://api.openweathermap.org/data/2.5';

/**
 * Fetch current weather by coordinates
 */
export async function getWeatherByCoordinates(
  latitude: number,
  longitude: number,
): Promise<WeatherData> {
  if (!API_KEY) {
    console.warn('Weather API key not configured. Using mock data.');
    return getMockWeather();
  }

  try {
    const url = `${BASE_URL}/weather?lat=${latitude}&lon=${longitude}&appid=${API_KEY}&units=imperial`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`);
    }

    const data = await response.json();

    return {
      temperature: Math.round(data.main.temp),
      temperatureCelsius: Math.round((data.main.temp - 32) * (5 / 9)),
      condition: data.weather[0].main,
      description: data.weather[0].description,
      icon: data.weather[0].icon,
      humidity: data.main.humidity,
      windSpeed: Math.round(data.wind.speed),
      windSpeedKmh: Math.round(data.wind.speed * 1.60934),
      location: data.name || 'Unknown',
      sunrise: data.sys.sunrise,
      sunset: data.sys.sunset,
    };
  } catch (error) {
    console.error('Error fetching weather:', error);
    // Fall back to mock data on error
    return getMockWeather();
  }
}

/**
 * Fetch current weather by city name
 */
export async function getWeatherByCity(city: string): Promise<WeatherData> {
  if (!API_KEY) {
    console.warn('Weather API key not configured. Using mock data.');
    return getMockWeather();
  }

  try {
    const url = `${BASE_URL}/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=imperial`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`);
    }

    const data = await response.json();

    return {
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
    };
  } catch (error) {
    console.error('Error fetching weather:', error);
    // Fall back to mock data on error
    return getMockWeather();
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
 * Mock weather data for development/fallback
 */
function getMockWeather(): WeatherData {
  return {
    temperature: 72,
    temperatureCelsius: 22,
    condition: 'Clear',
    description: 'clear sky',
    icon: '01d',
    humidity: 45,
    windSpeed: 8,
    windSpeedKmh: 13,
    location: 'Black Hills, SD',
  };
}

/**
 * Check if weather API is configured
 */
export function isWeatherApiConfigured(): boolean {
  return !!API_KEY;
}
