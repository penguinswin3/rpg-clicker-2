import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { InventoryPanelComponent } from './inventory-panel.component';
import { EquipmentService } from '../equipment.service';

describe('InventoryPanelComponent', () => {
  let fixture: ComponentFixture<InventoryPanelComponent>;
  let equipment: EquipmentService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [InventoryPanelComponent] });
    fixture = TestBed.createComponent(InventoryPanelComponent);
    equipment = TestBed.inject(EquipmentService);
    // TooltipDirective positions its TooltipComponent via real layout — it only works
    // meaningfully once the fixture is attached to the live document (see
    // tooltip.directive.spec.ts).
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
  });

  function tooltipBox(): HTMLElement | null {
    return document.querySelector('app-tooltip .tooltip-box');
  }

  it('shows the empty state when the bag is empty', () => {
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Bag is empty');
  });

  it('renders one icon slot per held item stack, showing its symbol', () => {
    equipment.addToInventory('ring-swift-strike', 2);
    fixture.detectChanges();

    const slot: HTMLElement = fixture.nativeElement.querySelector('.inventory-slot');
    expect(slot).toBeTruthy();
    expect(slot.textContent?.trim()).toBe('○');
  });

  it('shows name, rarity, slot, count, and effect in a hover tooltip', fakeAsync(() => {
    equipment.addToInventory('ring-swift-strike', 2);
    fixture.detectChanges();

    const slot: HTMLElement = fixture.nativeElement.querySelector('.inventory-slot');
    slot.dispatchEvent(new Event('pointerenter'));
    tick(350);
    fixture.detectChanges();

    const box = tooltipBox();
    expect(box).toBeTruthy();
    expect(box!.textContent).toContain('Ring of Swift Strikes');
    expect(box!.textContent).toContain('Uncommon');
    expect(box!.textContent).toContain('Ring');
    expect(box!.textContent).toContain('x2');
    expect(box!.textContent).toContain('5% chance to attack again immediately after landing a hit.');
  }));

  it('clicking an item equips it into a free compatible slot', () => {
    equipment.addToInventory('ring-swift-strike');
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.inventory-slot') as HTMLElement).click();

    expect(equipment.getEquippedItemId('ring-1')).toBe('ring-swift-strike');
  });

  it('does nothing when disabled', () => {
    equipment.addToInventory('ring-swift-strike');
    fixture.componentInstance.disabled = true;
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.inventory-slot') as HTMLElement).click();

    expect(equipment.getEquippedItemId('ring-1')).toBeUndefined();
  });
});
