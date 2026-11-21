// Qué se puede hacer: comprobaciones de cada acción y opciones del menú.
// Funciones que reciben el mundo (`w`) y operan sobre `w.state`; World las expone como fachada.

import { ACTIONS, PLAYER_SELF_ACTIONS, SELF_ACTIONS, type ActionDef } from '../../data/actions';
import { CAREERS } from '../../data/careers';
import { ELECTRIC, POWERED_ACTIONS } from '../../data/seasons';
import { ALCOHOL } from '../../data/street';
import { FRIDGE_FOOD, MAX_MEMBERS } from '../constants';
import { ROMANTIC, canRomance, getRel, isAdult, partnerOf } from '../social';
import type { Agent, PlacedObject } from '../types';
import type { ActionOption, Target, World } from '../world';
import { costOf, lotteryReason } from './calendar';
import { cantMoveOut, freeBed, freeCrib } from './lifecycle';
import { nearHammock } from './pets';
import { closedReason, pantryOwner } from './shopping';
import { skillLevel } from './skills';
import { WORK_ROLES, checkWorkTask, isWorkLot, jobsOf, taskOptions, workLotId } from './work';
import { EMOTIONS } from '../../data/emotions';
import { moodScore } from '../util';
import { grudge } from './social';
import { canMediate, canSnitch } from './arcs';
import { tripReason } from './trips';
import { HOLIDAY_ACTIONS, holidayReason } from './holidays';
import { STREET_ACTIONS, billsReason, hasPower } from './bills';
import { isPregnant } from './fertility';
import { HATE } from './violence';
import { moveOutReason } from './breakups';
import { dailyReason, skillCheck, skillLocked } from './skillWorks';
import { homemadeReason, secondhandOffers, stallGoods } from './places';

/** Lo de las habilidades: el nivel (si no, ni aparece), lo de cada acción y el «una vez al día». */
function skillGate(w: World, a: Agent, def: ActionDef, o?: PlacedObject): ActionOption | undefined {
  if (skillLocked(w, a, def)) return { def, ok: false, hidden: true };
  const c = skillCheck(w, a, def, o);
  if (c) return { def, ok: false, ...c };
  const daily = dailyReason(w, a, def);
  if (daily) return { def, ok: false, reason: daily };
  return undefined;
}

export function speciesOk(w: World, a: Agent, def: ActionDef) {
  if (!def.actors.includes(a.kind) || (def.species && !def.species.includes(a.species))) return false;
  // Los bebés solo hacen cosas de bebé (dormir en la cuna, llorar).
  const st = a.kind === 'person' ? w.stageOf(a) : '';
  if (def.actorStages) return def.actorStages.includes(st);
  return st !== 'baby';
}

