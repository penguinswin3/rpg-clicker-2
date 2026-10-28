import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CombatControlsComponent } from './combat-controls.component';
import { CombatService } from '../combat.service';
import { UpgradesService } from '../../upgrades/upgrades.service';
import { UnlocksService } from '../../shared/unlocks.service';
import { WalletService } from '../../economy/wallet.service';

describe('CombatControlsComponent', () => {
  let fixture: ComponentFixture<CombatControlsComponent>;
  let combat: CombatService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CombatControlsComponent] });
    fixture = TestBed.createComponent(CombatControlsComponent);
    combat = TestBed.inject(CombatService);
    fixture.detectChanges();
  });

  it('renders a button for each configured area, defaulting to the first selected', () => {
    const buttons: HTMLElement[] = fixture.nativeElement.querySelectorAll('.area-button');
    expect(buttons.length).toBe(1); // only 'kobold-den' exists today
    expect(buttons[0].textContent).toContain('Kobold Den');
    expect((buttons[0] as HTMLElement).classList.contains('active')).toBeTrue();
  });

  it('reflects the selected area via aria-pressed, not just the active CSS class', () => {
    const button = fixture.nativeElement.querySelector('.area-button') as HTMLElement;
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking Fight! starts an encounter in the selected area', () => {
    (fixture.nativeElement.querySelector('.fight-button') as HTMLElement).click();
    expect(combat.activeEncounter?.enemyId).toBe('kobold');
  });

  it('shows Flee instead of Fight! once an encounter is active', () => {
    combat.start('kobold-den');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.fight-button')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.flee-button')).toBeTruthy();
  });

  it('clicking Flee ends the encounter', () => {
    combat.start('kobold-den');
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.flee-button') as HTMLElement).click();

    expect(combat.activeEncounter).toBeNull();
  });

  it('disables Fight! and shows a countdown while locked out', () => {
    combat.restore({ fighterHp: 1, lockedOutUntil: Date.now() + 15_000, activeEncounter: null });
    fixture.detectChanges();

    const fightButton = fixture.nativeElement.querySelector('.fight-button') as HTMLButtonElement;
    expect(fightButton.disabled).toBeTrue();
    expect(fightButton.textContent).toContain('Recovering');
  });

  describe('Auto Fight checkbox', () => {
    const box = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="auto-fight"]');

    function buyAutoFight(): void {
      TestBed.inject(UnlocksService).unlock('minigames');
      TestBed.inject(WalletService).add('kobold-ears', 10);
      TestBed.inject(UpgradesService).purchase('auto-fight');
      fixture.detectChanges();
    }

    it('is absent until the upgrade is bought, then appears live', () => {
      expect(box()).toBeNull();
      buyAutoFight();
      expect(box()).not.toBeNull();
    });

    it('is a real checkbox that toggles CombatService.autoFight', () => {
      buyAutoFight();
      expect(box()!.getAttribute('role')).toBe('checkbox');
      expect(box()!.getAttribute('aria-checked')).toBe('false');
      box()!.click();
      fixture.detectChanges();
      expect(combat.autoFight).toBeTrue();
      expect(box()!.getAttribute('aria-checked')).toBe('true');
    });

    it('stays beside Flee during a fight so the chain can be switched off', () => {
      buyAutoFight();
      combat.start('kobold-den');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.flee-button')).not.toBeNull();
      expect(box()).not.toBeNull();
    });
  });
});
