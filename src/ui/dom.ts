// Utilidades comunes de la interfaz: buscar elementos, escapar texto y colores.

import type { Agent } from '../sim/types';
import { moodScore } from '../sim/world';


export const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

/** Escapa texto para meterlo en HTML (también en atributos, entre comillas dobles o simples). */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function mood(a: Agent): { score: number; icon: string; label: string; color: string } {
  const score = moodScore(a);
  if (score > 70) return { score, icon: '😄', label: 'Muy feliz', color: '#3ddc4a' };
  if (score > 50) return { score, icon: '🙂', label: 'Bien', color: '#9bd84a' };
  if (score > 30) return { score, icon: '😐', label: 'Regular', color: '#f0c43c' };
  return { score, icon: '😫', label: 'Fatal', color: '#e8553d' };
}

export function needColor(v: number) {
  if (v > 60) return '#4cd964';
  if (v > 30) return '#f4c430';
  return '#ff4d3d';
}

export function hexColor(n: number) {
  return `#${((Number(n) || 0) & 0xffffff).toString(16).padStart(6, '0')}`;
}
