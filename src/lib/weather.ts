// Clima de Tototlán con Open-Meteo (gratis, sin llave). Se guarda 1 hora en caché.
import { useEffect, useState } from 'react'
import { useStore } from './store'

export interface Weather {
  temp: number
  code: number
  daily: { date: string; max: number; min: number; rain: number; code: number }[]
}

const KEY = 'lajoya:weather'

export const weatherLabel = (code: number) => {
  if (code === 0) return 'Despejado'
  if (code <= 2) return 'Parcialmente nublado'
  if (code === 3) return 'Nublado'
  if (code <= 48) return 'Neblina'
  if (code <= 67) return 'Lluvia'
  if (code <= 77) return 'Nieve'
  if (code <= 82) return 'Chubascos'
  return 'Tormenta'
}

export function useWeather() {
  const { lat, lng } = useStore((s) => s.settings)
  const [w, setW] = useState<Weather | null>(() => {
    try {
      const c = JSON.parse(localStorage.getItem(KEY) || 'null')
      return c?.data ?? null
    } catch {
      return null
    }
  })
  useEffect(() => {
    try {
      const c = JSON.parse(localStorage.getItem(KEY) || 'null')
      if (c && Date.now() - c.at < 3600_000) return
    } catch {
      /* caché inválida */
    }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=America%2FMexico_City&forecast_days=7`
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        const data: Weather = {
          temp: Math.round(j.current.temperature_2m),
          code: j.current.weather_code,
          daily: j.daily.time.map((date: string, i: number) => ({
            date,
            max: Math.round(j.daily.temperature_2m_max[i]),
            min: Math.round(j.daily.temperature_2m_min[i]),
            rain: j.daily.precipitation_probability_max[i] ?? 0,
            code: j.daily.weather_code[i],
          })),
        }
        localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), data }))
        setW(data)
      })
      .catch(() => {
        /* sin internet: se queda con la caché */
      })
  }, [lat, lng])
  return w
}
