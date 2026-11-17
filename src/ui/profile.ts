// Perfil del personaje activo: ánimo, meta de vida, trabajo, rasgos, habilidades, mascota y relaciones.

import { MONEY_CATEGORIES } from '../data/economy';
import { BAR_MENUS, BAR_STAFF, CAREERS, WEEKDAY_LONG, gradeLabel, scheduleText } from '../data/careers';
import { PET_TRAIT_BY_ID, TRICKS } from '../data/pets';
import { MAX_SKILL, SKILLS } from '../data/skills';
import { SPECIES, lifeStage } from '../data/species';
import { TRAITS } from '../data/traits';
import { ASPIRATIONS, ASPIRATION_BY_ID } from '../sim/aspirations';
import { knownText } from '../sim/conversation';
import { emotionsOf } from '../sim/emotions';
import { MEMORY_TEXT, isAdult, relLabel } from '../sim/social';
import { traitsOf } from '../sim/traits';
import type { Agent, Rel } from '../sim/types';
import { $, esc, mood } from './dom';
import { Part } from './part';

export class ProfilePanel extends Part {
  aspPicking = false;
  traitOut = '';

  /** Engancha los eventos de su parte de la interfaz. */
  bind() {
    $('#profile-btn').addEventListener('click', () => this.openProfile());
    $('#who').addEventListener('click', () => this.openProfile());
    $('#profile').addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.id === 'profile') return this.closeProfile();
      const b = el.closest('button');
      if (!b) return;
      if (b.dataset.close !== undefined) return this.closeProfile();
      if (b.dataset.edit !== undefined) return this.hud.editor.open(this.subject().id);
      if (b.dataset.quit !== undefined && confirm('¿Seguro que quieres dejar el trabajo?')) {
        this.world.quitJob(this.subject());
        this.renderProfile();
      }
      const a = this.subject();
      if (b.dataset.barmenu || b.dataset.barstaff || b.dataset.barsunday) {
        const why = this.world.setBarPlan(a, {
          ...(b.dataset.barmenu ? { menu: b.dataset.barmenu as 'barata' | 'normal' | 'cara' } : {}),
          ...(b.dataset.barstaff ? { staff: b.dataset.barstaff === '1' } : {}),
          ...(b.dataset.barsunday ? { sunday: b.dataset.barsunday === '1' } : {}),
        });
        if (why) this.hud.toast(why, '🍺');
        this.renderProfile();
        return;
      }
      if (b.dataset.aspChange !== undefined) {
        this.aspPicking = !this.aspPicking;
        this.renderProfile();
      }
      if (b.dataset.asp) {
        this.world.setAspiration(a, b.dataset.asp);
        this.aspPicking = false;
        this.renderProfile();
      }
      if (b.dataset.tout) {
        this.traitOut = b.dataset.tout;
        this.renderProfile();
      }
      if (b.dataset.tin && this.traitOut) {
        this.world.pickTrait(a, this.traitOut, b.dataset.tin);
        this.traitOut = '';
        this.renderProfile();
      }
    });
  }

  /** De quién es el perfil abierto (por defecto, el personaje activo). */
  subjectId = '';

  subject() {
    return (this.subjectId && this.world.agent(this.subjectId)) || this.world.activeAgent;
  }

  openProfile(agentId = '') {
    this.subjectId = agentId;
    this.hud.sheet.closeSheet();
    $('#profile').hidden = false;
    this.renderProfile();
  }

  closeProfile() {
    $('#profile').hidden = true;
  }

  renderProfile() {
    const w = this.world;
    const a = this.subject();
    const mine = w.isPlayerMember(a);
    const stage = lifeStage(a.species, a.ageDays);
    let jobHtml = '';
    if (a.kind === 'person') {
      if (a.job) {
        const c = CAREERS[a.job.career];
        const lvl = c.levels[a.job.level - 1];
        const perfLabel = c.school ? `Notas: ${gradeLabel(a.job.perf)}` : `Rendimiento (al 100%, ascenso)`;
        jobHtml = `<div class="prof-sec">
          <div class="prof-h">${c.icon} ${c.school ? 'Colegio' : esc(lvl.title)}</div>
          <div class="muted small">${c.school ? '' : `${esc(c.name)} · nivel ${a.job.level}/${c.levels.length} · §${lvl.pay} por jornada · `}${esc(scheduleText(c))}</div>
          <div class="perf"><span class="small">${perfLabel}</span><div class="bar"><div class="fill" style="width:${Math.round(a.job.perf)}%;background:#4f8fd9"></div></div></div>
          ${c.business && mine ? this.barHtml(a) : ''}
          ${c.remote && mine ? '<div class="muted small">🧑‍💻 Se puede teletrabajar: toca el ordenador de casa y elige «Teletrabajar».</div>' : ''}
          ${c.school || !mine ? '' : '<button class="map-btn ghost small-btn" data-quit>Dejar el trabajo</button>'}
        </div>`;
      } else if (isAdult(a)) {
        jobHtml = `<div class="prof-sec"><div class="prof-h">💼 Sin trabajo</div><div class="muted small">Busca trabajo en el ordenador de casa.</div></div>`;
      }
    }
    const h = w.householdOf(a);
    if (h?.expecting && h.expecting.parents.includes(a.id)) {
      const due = h.expecting.due;
      const day = Math.floor(due / 1440) + 1;
      jobHtml += `<div class="prof-sec"><div class="prof-h">🍼 Bebé en camino</div><div class="muted small">Llegará el ${WEEKDAY_LONG[(day - 1) % 7]} (día ${day}).</div></div>`;
    }
    // Habilidades
    let skillsHtml = '';
    if (a.kind === 'person' && this.world.stageOf(a) !== 'baby') {
      const rows = SKILLS.map((sk) => {
        const v = a.skills?.[sk.id] ?? 0;
        const lvl = Math.floor(v);
        const pct = Math.round((v / MAX_SKILL) * 100);
        return `<div class="skill-row"><span>${sk.icon} ${esc(sk.label)}</span><div class="bar"><div class="fill" style="width:${pct}%;background:#f0a830"></div></div><b>${lvl}</b></div>`;
      }).join('');
      skillsHtml = `<div class="prof-sec"><div class="prof-h">⭐ Habilidades</div>${rows}<div class="muted small">Se practican cocinando, tocando la guitarra, pintando, haciendo deporte o pilates, jugando al ajedrez o charlando.</div></div>`;
    }
    // Relaciones con quien conoce
    const rows = Object.entries(w.state.rels)
      .map(([k, rel]) => {
        const [x, y] = k.split('|');
        const otherId = x === a.id ? y : y === a.id ? x : null;
        return otherId ? { o: w.agent(otherId), rel } : null;
      })
      .filter((r): r is { o: Agent; rel: Rel } => !!r && !!r.o && (Math.abs(r.rel.f) >= 1 || !!r.rel.status || !!r.rel.kin))
      .sort((p, q) => Number(!!q.rel.status) - Number(!!p.rel.status) || q.rel.f - p.rel.f);
    const relHtml = rows.length
      ? rows
          .map(({ o, rel }) => {
            const pct = Math.round((rel.f + 100) / 2);
            const color = rel.f >= 15 ? '#4cd964' : rel.f <= -15 ? '#ff4d3d' : '#a3a9bf';
            const hh = w.householdOf(o);
            const where = hh && hh.id !== w.household.id ? hh.name : 'Vuestra familia';
            return `<div class="rel-row">
              <span class="rel-face">${o.kind === 'person' ? '🧑' : SPECIES[o.species].icon}</span>
              <div class="rel-main">
                <div><b>${esc(o.name)}</b> <span class="muted small">${esc(where)}</span></div>
                <div class="small">${esc(relLabel(rel, a.kind, o.kind))}${rel.r > 0 && !rel.kin ? ` · 💕 ${Math.round(rel.r)}` : ''}</div>
                ${knownText(a, o) ? `<div class="small muted">💡 ${esc(knownText(a, o))}</div>` : ''}
                ${(rel.mem ?? [])
                  .slice(-2)
                  .reverse()
                  .map((m) => {
                    const mt = MEMORY_TEXT[m.k];
                    if (!mt) return '';
                    const by = m.by === a.id ? a.name : o.name;
                    const other = m.by === a.id ? o.name : a.name;
                    return `<div class="mem ${mt.bad ? 'bad' : ''}">${mt.icon} ${esc(mt.text.replace('{by}', by).replace('{other}', other))} · día ${m.d}</div>`;
                  })
                  .join('')}
                ${w.grudge(a, o) ? `<div class="mem bad">😒 ${esc(a.name)} aún no se lo ha perdonado</div>` : ''}
                ${rel.ex ? '<div class="mem">🏠 Ex, pero comparten piso</div>' : ''}
                <div class="bar"><div class="fill" style="width:${pct}%;background:${color}"></div></div>
              </div>
            </div>`;
          })
          .join('')
      : `<div class="muted small">${esc(a.name)} aún no conoce a nadie. ¡A socializar!</div>`;

    $('#profile').innerHTML = `<div class="map-card">
      <div class="sheet-head">
        <div><div class="sheet-title">${a.kind === 'person' ? '🧑' : SPECIES[a.species].icon} ${esc(a.name)}</div>
        <div class="sheet-sub">${esc(SPECIES[a.species].label)} · ${esc(stage.label)} · ${a.ageDays} ${a.ageDays === 1 ? 'día' : 'días'}${mine ? '' : ` · ${esc(w.householdOf(a)?.name ?? 'vecino/a')}`}</div></div>
        ${mine && a.kind === 'person' && w.stageOf(a) !== 'baby' ? '<button class="icon-btn" data-edit aria-label="Cambiar de look">✏️</button>' : ''}
        <button class="icon-btn" data-close>✕</button>
      </div>
      ${this.emotionsHtml(a)}
      ${this.aspirationHtml(a)}
      ${jobHtml}
      ${mine ? this.ledgerHtml() : ''}
      ${a.kind === 'person' ? `<div class="prof-sec"><div class="prof-h">🧬 Forma de ser</div>${traitsOf(a).map((x) => `<div class="trait-row"><span class="trait-icon">${x.icon}</span><div><b>${esc(x.label)}</b><div class="muted small">${esc(x.desc)}</div></div></div>`).join('')}${this.traitPickHtml(a)}<div class="muted small">Los hijos heredan un rasgo de sus padres. Y los hábitos cambian a la gente: quien corre mucho acaba siendo deportista.</div></div>` : ''}
      ${skillsHtml}
      ${this.petHtml(a)}
      <div class="prof-sec"><div class="prof-h">👥 Relaciones</div>${relHtml}</div>
    </div>`;
  }

  /** El bar: carta, camarero y domingos (se cambia una vez por semana). */
  barHtml(a: Agent): string {
    const plan = a.job?.bar ?? { menu: 'normal' as const };
    const locked = plan.week === Math.floor((this.world.day - 1) / 7);
    const dis = locked ? 'disabled' : '';
    const menus = (Object.keys(BAR_MENUS) as (keyof typeof BAR_MENUS)[])
      .map((k) => `<button class="comp ${plan.menu === k ? 'on' : ''}" data-barmenu="${k}" ${dis} title="${esc(BAR_MENUS[k].desc)}">${esc(BAR_MENUS[k].label)}</button>`)
      .join('');
    return `<div class="bar-plan">
      <div class="prof-h">🍺 Cómo llevas el bar ${locked ? '<span class="muted small">· hasta el lunes no se cambia</span>' : ''}</div>
      <div class="chips-wrap">${menus}</div>
      <div class="muted small">${esc(BAR_MENUS[plan.menu].desc)}</div>
      <div class="chips-wrap">
        <button class="comp ${plan.staff ? 'on' : ''}" data-barstaff="${plan.staff ? '0' : '1'}" ${dis}>🧑‍🍳 ${plan.staff ? `Camarero: ${esc(plan.staff)}` : `Contratar camarero (§${BAR_STAFF.wage}/día)`}</button>
        <button class="comp ${plan.sunday ? 'on' : ''}" data-barsunday="${plan.sunday ? '0' : '1'}" ${dis}>📅 ${plan.sunday ? 'Abre los domingos' : 'Abrir también los domingos'}</button>
      </div>
    </div>`;
  }

  /** Cuentas de la semana de la familia: ingresos y gastos por categoría, y el saldo. */
  ledgerHtml(): string {
    const w = this.world;
    const ledger = w.household.ledger ?? [];
    const week = Math.floor((w.day - 1) / 7);
    const cur = ledger.find((l) => l.week === week);
    const prev = ledger.find((l) => l.week === week - 1);
    const sum = (r: Record<string, number> = {}) => Object.values(r).reduce((s, v) => s + v, 0);
    const rows = (r: Record<string, number> = {}, sign: string) =>
      Object.entries(r)
        .sort((x, y) => y[1] - x[1])
        .map(([k, v]) => {
          const c = MONEY_CATEGORIES[k] ?? { icon: '•', label: k };
          return `<div class="money-row"><span>${c.icon} ${esc(c.label)}</span><b class="${sign === '+' ? 'in' : 'out'}">${sign}§${Math.round(v).toLocaleString('es-ES')}</b></div>`;
        })
        .join('');
    const balance = cur ? sum(cur.in) - sum(cur.out) : 0;
    const fmt = (n: number) => `${n >= 0 ? '+' : '−'}§${Math.abs(Math.round(n)).toLocaleString('es-ES')}`;
    const prevTxt = prev ? `<div class="muted small">La semana pasada: ${fmt(sum(prev.in) - sum(prev.out))}</div>` : '';
    const body = cur && (sum(cur.in) || sum(cur.out)) ? `${rows(cur.in, '+')}${rows(cur.out, '−')}<div class="money-row total"><span>Saldo de la semana</span><b class="${balance >= 0 ? 'in' : 'out'}">${fmt(balance)}</b></div>` : '<div class="muted small">Esta semana aún no ha entrado ni salido dinero.</div>';
    return `<div class="prof-sec"><div class="prof-h">💶 Cuentas de la semana</div>${body}${prevTxt}<div class="muted small">Los lunes se pagan las facturas (según la casa: tamaño, electrodomésticos y muebles de lujo) y la hipoteca.</div></div>`;
  }

  petHtml(a: Agent): string {
    if (a.kind !== 'pet') return '';
    const pt = PET_TRAIT_BY_ID[a.petTrait ?? ''];
    const fav = this.world.favoriteOf(a);
    const list = TRICKS[a.species];
    const tricks = list
      ? `<div class="perf"><span class="small">Adiestramiento</span><div class="bar"><div class="fill" style="width:${Math.round(a.training ?? 0)}%;background:#f0a830"></div></div></div>
        ${list.map((t, i) => `<div class="asp-stage ${a.tricks?.includes(t) ? '' : 'muted'}"><span>${a.tricks?.includes(t) ? '🎪' : '🔒'}</span>${esc(t)}<span class="muted small">${a.tricks?.includes(t) ? '' : ` (${(i + 1) * 20}%)`}</span></div>`).join('')}
        <div class="muted small">Tócale y elige «Adiestrar». Aprende antes si es listo, si está contento y con su persona favorita.</div>`
      : '<div class="muted small">Vive a su ritmo en su jaula: no aprende trucos, pero agradece los mimos.</div>';
    return `<div class="prof-sec"><div class="prof-h">🐾 Carácter</div>
      ${pt ? `<div class="trait-row"><span class="trait-icon">${pt.icon}</span><div><b>${esc(pt.label)}</b><div class="muted small">${esc(pt.desc)}</div></div></div>` : ''}
      <div class="small">${fav ? `❤️ Su persona favorita: <b>${esc(fav.name)}</b> (la recibe al llegar a casa)` : '❤️ Aún no tiene persona favorita: dale cariño'}</div></div>
      <div class="prof-sec"><div class="prof-h">🎪 Trucos</div>${tricks}</div>`;
  }

  aspirationHtml(a: Agent): string {
    const w = this.world;
    if (a.kind !== 'person' || !w.isPlayerMember(a) || !a.aspiration) return '';
    const def = ASPIRATION_BY_ID[a.aspiration.id];
    if (!def) return '';
    const done = a.aspiration.stage >= def.stages.length;
    const stages = def.stages
      .map((st, i) => `<div class="asp-stage ${i < a.aspiration!.stage ? 'done' : i === a.aspiration!.stage ? 'now' : ''}"><span>${i < a.aspiration!.stage ? '✅' : i === a.aspiration!.stage ? '👉' : '⬜'}</span>${esc(st.label)}</div>`)
      .join('');
    const picker = this.aspPicking
      ? `<div class="chips-wrap">${ASPIRATIONS.filter((x) => x.id !== def.id)
          .map((x) => `<button class="comp" data-asp="${x.id}">${x.icon} ${esc(x.label)}${(a.aspirationsDone ?? []).includes(x.id) ? ' ✓' : ''}</button>`)
          .join('')}</div><div class="muted small">Al cambiar de meta se empieza de cero (lo que ya tenga hecho cuenta).</div>`
      : '';
    return `<div class="prof-sec"><div class="prof-h">🎯 Meta de vida: ${def.icon} ${esc(def.label)}${done ? ' 🏆' : ''}</div>
      <div class="muted small">${esc(def.desc)}${done ? ' ¡Cumplida!' : ` Cada etapa da dinero; la meta entera, §1.500.`}</div>
      ${stages}
      <button class="map-btn ghost small-btn" data-asp-change>${done ? 'Elegir otra meta' : this.aspPicking ? 'Cancelar' : 'Cambiar de meta'}</button>
      ${picker}</div>`;
  }

  traitPickHtml(a: Agent): string {
    if (!a.traitPick) return '';
    const mine = traitsOf(a).map((t) => t.id);
    if (!this.traitOut) {
      return `<div class="prof-h" style="margin-top:8px">✨ Ya es adulto/a: ¿qué rasgo cambia?</div><div class="chips-wrap">${traitsOf(a)
        .map((t) => `<button class="comp" data-tout="${t.id}">${t.icon} Cambiar ${esc(t.label.toLowerCase())}</button>`)
        .join('')}</div>`;
    }
    return `<div class="prof-h" style="margin-top:8px">✨ ¿Por cuál?</div><div class="chips-wrap">${TRAITS.filter((t) => !mine.includes(t.id))
      .map((t) => `<button class="comp" data-tin="${t.id}">${t.icon} ${esc(t.label)}</button>`)
      .join('')}</div>`;
  }

  emotionsHtml(a: Agent): string {
    const w = this.world;
    const emos = emotionsOf(a).filter((e) => e.until > w.state.minutes);
    const md = mood(a);
    const rows = emos
      .sort((x, y) => y.def.value - x.def.value)
      .map((e) => {
        const h = Math.max(1, Math.round((e.until - w.state.minutes) / 60));
        return `<div class="emo-row"><span>${e.def.icon}</span><span>${esc(e.def.label)}${e.about ? ` <span class="muted small">(${esc(e.about)})</span>` : ''}<div class="muted small">${h >= 24 ? `${Math.round(h / 24)} ${Math.round(h / 24) === 1 ? 'día' : 'días'}` : `${h} h`} más</div></span><span class="v ${e.def.value < 0 ? 'bad' : 'good'}">${e.def.value > 0 ? '+' : ''}${e.def.value}</span></div>`;
      })
      .join('');
    return `<div class="prof-sec"><div class="prof-h">${md.icon} Ánimo: ${esc(md.label)}</div>${rows || '<div class="muted small">Nada especial: va tirando. El ánimo depende de sus necesidades y de lo que le pase.</div>'}</div>`;
  }
}
