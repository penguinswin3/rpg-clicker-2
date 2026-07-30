import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InventoryPanelComponent } from './inventory-panel.component';
import { EquipmentService } from '../equipment.service';

describe('InventoryPanelComponent', () => {
  let fixture: ComponentFixture<InventoryPanelComponent>;
  let equipment: EquipmentService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [InventoryPanelComponent] });
    fixture = TestBed.createComponent(InventoryPanelComponent);
    equipment = TestBed.inject(EquipmentService);
    fixture.detectChanges();
  });

  it('shows the empty state when the bag is empty', () => {
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Bag is empty');
  });

  it('renders an item stack with its count once one is held', () => {
    equipment.addToInventory('ring-swift-strike', 2);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Ring of Swift Strikes');
    expect(el.textContent).toContain('x2');
  });

  it('clicking an item equips it into a free compatible slot', () => {
    equipment.addToInventory('ring-swift-strike');
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.inventory-item') as HTMLElement).click();

    expect(equipment.getEquippedItemId('ring-1')).toBe('ring-swift-strike');
  });

  it('does nothing when disabled', () => {
    equipment.addToInventory('ring-swift-strike');
    fixture.componentInstance.disabled = true;
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.inventory-item') as HTMLElement).click();

    expect(equipment.getEquippedItemId('ring-1')).toBeUndefined();
  });
});