export function checkObjectAction(w: World, a: Agent, o: PlacedObject, actionId: string): ActionOption {
  if (actionId.startsWith('wt_')) return checkWorkTask(w, a, o, actionId);
  const def = ACTIONS[actionId];
  const od = w.objDef(o);
  if (!speciesOk(w, a, def)) return { def, ok: false, reason: `${a.name} no puede hacer esto` };
  if (o.lotId !== a.lotId || a.travel) return { def, ok: false, reason: 'No está aquí' };
  if (a.home && a.home !== o.id) return { def, ok: false, reason: 'No puede salir de su jaula' };
  if (!def.guestOk && w.isGuest(a)) return { def, ok: false, reason: 'Estás de visita' };
  if (actionId === 'take_course') return { def, ok: false, hidden: true };
  const gate = skillGate(w, a, def, o);
  if (gate) return gate;
  if (actionId === 'enroll') {
    if (!w.isPlayerMember(a) || a.study || w.stageOf(a) === 'elder') return { def, ok: false };
  }
  if (actionId === 'study_exams' && !(a.job && CAREERS[a.job.career]?.school)) return { def, ok: false, reason: 'Solo para quien estudia' };
  if (actionId === 'move_out') {
    // Solo tiene sentido tras romper con alguien de la casa.
    const exAtHome = w.state.agents.some((o) => o.householdId === a.householdId && o !== a && getRel(w.state, a.id, o.id).ex);
    if (!exAtHome || !w.isPlayerMember(a)) return { def, ok: false };
    const why = moveOutReason(w, a);
    if (why) return { def, ok: false, reason: why };
  }
  if (actionId === 'call_doctor') {
    if (!a.illness) return { def, ok: false };
    if (a.illness.treated) return { def, ok: false, reason: 'Ya tiene tratamiento' };
  }
  if (ALCOHOL[actionId] && isPregnant(w, a)) return { def, ok: false, reason: 'Embarazada: nada de alcohol' };
  // Sin agua (cortada), ni ducha ni cisterna, esté o no ocupada; y lo de la calle, solo sin casa.
  const street = billsReason(w, a, actionId, o.lotId);
  if (street) return { def, ...street };
  if (actionId === 'wash_up' && w.lotById(o.lotId)?.householdId === a.householdId) return { def, ok: false };
  if (actionId === 'repair') {
    if (!o.broken) return { def, ok: false };
    if (!isAdult(a) && w.stageOf(a) !== 'teen') return { def, ok: false, reason: 'Es cosa de mayores' };
  } else if (o.broken) return { def, ok: false, reason: 'Está roto' };
  if (actionId === 'watch_tv') {
    const tv = w.objectsIn(o.lotId).find((x) => x.def === 'tv');
    if (!tv) return { def, ok: false, reason: 'No hay tele' };
    if (tv.broken) return { def, ok: false, reason: 'La tele está rota' };
  }
  const resident = w.residentOf(o.id);
  if (resident && def.actors.includes('pet') && resident !== a) return { def, ok: false, reason: `Es la casa de ${resident.name}` };
  if (w.usersOf(o.id, a).length >= (actionId === 'repair' ? Math.max(1, od.capacity) : od.capacity)) return { def, ok: false, reason: 'Ocupado' };
  if (def.consumes && !o.stock) return { def, ok: false, reason: 'Está vacío' };
  if (def.refill && (o.stock ?? 0) >= (od.maxStock ?? 0)) return { def, ok: false, reason: 'Ya está lleno' };
  if (def.dirties && od.maxDirt && (o.dirt ?? 0) >= od.maxDirt) return { def, ok: false, reason: 'Está demasiado sucio' };
  if (def.cleans && !o.dirt) return { def, ok: false, reason: 'Ya está limpio' };
  if (actionId === 'steal' && nearHammock(w, o)) return { def, ok: false, reason: 'Ya está escondido' };
  if (actionId === 'adopt' && w.members.length >= MAX_MEMBERS) return { def, ok: false, reason: 'La casa está llena' };
  if (actionId === 'find_job' && !isAdult(a) && w.stageOf(a) !== 'teen') return { def, ok: false, reason: 'Primero, el colegio' };
  if (actionId === 'find_job' && a.done?.find_job === w.day) return { def, ok: false, reason: 'Hoy ya ha echado currículums: mañana más' };
  const funds = w.householdOf(a)?.funds ?? 0;
  if (def.cost && funds < costOf(w, actionId, a)) return { def, ok: false, reason: 'No hay dinero' };
  if ((ELECTRIC.has(o.def) || POWERED_ACTIONS.has(actionId)) && !hasPower(w, o.lotId)) return { def, ok: false, reason: w.hasEvent('apagon', o.lotId) ? 'No hay luz' : 'No hay luz: os la han cortado' };

  // Comer de la nevera gasta raciones de la despensa de esa casa.
  if (FRIDGE_FOOD.has(actionId)) {
    const owner = pantryOwner(w, o.lotId);
    if (owner && (owner.pantry ?? 0) <= 0) return { def, ok: false, reason: 'La nevera está vacía: toca ir al Mercadona' };
  }
  // Horarios de las tiendas
  const closed = closedReason(w, o.lotId);
  if (closed) return { def, ok: false, reason: closed };
  if (actionId === 'order_groceries' && w.householdOf(a)?.delivery) return { def, ok: false, reason: 'Ya hay un pedido en camino' };
  if (actionId === 'throw_party') {
    if (!w.isPlayerMember(a) || o.lotId !== w.household.lotId) return { def, ok: false };
    if (w.state.party) return { def, ok: false, reason: 'Ya hay una fiesta montada' };
    if (w.hour < 10 || w.hour >= 21) return { def, ok: false, reason: 'Las fiestas, de 10:00 a 21:00' };
  }
  if (actionId === 'book_trip') {
    if (!w.isPlayerMember(a)) return { def, ok: false };
    const why = tripReason(w);
    if (why) return { def, ok: false, reason: why };
  }
  if (actionId === 'work_home') {
    const c = a.job && CAREERS[a.job.career];
    if (!c?.remote) return { def, ok: false };
    if (a.job!.homeDay === w.day) return { def, ok: false, reason: 'Hoy ya ha teletrabajado' };
  }
  if (actionId === 'day_off') {
    if (!a.job || CAREERS[a.job.career]?.school) return { def, ok: false, reason: 'No tiene trabajo' };
    if (a.job.dayOff === w.day + 1) return { def, ok: false, reason: 'Ya lo tiene pedido' };
  }
  if (ALCOHOL[actionId] && w.hour < 12 && w.hour >= 6) return { def, ok: false, reason: '¿Alcohol a estas horas? Mejor un café' };
  const fiesta = holidayReason(w, a, actionId);
  if (fiesta) return fiesta;
  if (actionId === 'buy_lottery') {
    const why = lotteryReason(w, a);
    if (why) return { def, ok: false, reason: why };
  }
  // Mercadillos: comprar muebles de segunda mano y vender lo vuestro (solo la familia del jugador).
  if (actionId === 'buy_secondhand' || actionId === 'sell_stall' || actionId === 'sell_homemade') {
    if (!w.isPlayerMember(a)) return { def, ok: false, hidden: true };
    if (actionId === 'buy_secondhand' && secondhandOffers(w, o.lotId).every((x) => x.sold)) return { def, ok: false, reason: 'Ya se lo han llevado todo: la semana que viene, más' };
    if (actionId === 'sell_stall' && !stallGoods(w).length) return { def, ok: false, reason: 'No tenéis nada en casa que se pueda vender' };
    const why = actionId === 'sell_homemade' ? homemadeReason(w, a) : undefined;
    if (why) return { def, ok: false, reason: why };
  }
  return { def, ok: true };
}

