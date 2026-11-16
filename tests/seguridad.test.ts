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
});
