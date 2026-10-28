import { TestBed } from '@angular/core/testing';
import { StatsPanelComponent } from './stats-panel.component';
import { StatisticsService } from './statistics.service';
import { enemyDefeatActionId } from '../configs/game-config';

describe('StatsPanelComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [StatsPanelComponent] });
  });

  it('lists button actions but hides forge crafts and monster kills (shown in the Collection Log instead)', () => {
    const statistics = TestBed.inject(StatisticsService);
    statistics.recordAction('fighter-hard-labor');
    statistics.recordAction('pattern-common-weapon');
    statistics.recordAction(enemyDefeatActionId('kobold'));

    const fixture = TestBed.createComponent(StatsPanelComponent);
    const ids = fixture.componentInstance.actionCounts.map(a => a.label);

    expect(ids.length).toBe(1);
    expect(ids[0]).toContain('Hard Labor');
    // Still recorded underneath — kill-20-kobolds reads it.
    expect(statistics.getActionCount(enemyDefeatActionId('kobold'))).toBe(1);
  });
});