/** Lo que se puede hacer con el jefe y los compañeros de trabajo (además de lo suyo). */
const WORK_SOCIAL = new Set(['chat', 'talk', 'joke', 'gossip_with', 'hug', 'flirt', 'kiss', 'insult', 'argue', 'apologize', 'ask_affair', 'end_affair', 'high_five', 'invite_coffee', 'ask_advice', 'cheer_up', 'confide', 'give_gift']);

export function checkSocialAction(w: World, a: Agent, t: Agent, actionId: string): ActionOption {
  const def = ACTIONS[actionId];
  if (!speciesOk(w, a, def) || !def.targetKinds?.includes(t.kind)) return { def, ok: false };
  if (def.targetSpecies && !def.targetSpecies.includes(t.species)) return { def, ok: false };
  const gate = skillGate(w, a, def);
  if (gate) return gate;
  if (actionId === 'serenade' && (!canRomance(w.state, a, t) || (!getRel(w.state, a.id, t.id).status && getRel(w.state, a.id, t.id).r < 20))) return { def, ok: false };
  if (actionId === 'portrait' && w.stageOf(t) === 'baby') return { def, ok: false };
  // Despedir solo a invitados de otra familia que están en tu casa.
  if (actionId === 'say_goodbye' && (t.householdId === a.householdId || !t.visitUntil || w.isGuest(a))) return { def, ok: false };
  {
    const r0 = getRel(w.state, a.id, t.id);
    if (actionId === 'best_friends' && (r0.best || r0.f < 60)) return { def, ok: false };
    if (actionId === 'ban' && (r0.banned || t.householdId === a.householdId || r0.status || !w.isPlayerMember(a))) return { def, ok: false };
    if (actionId === 'unban' && r0.banned !== a.id) return { def, ok: false };
    // Las enemistades que acaban mal: nunca con niños ni con los de la propia casa.
    if (actionId === 'fight' || actionId === 'poison') {
      const young = (x: Agent) => ['baby', 'child'].includes(w.stageOf(x));
      if (young(a) || young(t) || t.householdId === a.householdId || t.role) return { def, ok: false };
      if (actionId === 'fight' && (w.stageOf(a) === 'teen' && w.stageOf(t) !== 'teen')) return { def, ok: false };
      if (actionId === 'fight' && r0.f > HATE.fight) return { def, ok: false };
      if (actionId === 'poison' && (r0.f > HATE.poison || !isAdult(a))) return { def, ok: false };
    }
  }
  const tStage = t.kind === 'person' ? w.stageOf(t) : '';
  if (def.targetStages ? !def.targetStages.includes(tStage) : tStage === 'baby') return { def, ok: false };
  if (ROMANTIC.has(actionId)) {
    if (!canRomance(w.state, a, t)) return { def, ok: false };
    if (actionId === 'niqui') {
      const rel0 = getRel(w.state, a.id, t.id);
      if (!rel0.status && (rel0.r < 50 || rel0.f < 30)) return { def, ok: false };
      const lot = w.lotById(a.lotId);
      if (lot.kind !== 'home' || (lot.householdId !== a.householdId && lot.householdId !== t.householdId)) return { def, ok: false, reason: 'Mejor en casa' };
      if (!freeBed(w, a.lotId)) return { def, ok: false, reason: 'Hace falta una cama libre' };
    }
    if (actionId === 'try_baby') {
      const rel0 = getRel(w.state, a.id, t.id);
      if (!rel0.status || t.householdId !== a.householdId) return { def, ok: false };
      if (w.stageOf(a) === 'elder' || tStage === 'elder') return { def, ok: false, reason: 'Ya no tenéis edad' };
      const h = w.householdOf(a)!;
      if (h.expecting) return { def, ok: false, reason: 'Ya hay un bebé en camino' };
      if (h.memberIds.length >= MAX_MEMBERS) return { def, ok: false, reason: 'La casa está llena' };
      if (!freeCrib(w, h.lotId)) return { def, ok: false, reason: 'Hace falta una cuna libre' };
    }
    const rel = getRel(w.state, a.id, t.id);
    const mine = partnerOf(w.state, a.id);
    if (actionId === 'ask_partner') {
      if (rel.status) return { def, ok: false };
      if (mine) return { def, ok: false, reason: 'Ya tienes pareja' };
    }
    if (actionId === 'propose' && rel.status !== 'partner') return { def, ok: false };
    if (actionId === 'move_in') {
      if (!rel.status || t.householdId === a.householdId || !w.isPlayerMember(a)) return { def, ok: false };
      if (w.members.length >= MAX_MEMBERS) return { def, ok: false, reason: 'La casa está llena' };
      const why = cantMoveOut(w, t);
      if (why) return { def, ok: false, reason: why };
    }
  }
  const relX = getRel(w.state, a.id, t.id);
  // Gente de la calle: solo lo suyo (y charlar).
  if (def.targetRoles && !def.targetRoles.includes(t.role ?? '')) return { def, ok: false };
  if (t.role && !def.targetRoles && !['chat', 'talk', 'joke', 'gossip_with', 'hug'].includes(actionId) && !(WORK_ROLES.has(t.role) && WORK_SOCIAL.has(actionId))) return { def, ok: false };
  // Con el jefe y los compañeros: solo si trabaja allí.
  if (def.targetRoles?.some((r) => WORK_ROLES.has(r))) {
    const here = jobsOf(a).some((j) => t.post === workLotId(j.job.career));
    if (!here) return { def, ok: false };
  }
  if (actionId === 'cheer_up' && moodScore(t) >= 45 && !(t.emotions ?? []).some((e) => (EMOTIONS[e.id]?.value ?? 0) < 0)) return { def, ok: false };
  if (actionId === 'confide' && relX.f < 30) return { def, ok: false, reason: 'Aún no hay tanta confianza' };
  if (actionId === 'tickle' && relX.f < 20 && !relX.kin) return { def, ok: false };
  if (actionId === 'vet' || actionId === 'vet_checkup') {
    if (t.householdId !== a.householdId || !w.isPlayerMember(a)) return { def, ok: false };
    if (actionId === 'vet' && !t.illness) return { def, ok: false };
    if (actionId === 'vet' && t.illness?.treated) return { def, ok: false, reason: 'Ya está en tratamiento' };
    if (actionId === 'vet_checkup' && t.illness) return { def, ok: false };
    if (actionId === 'vet_checkup' && t.vetCheck !== undefined && w.day - t.vetCheck < 10) return { def, ok: false, reason: 'Ya le han hecho la revisión hace poco' };
  }
  if (a.role && !['chat', 'joke'].includes(actionId)) return { def, ok: false };
  if (actionId === 'ask_affair') {
    if (relX.status || relX.affair || relX.kin || !canRomance(w.state, a, t)) return { def, ok: false };
    if (!partnerOf(w.state, a.id) && !partnerOf(w.state, t.id)) return { def, ok: false };
    if (relX.r < 40) return { def, ok: false, reason: 'Aún no hay tanta química' };
  }
  if (actionId === 'end_affair' && !relX.affair) return { def, ok: false };
  if (actionId === 'mediate' && (!w.isPlayerMember(a) || !canMediate(w, t))) return { def, ok: false };
  if (actionId === 'snitch' && (!w.isPlayerMember(a) || !canSnitch(w, t))) return { def, ok: false };
  if (actionId === 'chotis' && (!['young', 'adult', 'elder', 'teen'].includes(tStage) || w.stageOf(a) === 'child')) return { def, ok: false };
  if (actionId === 'break_up' && relX.status !== 'partner') return { def, ok: false };
  if (actionId === 'divorce' && relX.status !== 'married') return { def, ok: false };
  if (actionId === 'apologize' && !grudge(w, t, a) && relX.f >= -10) return { def, ok: false };
  if (actionId === 'argue' && (a.kind !== 'person' || ['baby'].includes(tStage))) return { def, ok: false };
  if (actionId === 'train_pet') {
    if (t.householdId !== a.householdId) return { def, ok: false };
    if ((t.training ?? 0) >= 100) return { def, ok: false, reason: 'Ya se sabe todos los trucos' };
  }
  if (actionId === 'show_trick' && !t.tricks?.length) return { def, ok: false };
  if (a.home) return { def, ok: false, reason: 'No puede salir de su jaula' };
  if (t.home && def.offLot) return { def, ok: false };
  if (def.offLot && (t.householdId !== a.householdId || w.isGuest(a))) return { def, ok: false };
  if (t.lotId !== a.lotId || t.travel) return { def, ok: false, reason: `${t.name} no está aquí` };
  if (t.hidden) return { def, ok: false, reason: `${t.name} no está en casa` };
  return { def, ok: true };
}

