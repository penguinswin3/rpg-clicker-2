import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatBlockComponent } from './stat-block.component';

describe('StatBlockComponent', () => {
  let fixture: ComponentFixture<StatBlockComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [StatBlockComponent] });
    fixture = TestBed.createComponent(StatBlockComponent);
  });

  it('renders all six stats with their values', () => {
    fixture.componentInstance.stats = {
      strength: 8, dexterity: 10, constitution: 6, intelligence: 6, wisdom: 10, charisma: 6,
    };
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('STR');
    expect(text).toContain('8');
    expect(text).toContain('DEX');
    expect(text).toContain('10');
  });
});
