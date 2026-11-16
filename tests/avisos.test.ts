import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { noticeLevel } from '../src/ui/notice-level';

describe('avisos con prioridad', () => {
  it('clasifica: urgente, familia o barrio', () => {
    const w = World.createNew();
    const neighbour = w.state.agents.find((a) => !w.isPlayerMember(a) && a.kind === 'person')!;
    expect(noticeLevel({ text: 'Mateo se muere de hambre', icon: '❗', agentId: 'a2' }, w)).toBe('urgent');
    expect(noticeLevel({ text: '¡Lucía está muriéndose de hambre!', icon: '🆘', agentId: 'a1' }, w)).toBe('urgent');
    expect(noticeLevel({ text: 'Toby se ha hecho pis', icon: '💦', agentId: neighbour.id }, w)).toBe('barrio');
    expect(noticeLevel({ text: 'Mateo vuelve del trabajo: +§80', icon: '💰' }, w)).toBe('family');
    expect(noticeLevel({ text: 'Han llegado las facturas', icon: '🧾' }, w)).toBe('family');
    expect(noticeLevel({ text: 'La Familia Ruiz se muda al barrio', icon: '🚚' }, w)).toBe('barrio');
    expect(noticeLevel({ text: 'Empieza el día 2', icon: '🌅' }, w)).toBe('barrio');
    expect(noticeLevel({ text: `${neighbour.name} ha fallecido`, icon: '🕊️', agentId: neighbour.id }, w)).toBe('barrio');
    expect(noticeLevel({ text: 'Lucía ha fallecido', icon: '🕊️', agentId: 'a1' }, w)).toBe('family');
  });

  it('en una semana de juego, nunca más de 5 avisos no urgentes en la misma hora', () => {
    const w = World.createNew();
    w.state.activeAgentId = 'nadie';
    const perHour = new Map<number, number>();
    const levels = { urgent: 0, family: 0, barrio: 0 };
    w.onToast((t) => {
      const level = noticeLevel(t, w);
      levels[level]++;
      if (level !== 'family') return;
      const h = Math.floor(w.state.minutes / 60);
      perHour.set(h, (perHour.get(h) ?? 0) + 1);
    });
    w.tick(7 * 1440);
    expect(Math.max(0, ...perHour.values())).toBeLessThanOrEqual(5);
    // Lo del barrio no interrumpe: va a la bandeja.
    expect(levels.barrio).toBeGreaterThan(5);
  });
});
