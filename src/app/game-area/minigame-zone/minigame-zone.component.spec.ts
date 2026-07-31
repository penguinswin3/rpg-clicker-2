import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MinigameZoneComponent } from './minigame-zone.component';
import { UnlocksService } from '../../shared/unlocks.service';
import { CharacterSelectService } from '../../character-select/character-select.service';

describe('MinigameZoneComponent', () => {
  let fixture: ComponentFixture<MinigameZoneComponent>;
  let unlocks: UnlocksService;
  let characters: CharacterSelectService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MinigameZoneComponent] });
    fixture = TestBed.createComponent(MinigameZoneComponent);
    unlocks = TestBed.inject(UnlocksService);
    characters = TestBed.inject(CharacterSelectService);
  });

  it('shows the empty state when minigames are locked', () => {
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Under construction');
  });

  it('shows Fighter Combat once minigames are unlocked and Fighter is active', () => {
    unlocks.unlock('minigames');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-fighter-combat')).toBeTruthy();
  });

  it('shows Blacksmith Forge once minigames are unlocked and Blacksmith is active', () => {
    characters.unlock('blacksmith');
    characters.select('blacksmith');
    unlocks.unlock('minigames');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-blacksmith-forge')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-fighter-combat')).toBeFalsy();
  });

  it('keeps showing the empty state for a different active character even once unlocked', () => {
    characters.unlock('ranger');
    characters.select('ranger');
    unlocks.unlock('minigames');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-fighter-combat')).toBeFalsy();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Under construction');
  });
});
