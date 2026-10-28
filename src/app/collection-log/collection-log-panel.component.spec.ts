import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CollectionLogPanelComponent } from './collection-log-panel.component';
import { CollectionLogService } from './collection-log.service';
import { SettingsService } from '../options/settings.service';

describe('CollectionLogPanelComponent', () => {
  let fixture: ComponentFixture<CollectionLogPanelComponent>;
  let collectionLog: CollectionLogService;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CollectionLogPanelComponent] });
    fixture = TestBed.createComponent(CollectionLogPanelComponent);
    collectionLog = TestBed.inject(CollectionLogService);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  function tab(label: string): HTMLButtonElement {
    return Array.from(el.querySelectorAll<HTMLButtonElement>('.filter-btn')).find(b =>
      b.textContent!.trim().toUpperCase().startsWith(label.toUpperCase())
    )!;
  }

  it('opens on Equipment, with every entry shown as ??? on a fresh game', () => {
    expect(tab('Equipment').getAttribute('aria-pressed')).toBe('true');
    const names = Array.from(el.querySelectorAll('.entry-name')).map(n => n.textContent!.trim());
    expect(names.length).toBe(5);
    expect(names.every(n => n === '???')).toBeTrue();
    expect(el.querySelector('.overall')!.textContent).toContain('(0%)');
  });

  it('reveals a collected entry by name, with no count on crafted gear', () => {
    collectionLog.recordCraft('forged-sword');
    fixture.detectChanges();
    const names = Array.from(el.querySelectorAll('.entry-name')).map(n => n.textContent!.trim());
    expect(names).toContain('Forged Sword');
    expect(el.querySelector('.entry-count')).toBeNull();
    expect(tab('Equipment').textContent).toContain('1/5');
  });

  it('switching to Monsters shows the Kobold set, with counts on collected entries', () => {
    collectionLog.recordKill('kobold');
    collectionLog.recordKill('kobold');
    tab('Monsters').click();
    fixture.detectChanges();

    expect(tab('Monsters').getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('.set-label')!.textContent).toContain('Kobold');
    const collected = el.querySelector('.entry:not(.uncollected)')!;
    expect(collected.querySelector('.entry-name')!.textContent!.trim()).toBe('Defeated');
    expect(collected.querySelector('.entry-count')!.textContent!.trim()).toBe('x2');
  });

  it('marks a finished set as complete', () => {
    for (const id of ['forged-sword', 'forged-helmet', 'forged-armor', 'forged-boots', 'forged-gauntlets']) {
      collectionLog.recordCraft(id);
    }
    fixture.detectChanges();
    expect(el.querySelector('.set-header')!.classList).toContain('complete');
  });

  it('the grid shows no drop rates (those live in the monster detail view)', () => {
    tab('Monsters').click();
    fixture.detectChanges();
    expect(el.querySelector('.set-grid')!.textContent).not.toContain('1/20');
  });

  it('the monster detail loot table switches to percentages with the Options toggle, live', () => {
    collectionLog.recordKill('kobold');
    tab('Monsters').click();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.info-btn')!.click();
    fixture.detectChanges();
    const rates = () => Array.from(el.querySelectorAll('.loot-rate')).slice(1).map(r => r.textContent!.trim());
    expect(rates()).toEqual(['Always', '1/1.7', '1/20']);

    TestBed.inject(SettingsService).set({ dropRateAsPercent: true });
    fixture.detectChanges();
    expect(rates()).toEqual(['Always', '60%', '5%']);
  });

  describe('detail view', () => {
    it('uncollected entries are not clickable; collected ones are buttons', () => {
      expect(el.querySelector('button.entry')).toBeNull();
      collectionLog.recordCraft('forged-sword');
      fixture.detectChanges();
      expect(el.querySelectorAll('button.entry').length).toBe(1);
    });

    it('clicking an equipment entry shows its stats in place of the grid, keeping the tabs', () => {
      collectionLog.recordCraft('forged-sword');
      fixture.detectChanges();
      el.querySelector<HTMLButtonElement>('button.entry')!.click();
      fixture.detectChanges();

      expect(el.querySelector('.set-grid')).toBeNull();
      expect(el.querySelector('.filter-bar')).not.toBeNull();
      expect(el.querySelector('.detail-title')!.textContent).toContain('Forged Sword');
      const text = el.querySelector('.detail-info')!.textContent!;
      expect(text).toContain('Weapon');
      expect(text).toContain('Common');
    });

    it('Back returns to the grid and puts focus back on the entry that opened it', () => {
      collectionLog.recordCraft('forged-sword');
      fixture.detectChanges();
      el.querySelector<HTMLButtonElement>('button.entry')!.click();
      fixture.detectChanges();
      el.querySelector<HTMLButtonElement>('.back-btn')!.click();
      fixture.detectChanges();

      expect(el.querySelector('.set-grid')).not.toBeNull();
      expect(document.activeElement?.getAttribute('data-focus-key')).toBe('entry:forged-sword');
    });

    it('the monster [?] button stays disabled until its first kill, then opens image, stats, and full loot table', () => {
      tab('Monsters').click();
      fixture.detectChanges();
      const info = (): HTMLButtonElement => el.querySelector<HTMLButtonElement>('.info-btn')!;
      expect(info().disabled).toBeTrue();

      collectionLog.recordKill('kobold');
      collectionLog.recordDrop('kobold', { type: 'resource', resourceId: 'kobold-ears' });
      fixture.detectChanges();
      info().click();
      fixture.detectChanges();

      expect(el.querySelector('.detail-ascii')).not.toBeNull();
      expect(el.querySelector('app-stat-block')).not.toBeNull();
      const loot = Array.from(el.querySelectorAll('.loot-row')).map(r => ({
        name: r.querySelector('.loot-name')!.textContent!.trim(),
        rate: r.querySelector('.loot-rate')!.textContent!.trim(),
      }));
      expect(loot).toEqual([
        { name: 'Gold', rate: 'Always' }, // not a log entry, so never hidden
        { name: 'Kobold Ears', rate: '1/1.7' },
        { name: '???', rate: '1/20' }, // ring not found yet
      ]);
    });

    it('switching tabs closes the detail view', () => {
      collectionLog.recordCraft('forged-sword');
      fixture.detectChanges();
      el.querySelector<HTMLButtonElement>('button.entry')!.click();
      fixture.detectChanges();
      tab('Monsters').click();
      fixture.detectChanges();
      expect(el.querySelector('.detail')).toBeNull();
    });
  });
});
