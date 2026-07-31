import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EquipmentPanelComponent } from './equipment-panel.component';
import { EquipmentService } from '../equipment.service';

describe('EquipmentPanelComponent', () => {
  let fixture: ComponentFixture<EquipmentPanelComponent>;
  let equipment: EquipmentService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [EquipmentPanelComponent] });
    fixture = TestBed.createComponent(EquipmentPanelComponent);
    equipment = TestBed.inject(EquipmentService);
    fixture.detectChanges();
  });

  it('renders all eight slot instances with their labels', () => {
    const el: HTMLElement = fixture.nativeElement;
    const labels = Array.from(el.querySelectorAll('.equipment-slot-label')).map(n => n.textContent);
    expect(labels).toEqual(['Weapon', 'Helmet', 'Armor', 'Boots', 'Gauntlets', 'Ring', 'Ring', 'Necklace']);
  });

  it('shows "-- empty --" for every unoccupied slot', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.equipment-slot-empty').length).toBe(8);
  });

  it("shows the equipped item's label once a slot is filled", () => {
    equipment.addToInventory('ring-swift-strike');
    equipment.equip('ring-swift-strike', 'ring-1');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Ring of Swift Strikes');
  });

  it('clicking a filled slot unequips it', () => {
    equipment.addToInventory('ring-swift-strike');
    equipment.equip('ring-swift-strike', 'ring-1');
    fixture.detectChanges();

    const slots = fixture.nativeElement.querySelectorAll('.equipment-slot');
    (slots[5] as HTMLElement).click(); // ring-1 is the 6th slot instance (index 5, after weapon/helmet/armor/boots/gauntlets)

    expect(equipment.getEquippedItemId('ring-1')).toBeUndefined();
  });

  it('does nothing when disabled', () => {
    equipment.addToInventory('ring-swift-strike');
    equipment.equip('ring-swift-strike', 'ring-1');
    fixture.componentInstance.disabled = true;
    fixture.detectChanges();

    const slots = fixture.nativeElement.querySelectorAll('.equipment-slot');
    (slots[5] as HTMLElement).click();

    expect(equipment.getEquippedItemId('ring-1')).toBe('ring-swift-strike');
  });
});
