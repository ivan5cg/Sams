// Álbum de fotos (☰ → 🖼️): las fotos por familia y generación, verlas en grande, compartirlas,
// borrarlas y exportar el álbum entero. Las fotos se hacen con ☰ → 📸 o desde aquí, y solas en
// los grandes momentos (nacimientos y bodas).

import { longDate } from '../sim/date';
import { ALBUM_MAX, addPhoto, albumHtml, deletePhoto, groupPhotos, listPhotos, type Photo } from '../save/album';
import { $, esc } from './dom';
import { Part } from './part';

type Camera = (caption: string) => Promise<{ blob: Blob; w: number; h: number }>;

export class AlbumPanel extends Part {
  private camera: Camera | null = null;
  private urls: string[] = [];
  private photos: Photo[] = [];
  private viewing: Photo | null = null;
  /** Para no hacer dos fotos a la vez (y no llenar el álbum con la misma escena). */
  private busy = false;

  setCamera(c: Camera) {
    this.camera = c;
  }

  bind() {
    $('#album').addEventListener('click', async (e) => {
      const el = e.target as HTMLElement;
      if (el.id === 'album' || el.closest('[data-close]')) return this.close();
      const b = el.closest<HTMLButtonElement>('button');
      if (!b) return;
      if (b.dataset.photo) {
        this.viewing = this.photos.find((p) => p.id === b.dataset.photo) ?? null;
        return this.render();
      }
      switch (b.dataset.al) {
        case 'back': this.viewing = null; return this.render();
        case 'snap': {
          // Se cierra el álbum para que la foto sea de la escena.
          this.close();
          await this.snap();
          return this.open();
        }
        case 'delete':
          if (this.viewing && confirm('¿Borrar esta foto del álbum?')) {
            await deletePhoto(this.viewing.id);
            this.viewing = null;
            await this.reload();
          }
          return;
        case 'share': return this.viewing && this.share(this.viewing);
        case 'export': return this.exportAll();
      }
    });
  }

  /** Pie de foto por defecto: quién sale y cuándo. */
  private defaultCaption(): string {
    const w = this.world;
    const lot = w.lotById(w.viewLotId);
    const where = lot?.kind === 'home' ? (lot.householdId === w.household.id ? 'En casa' : `En casa de la ${w.state.households.find((h) => h.id === lot.householdId)?.name ?? 'vecina'}`) : lot?.name ?? '';
    return `${w.household.name} · ${where} · ${longDate(w.date)} de ${w.date.y}`;
  }

  /** Generación de la familia ahora (la más alta de quien vive en casa). */
  private generation(): number {
    return Math.max(1, ...this.world.members.filter((m) => m.kind === 'person').map((m) => m.gen ?? 1));
  }

  /** Hace una foto de lo que se ve y la guarda en el álbum. `auto`: un gran momento (sin avisar si no cabe). */
  async snap(caption?: string, auto = false): Promise<boolean> {
    if (!this.camera || this.busy) return false;
    this.busy = true;
    try {
      const text = caption ?? this.defaultCaption();
      const shot = await this.camera(text);
      const w = this.world;
      const why = await addPhoto({ id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), family: w.household.name, gen: this.generation(), day: w.day, caption: text, ...shot });
      if (why) {
        if (!auto) this.hud.toast(why, '📸');
        return false;
      }
      this.flash();
      this.hud.toast(auto ? `Foto para el álbum: ${text}` : '¡Foto guardada en el álbum!', '📸');
      return true;
    } catch {
      if (!auto) this.hud.toast('No se ha podido hacer la foto', '⚠️');
      return false;
    } finally {
      this.busy = false;
    }
  }

  /** El destello de la cámara. */
  private flash() {
    const f = document.createElement('div');
    f.className = 'photo-flash';
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 450);
  }

  async open() {
    $('#album').hidden = false;
    this.viewing = null;
    await this.reload();
  }

  close() {
    $('#album').hidden = true;
    this.viewing = null;
    this.freeUrls();
  }

  private freeUrls() {
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls = [];
  }

  private url(p: Photo): string {
    const u = URL.createObjectURL(p.blob);
    this.urls.push(u);
    return u;
  }

  private async reload() {
    this.photos = await listPhotos();
    this.render();
  }

  private render() {
    if ($('#album').hidden) return;
    this.freeUrls();
    const v = this.viewing;
    if (v) {
      $('#album').innerHTML = `<div class="map-card album-view">
        <div class="sheet-head"><button class="icon-btn" data-al="back" aria-label="Volver al álbum">←</button><div class="sheet-title">${esc(v.family)}</div><button class="icon-btn" data-close aria-label="Cerrar">✕</button></div>
        <img class="album-big" src="${this.url(v)}" alt="${esc(v.caption)}" />
        <div class="muted small">${esc(v.caption)} · ${new Date(v.at).toLocaleDateString('es-ES')}</div>
        <div class="album-actions">
          <button class="map-btn" data-al="share">📤 Compartir</button>
          <button class="map-btn ghost" data-al="delete">🗑️ Borrar</button>
        </div>
      </div>`;
      return;
    }
    const groups = groupPhotos(this.photos)
      .reverse()
      .map(
        (g) => `<div class="prof-sec"><div class="prof-h">${esc(g.title)}</div><div class="album-grid">${[...g.photos]
          .reverse()
          .map((p) => `<button class="album-thumb" data-photo="${p.id}" aria-label="${esc(p.caption)}"><img src="${this.url(p)}" alt="" loading="lazy" /><span>Día ${p.day}</span></button>`)
          .join('')}</div></div>`,
      )
      .join('');
    $('#album').innerHTML = `<div class="map-card">
      <div class="sheet-head"><div><div class="sheet-title">🖼️ Álbum de fotos</div><div class="sheet-sub">${this.photos.length} de ${ALBUM_MAX} fotos</div></div><button class="icon-btn" data-close aria-label="Cerrar">✕</button></div>
      <div class="album-actions">
        <button class="map-btn" data-al="snap">📸 Hacer una foto</button>
        ${this.photos.length ? '<button class="map-btn ghost" data-al="export">📥 Exportar el álbum</button>' : ''}
      </div>
      ${groups || '<p class="muted small">Aún no hay fotos. Haz una con 📸, y en los grandes momentos (un nacimiento, una boda) se harán solas.</p>'}
    </div>`;
  }

  private download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** En el móvil, con el menú de compartir; si no, se descarga. */
  private async share(p: Photo) {
    const file = new File([p.blob], `sams-dia-${p.day}.jpg`, { type: 'image/jpeg' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], text: p.caption });
        return;
      } catch {
        /* cancelado: se descarga */
      }
    }
    this.download(p.blob, file.name);
  }

  private async exportAll() {
    const html = await albumHtml(this.photos);
    this.download(new Blob([html], { type: 'text/html' }), 'album-sams.html');
    this.hud.toast('Álbum exportado: se abre en cualquier navegador', '📥');
  }
}
