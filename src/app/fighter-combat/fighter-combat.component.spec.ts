import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FighterCombatComponent } from './fighter-combat.component';
import { CombatService } from './combat.service';
import { InventoryPanelComponent } from './inventory-panel/inventory-panel.component';

describe('FighterCombatComponent', () => {
  let fixture: ComponentFixture<FighterCombatComponent>;
  let combat: CombatService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [FighterCombatComponent] });
    fixture = TestBed.createComponent(FighterCombatComponent);
    combat = TestBed.inject(CombatService);
    fixture.detectChanges();
  });

  it('shows "no enemy engaged" placeholders when no fight is active', () => {
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No enemy engaged');
  });

  it('shows the enemy display once a fight starts', () => {
    combat.start('kobold-den');
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('app-combatant-display').length).toBe(2); // fighter + enemy
    expect(el.textContent).not.toContain('No enemy engaged');
  });

  it('disables the inventory panel while a fight is in progress', () => {
    combat.start('kobold-den');
    fixture.detectChanges();

    const inventoryPanel = fixture.debugElement.query(By.directive(InventoryPanelComponent))
      .componentInstance as InventoryPanelComponent;
    expect(inventoryPanel.disabled).toBeTrue();
  });

  it('leaves the inventory panel enabled while no fight is active', () => {
    const inventoryPanel = fixture.debugElement.query(By.directive(InventoryPanelComponent))
      .componentInstance as InventoryPanelComponent;
    expect(inventoryPanel.disabled).toBeFalse();
  });
});
