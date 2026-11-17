// Creador de familia: apellido, hasta 4 personas (nombre, edad, rasgos y aspecto),
// si los dos primeros adultos son pareja y una mascota. Sale la primera vez que se juega
// y al empezar una partida nueva. La familia García sigue a un toque.

import { CLOTHES, HAIR, HAIR_STYLES, HAIR_STYLE_LABEL, SKIN } from '../data/looks';
import { SPECIES } from '../data/species';
import { sexOfName } from '../data/names';
import { TRAITS } from '../data/traits';
import { GARCIA, MAX_START_PEOPLE, STAGE_LABEL, familyProblems, randomFamily, randomPerson, type FamilySpec, type PersonSpec, type StartStage } from '../sim/family';
import type { SpeciesId } from '../sim/types';
import { $, esc, hexColor } from './dom';
import { Part } from './part';

const STAGES = Object.keys(STAGE_LABEL) as StartStage[];
const PETS = (Object.keys(SPECIES) as SpeciesId[]).filter((s) => SPECIES[s].kind === 'pet');

/** Copia profunda (para no tocar la familia García original). */
const clone = (f: FamilySpec): FamilySpec => JSON.parse(JSON.stringify(f));

export class FamilyCreator extends Part {
  private draft: FamilySpec = clone(GARCIA);
  private onDone: ((f: FamilySpec | null) => void) | null = null;
  private cancellable = false;

  get isOpen() {
    return !$('#creator').hidden;
  }

