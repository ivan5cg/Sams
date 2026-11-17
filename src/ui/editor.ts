// Editar a una persona de la familia (perfil → ✏️): nombre, ropa, pantalón, piel, pelo, peinado y
// gafas, barba o bigote. Se ve al momento en el muñeco de arriba y en el juego al guardar.

import { CLOTHES, EXTRAS, EXTRA_LABEL, HAIR, HAIR_STYLES, HAIR_STYLE_LABEL, PANTS, SKIN } from '../data/looks';
import { personLook } from '../render/characters';
import { editProblem, type PersonEdit } from '../sim/family';
import { $, esc, hexColor } from './dom';
import { Part } from './part';

export class PersonEditor extends Part {
  private agentId = '';
  private draft: PersonEdit | null = null;
  private elder = false;

  get isOpen() {
    return !$('#editor').hidden;
  }

  bind() {
    const root = $('#editor');
    root.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.id === 'editor') return this.close();
      const b = el.closest<HTMLButtonElement>('button');
      const d = this.draft;
      if (!b || !d) return;
      const v = Number(b.dataset.v);
      switch (b.dataset.ed) {
        case 'clothes': d.color = v; break;
        case 'pants': d.look.pants = v; break;
        case 'skin': d.look.skin = v; break;
        case 'hair': d.look.hair = v; break;
        case 'random': {
          const pick = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
          this.draft = { name: d.name, color: pick(CLOTHES), look: { skin: d.look.skin, hair: pick(HAIR), hairStyle: pick(HAIR_STYLES), pants: pick(PANTS), extra: pick(EXTRAS) } };
          break;
        }
        case 'cancel': return this.close();
        case 'save': {
          const why = this.world.editPerson(this.agentId, d);
          if (why) return this.renderProblem(why);
          this.close();
          this.hud.toast('¡Nuevo look!', '✨');
          this.hud.profile.renderProfile();
          return;
        }
        default: return;
      }
      this.render();
    });
    root.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.ed === 'name' && this.draft) {
        this.draft.name = el.value;
        const label = root.querySelector('.cr-name');
        if (label) label.textContent = el.value || '¿?';
        this.renderProblem(editProblem(this.draft));
      }
    });
    root.addEventListener('change', (e) => {
      const el = e.target as HTMLSelectElement;
      if (!this.draft) return;
      if (el.dataset.ed === 'style') this.draft.look.hairStyle = el.value;
      else if (el.dataset.ed === 'extra') this.draft.look.extra = el.value;
      else return;
      this.render();
    });
  }

  /** Abre el editor con el aspecto que tiene ahora (aunque salga del nombre, se fija tal cual). */
  open(agentId: string) {
    const a = this.world.agent(agentId);
    if (!a || a.kind !== 'person' || !this.world.isPlayerMember(a)) return;
    this.agentId = agentId;
    this.elder = this.world.stageOf(a) === 'elder';
    const now = personLook(a, false);
    this.draft = { name: a.name, color: a.color, look: { skin: now.skin, hair: now.hair, hairStyle: now.hairStyle, pants: now.pants, extra: now.extra } };
    $('#editor').hidden = false;
    this.render();
  }

  close() {
    $('#editor').hidden = true;
    this.draft = null;
  }

  private swatches(kind: string, colors: readonly number[], current: number, label: string) {
    const btns = colors
      .map((c) => `<button class="cr-swatch${c === current ? ' on' : ''}" data-ed="${kind}" data-v="${c}" style="background:${hexColor(c)}" aria-label="${label} ${hexColor(c)}" aria-pressed="${c === current}"></button>`)
      .join('');
    return `<div class="cr-row"><span class="muted small">${label}</span><div class="cr-swatches">${btns}</div></div>`;
  }

  private render() {
    const d = this.draft;
    if (!d) return;
    const styles = HAIR_STYLES.map((s) => `<option value="${s}"${d.look.hairStyle === s ? ' selected' : ''}>${HAIR_STYLE_LABEL[s]}</option>`).join('');
    const extras = EXTRAS.map((x) => `<option value="${x}"${d.look.extra === x ? ' selected' : ''}>${EXTRA_LABEL[x]}</option>`).join('');
    const hair = this.elder ? 0xd9d9d9 : d.look.hair;
    $('#editor').innerHTML = `<div class="creator-card" role="dialog" aria-modal="true" aria-labelledby="editor-title">
      <h2 id="editor-title">✏️ Cambiar de look</h2>
      <div class="cr-person-head">
        <div class="cr-avatar" aria-hidden="true">
          <span class="cr-face cr-${esc(d.look.hairStyle)}" style="--skin:${hexColor(d.look.skin)};--hair:${hexColor(hair)}"><i class="cr-x cr-x-${esc(d.look.extra)}"></i></span>
          <span class="cr-body" style="background:${hexColor(d.color)}"></span>
          <span class="cr-legs" style="background:${hexColor(d.look.pants)}"></span>
          <span class="cr-name">${esc(d.name || '¿?')}</span>
        </div>
        <div class="cr-fields"><input data-ed="name" value="${esc(d.name)}" maxlength="20" placeholder="Nombre" aria-label="Nombre" /></div>
      </div>
      ${this.swatches('clothes', CLOTHES, d.color, 'Ropa')}
      ${this.swatches('pants', PANTS, d.look.pants, 'Pantalón')}
      ${this.swatches('skin', SKIN, d.look.skin, 'Piel')}
      ${this.swatches('hair', HAIR, d.look.hair, 'Pelo')}
      ${this.elder ? '<p class="muted small">Con la edad salen canas: el tinte se nota poco.</p>' : ''}
      <div class="cr-row"><span class="muted small">Peinado</span><select data-ed="style" aria-label="Peinado">${styles}</select></div>
      <div class="cr-row"><span class="muted small">En la cara</span><select data-ed="extra" aria-label="En la cara">${extras}</select></div>
      <ul class="cr-problems" aria-live="polite"></ul>
      <button class="ghost" data-ed="cancel">Cancelar</button>
      <div class="cr-actions">
        <button data-ed="random">🎲 Al azar</button>
        <button class="act" data-ed="save">Guardar</button>
      </div>
    </div>`;
  }

  private renderProblem(why: string | undefined) {
    const list = $('#editor').querySelector('.cr-problems');
    if (list) list.innerHTML = why ? `<li>⚠️ ${esc(why)}</li>` : '';
  }
}