export function checkSelfAction(w: World, a: Agent, actionId: string): ActionOption {
  const def = ACTIONS[actionId];
  if (!speciesOk(w, a, def)) return { def, ok: false };
  if (def.roles ? !def.roles.includes(a.role ?? '') : !!a.role && actionId !== 'idle') return { def, ok: false };
  if (actionId === 'fart' && a.kind === 'person' && w.stageOf(a) === 'baby') return { def, ok: false };
  if (actionId === 'homework' && a.job?.career !== 'school') return { def, ok: false };
  const gate = skillGate(w, a, def);
  if (gate) return gate;
  const fiesta = holidayReason(w, a, actionId);
  if (fiesta) return fiesta;
  if (actionId === 'busk') {
    if (w.lotById(a.lotId)?.kind !== 'park') return { def, ok: false };
    if (skillLevel(w, a, 'musica') < 3) return { def, ok: false, reason: 'Hace falta música nivel 3' };
  }
  if (actionId === 'take_medicine') {
    if (!a.illness) return { def, ok: false };
    if (a.illness.medicated === w.day) return { def, ok: false, reason: 'Ya se ha tomado algo hoy' };
    if ((w.householdOf(a)?.funds ?? 0) < costOf(w, actionId, a)) return { def, ok: false, reason: 'No hay dinero' };
  }
  return { def, ok: true };
}

