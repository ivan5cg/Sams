import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { migrate, serialize } from '../src/save/serialize';

const save = () => JSON.parse(serialize(World.createNew().state));

describe('partidas manipuladas', () => {
  it('se aceptan nombres raros (se escapan al pintarlos)', () => {
    const st = save();
    st.agents[0].name = '<img src=x onerror=alert(1)>';
    st.households[0].name = '"><script>alert(1)</script>';
    expect(() => migrate(st)).not.toThrow();
  });

  it('se rechazan identificadores con HTML', () => {
    const st = save();
    st.agents[1].id = 'a2"><img src=x onerror=alert(1)>';
    expect(() => migrate(st)).toThrow(/dañada/);
  });

  it('se rechazan números que no son números', () => {
    for (const mutate of [
      (s: any) => (s.agents[0].ageDays = '24"><img src=x>'),
      (s: any) => (s.agents[0].color = 'red;background:url(x)'),
      (s: any) => (s.households[0].funds = '1e9<b>'),
      (s: any) => (s.agents[0].needs.hunger = null),
    ]) {
      const st = save();
      mutate(st);
      expect(() => migrate(st)).toThrow(/dañada/);
    }
  });

  it('se rechazan especies y muebles desconocidos', () => {
    const a = save();
    a.agents[2].species = 'dragon';
    expect(() => migrate(a)).toThrow(/dañada/);
    const b = save();
    b.objects[0].def = 'nave_espacial';
    expect(() => migrate(b)).toThrow(/dañada/);
  });

  it('se rechazan referencias rotas o identificadores duplicados', () => {
    for (const mutate of [
      (s: any) => (s.playerHouseholdId = 'h999999'),
      (s: any) => (s.agents[0].lotId = 'L_INEXISTENTE'),
      (s: any) => s.households[0].memberIds.push('a_fantasma'),
      (s: any) => (s.agents[1].id = s.agents[0].id),
      (s: any) => (s.objects[1].id = s.objects[0].id),
    ]) {
      const st = save();
      mutate(st);
      expect(() => migrate(st)).toThrow(/dañada/);
    }
  });

  it('sincroniza nextId y conserva viajes infinitos tras serializar', () => {
    const w = World.createNew();
    const toby = w.agent('a3')!;
    toby.travel = { from: 'L0', to: 'L0', arrive: Number.POSITIVE_INFINITY };
    const st = JSON.parse(serialize(w.state));
    st.nextId = 5;
    const m = migrate(st);
    const maxAgentId = Math.max(...m.agents.map((a) => Number(/(\d+)$/.exec(a.id)?.[1] ?? 0)));
    const maxObjId = Math.max(...m.objects.map((o) => Number(/(\d+)$/.exec(o.id)?.[1] ?? 0)));
    expect(m.nextId).toBeGreaterThan(maxAgentId);
    expect(m.nextId).toBeGreaterThan(maxObjId);
    const restoredToby = m.agents.find((a) => a.id === 'a3')!;
    expect(restoredToby.travel?.arrive).toBe(Number.POSITIVE_INFINITY);
  });
});