  bind() {
    const root = $('#creator');
    root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      const i = Number(b.dataset.i);
      const p = this.draft.people[i];
      switch (b.dataset.cr) {
        case 'random': this.draft = randomFamily(); break;
        case 'add':
          if (this.draft.people.length < MAX_START_PEOPLE) this.draft.people.push(randomPerson(this.draft.people.length < 2 ? 'young' : 'child', this.draft.people.map((x) => x.name)));
          break;
        case 'remove': this.draft.people.splice(i, 1); break;
        case 'reroll': if (p) this.draft.people[i] = { ...randomPerson(p.stage, this.draft.people.map((x) => x.name)), name: p.name }; break;
        case 'clothes': if (p) p.color = Number(b.dataset.v); break;
        case 'skin': if (p) p.look = { ...p.look, skin: Number(b.dataset.v) }; break;
        case 'hair': if (p) p.look = { ...p.look, hair: Number(b.dataset.v) }; break;
        case 'garcia': return this.close(clone(GARCIA));
        case 'cancel': return this.close(null);
        case 'start':
          if (familyProblems(this.draft).length) return this.renderProblems(true);
          return this.close(this.cleaned());
        default: return;
      }
      this.render();
    });
    // Lo que se escribe no repinta (si no, se perdería el foco): solo actualiza el borrador.
    root.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      const p = this.draft.people[Number(el.dataset.i)];
      if (el.dataset.f === 'surname') this.draft.surname = el.value;
      else if (el.dataset.f === 'name' && p) {
        p.name = el.value;
        const label = root.querySelector(`[data-avatar-name="${el.dataset.i}"]`);
        if (label) label.textContent = el.value || '¿?';
      } else if (el.dataset.f === 'petname' && this.draft.pets[0]) this.draft.pets[0].name = el.value;
      this.renderProblems(false);
    });
    root.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement | HTMLSelectElement;
      const p = this.draft.people[Number(el.dataset.i)];
      switch (el.dataset.f) {
        case 'stage': if (p) p.stage = el.value as StartStage; delete p?.ageDays; break;
        case 'sex': if (p) p.sex = el.value as 'f' | 'm'; break;
        case 'trait0': if (p) p.traits = [el.value, p.traits[1]]; break;
        case 'trait1': if (p) p.traits = [p.traits[0], el.value]; break;
        case 'style': if (p) p.look = { ...p.look, hairStyle: el.value }; break;
        case 'couple': this.draft.couple = (el as HTMLInputElement).checked; break;
        case 'pet': {
          const s = el.value as SpeciesId | '';
          this.draft.pets = s ? [{ species: s, name: this.draft.pets[0]?.name || SPECIES[s].names[0] }] : [];
          // Si se cambia de especie, el nombre por defecto también (el que se escribió a mano, no).
          if (s && SPECIES[s].names.length && PETS.some((o) => SPECIES[o].names.includes(this.draft.pets[0].name))) this.draft.pets[0].name = SPECIES[s].names[0];
          break;
        }
        default: return;
      }
      this.render();
    });
  }

  /** Abre el creador. `cancellable`: si se puede volver atrás (desde el menú). */
  open(opts: { cancellable: boolean }, onDone: (f: FamilySpec | null) => void) {
    this.draft = clone(GARCIA);
    this.cancellable = opts.cancellable;
    this.onDone = onDone;
    $('#creator').hidden = false;
    this.render();
    $('#creator').scrollTop = 0;
  }

  private close(f: FamilySpec | null) {
    $('#creator').hidden = true;
    const cb = this.onDone;
    this.onDone = null;
    cb?.(f);
  }

  /** La familia tal cual se va a crear (sin espacios de más). */
  private cleaned(): FamilySpec {
    const f = clone(this.draft);
    f.surname = f.surname.trim();
    for (const p of f.people) p.name = p.name.trim();
    for (const pet of f.pets) pet.name = pet.name.trim();
    return f;
  }

  private avatar(p: PersonSpec, i: number) {
    const skin = hexColor(p.look?.skin ?? SKIN[0]);
    const hair = hexColor(p.look?.hair ?? HAIR[0]);
    return `<div class="cr-avatar" aria-hidden="true">
      <span class="cr-face cr-${esc(p.look?.hairStyle ?? 'short')}" style="--skin:${skin};--hair:${hair}"></span>
      <span class="cr-body" style="background:${hexColor(p.color)}"></span>
      <span class="cr-name" data-avatar-name="${i}">${esc(p.name || '¿?')}</span>
    </div>`;
  }

  private swatches(kind: 'clothes' | 'skin' | 'hair', colors: readonly number[], current: number | undefined, i: number, label: string) {
    const btns = colors
      .map((c) => `<button class="cr-swatch${c === current ? ' on' : ''}" data-cr="${kind}" data-i="${i}" data-v="${c}" style="background:${hexColor(c)}" aria-label="${label} ${hexColor(c)}" aria-pressed="${c === current}"></button>`)
      .join('');
    return `<div class="cr-row"><span class="muted small">${label}</span><div class="cr-swatches">${btns}</div></div>`;
  }

  private traitSelect(p: PersonSpec, i: number, slot: 0 | 1) {
    const opts = TRAITS.map((t) => `<option value="${t.id}"${p.traits[slot] === t.id ? ' selected' : ''}>${t.icon} ${esc(t.label)}</option>`).join('');
    return `<select data-f="trait${slot}" data-i="${i}" aria-label="Rasgo ${slot + 1} de ${esc(p.name)}">${opts}</select>`;
  }

  private personCard(p: PersonSpec, i: number) {
    const stages = STAGES.map((s) => `<option value="${s}"${p.stage === s ? ' selected' : ''}>${STAGE_LABEL[s]}</option>`).join('');
    const styles = HAIR_STYLES.map((s) => `<option value="${s}"${(p.look?.hairStyle ?? 'short') === s ? ' selected' : ''}>${HAIR_STYLE_LABEL[s]}</option>`).join('');
    const desc = p.traits.map((id) => TRAITS.find((t) => t.id === id)?.desc).filter(Boolean).join(' ');
    return `<div class="cr-person">
      <div class="cr-person-head">
        ${this.avatar(p, i)}
        <div class="cr-fields">
          <input data-f="name" data-i="${i}" value="${esc(p.name)}" maxlength="20" placeholder="Nombre" aria-label="Nombre" />
          <select data-f="stage" data-i="${i}" aria-label="Edad">${stages}</select>
          <select data-f="sex" data-i="${i}" aria-label="Mujer u hombre"><option value="f"${(p.sex ?? sexOfName(p.name)) === 'f' ? ' selected' : ''}>Mujer</option><option value="m"${(p.sex ?? sexOfName(p.name)) === 'm' ? ' selected' : ''}>Hombre</option></select>
        </div>
        <div class="cr-tools">
          <button class="icon-btn" data-cr="reroll" data-i="${i}" aria-label="Rasgos y aspecto al azar">🎲</button>
          ${this.draft.people.length > 1 ? `<button class="icon-btn" data-cr="remove" data-i="${i}" aria-label="Quitar a ${esc(p.name)}">✕</button>` : ''}
        </div>
      </div>
      <div class="cr-traits">${this.traitSelect(p, i, 0)}${this.traitSelect(p, i, 1)}</div>
      <p class="muted small cr-desc">${esc(desc)}</p>
      ${this.swatches('clothes', CLOTHES, p.color, i, 'Ropa')}
      ${this.swatches('skin', SKIN, p.look?.skin, i, 'Piel')}
      ${this.swatches('hair', HAIR, p.look?.hair, i, 'Pelo')}
      <div class="cr-row"><span class="muted small">Peinado</span><select data-f="style" data-i="${i}" aria-label="Peinado">${styles}</select></div>
    </div>`;
  }

  private render() {
    const f = this.draft;
    const pet = f.pets[0];
    const petOpts = [`<option value="">Sin mascota</option>`, ...PETS.map((s) => `<option value="${s}"${pet?.species === s ? ' selected' : ''}>${SPECIES[s].icon} ${esc(SPECIES[s].label)}</option>`)].join('');
    $('#creator').innerHTML = `<div class="creator-card" role="dialog" aria-modal="true" aria-labelledby="creator-title">
      <h2 id="creator-title">🏡 Tu familia</h2>
      <p class="muted small">Elige quién vive en la casa. Lo demás (trabajo, amigos, líos) ya irá saliendo.</p>
      <label class="cr-row cr-surname"><span>Familia</span><input data-f="surname" value="${esc(f.surname)}" maxlength="20" placeholder="Apellido" aria-label="Apellido" /></label>
      <div class="cr-people">${f.people.map((p, i) => this.personCard(p, i)).join('')}</div>
      ${f.people.length < MAX_START_PEOPLE ? `<button class="ghost cr-add" data-cr="add">➕ Añadir a alguien</button>` : ''}
      <label class="cr-check"><input type="checkbox" data-f="couple"${f.couple ? ' checked' : ''} /> Los dos primeros adultos son pareja</label>
      <div class="cr-row cr-pet">
        <span>Mascota</span>
        <select data-f="pet" aria-label="Mascota">${petOpts}</select>
        ${pet ? `<input data-f="petname" value="${esc(pet.name)}" maxlength="20" placeholder="Nombre" aria-label="Nombre de la mascota" />` : ''}
      </div>
      <ul class="cr-problems" aria-live="polite"></ul>
      <button class="ghost" data-cr="garcia">Familia García (rápido)</button>
      ${this.cancellable ? `<button class="ghost" data-cr="cancel">Volver al juego</button>` : ''}
      <div class="cr-actions">
        <button data-cr="random">🎲 Al azar</button>
        <button class="act" data-cr="start">Empezar</button>
      </div>
    </div>`;
    this.renderProblems(false);
  }

  /** Lo que falla. `loud`: si se ha intentado empezar, se marca bien a la vista. */
  private renderProblems(loud: boolean) {
    const list = $('#creator').querySelector('.cr-problems');
    if (!list) return;
    const probs = familyProblems(this.draft);
    list.innerHTML = probs.map((p) => `<li>⚠️ ${esc(p)}</li>`).join('');
    list.classList.toggle('loud', loud && probs.length > 0);
    $('#creator').querySelector<HTMLButtonElement>('[data-cr="start"]')!.classList.toggle('disabled', probs.length > 0);
  }
}