/** Lo que se puede hacer con los muebles de un centro de trabajo (además de las tareas). */
const WORK_LOT_ACTIONS = new Set(['toilet', 'wash_up', 'snack', 'eat', 'sit', 'repair', 'cana', 'vermut', 'chupito', 'calamares', 'bravas', 'tortilla', 'dance', 'listen_music', 'karaoke', 'play_cards']);

/** Opciones para el menú de acciones del agente activo sobre un objetivo. */
export function optionsFor(w: World, agentId: string, target: Target): ActionOption[] {
  const a = w.agent(agentId);
  if (!a) return [];
  if (target.kind === 'object') {
    const o = w.object(target.id);
    if (!o) return [];
    // En el trabajo, solo las tareas del día y lo básico (el baño, picar algo, sentarse).
    if (isWorkLot(w, o.lotId)) {
      const basic = w.objDef(o).actions.filter((id) => WORK_LOT_ACTIONS.has(id)).map((id) => checkObjectAction(w, a, o, id));
      return [...taskOptions(w, a, o), ...basic].filter((op) => !op.hidden);
    }
    return w.objDef(o)
      .actions.filter((id) => speciesOk(w, a, ACTIONS[id]) && (id !== 'repair' || o.broken))
      .map((id) => checkObjectAction(w, a, o, id))
      // Las cosas de fiesta (fuera de su día), las de la calle y lavarse en el lavabo de casa, ni se ven.
      .filter((op) => !op.hidden)
      .filter((op) => op.ok || op.reason || (!HOLIDAY_ACTIONS[op.def.id] && !STREET_ACTIONS.has(op.def.id) && op.def.id !== 'wash_up' && op.def.id !== 'call_doctor' && op.def.id !== 'move_out' && op.def.id !== 'enroll'));
  }
  if (target.kind === 'agent') {
    if (target.id === a.id) {
      const self = [...SELF_ACTIONS, ...PLAYER_SELF_ACTIONS];
      return self.map((d) => checkSelfAction(w, a, d.id)).filter((o) => !o.hidden && (o.ok || o.reason));
    }
    const t = w.agent(target.id);
    if (!t) return [];
    return Object.values(ACTIONS)
      .filter((d) => d.target === 'agent')
      .map((d) => checkSocialAction(w, a, t, d.id))
      .filter((o) => !o.hidden && (o.ok || o.reason));
  }
  return [];
}
