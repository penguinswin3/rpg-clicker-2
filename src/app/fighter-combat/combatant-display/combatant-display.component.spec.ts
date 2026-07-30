import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CombatantDisplayComponent } from './combatant-display.component';

describe('CombatantDisplayComponent', () => {
  let fixture: ComponentFixture<CombatantDisplayComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CombatantDisplayComponent] });
    fixture = TestBed.createComponent(CombatantDisplayComponent);
  });

  it('computes hpPercent as a clamped 0-100 percentage', () => {
    fixture.componentInstance.hp = 30;
    fixture.componentInstance.maxHp = 60;
    expect(fixture.componentInstance.hpPercent).toBe(50);
  });

  it('clamps hpPercent to 0 when maxHp is 0 (avoids dividing by zero)', () => {
    fixture.componentInstance.hp = 0;
    fixture.componentInstance.maxHp = 0;
    expect(fixture.componentInstance.hpPercent).toBe(0);
  });

  it('renders the name and current/max HP in the template', () => {
    fixture.componentInstance.name = 'Kobold';
    fixture.componentInstance.hp = 30;
    fixture.componentInstance.maxHp = 60;
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.combatant-name')?.textContent).toContain('Kobold');
    expect(el.querySelector('.combatant-hp-label')?.textContent).toContain('30');
    expect(el.querySelector('.combatant-hp-label')?.textContent).toContain('60');
  });
});
