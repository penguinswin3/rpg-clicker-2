import { TestBed } from '@angular/core/testing';
import { CollectionLogService, entryDisplayName } from './collection-log.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { COLLECTION_LOG_SETS } from '../configs/game-config';

describe('CollectionLogService', () => {
  let service: CollectionLogService;
  let activityLog: ActivityLogService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CollectionLogService);
    activityLog = TestBed.inject(ActivityLogService);
  });

  it('starts with nothing collected', () => {
    const { collected, total } = service.overallProgress;
    expect(collected).toBe(0);
    expect(total).toBe(COLLECTION_LOG_SETS.flatMap(s => s.entries).length);
  });

  it('recordCraft collects the matching craft entry', () => {
    service.recordCraft('forged-helmet');
    expect(service.isCollected('forged-helmet')).toBeTrue();
    expect(service.isCollected('forged-sword')).toBeFalse();
  });

  it('recordKill counts every kill', () => {
    service.recordKill('kobold');
    service.recordKill('kobold');
    expect(service.getCount('kobold-kill')).toBe(2);
  });

  it('recordDrop matches on enemy and exact item', () => {
    service.recordDrop('kobold', { type: 'equipment', equipmentId: 'ring-swift-strike' });
    service.recordDrop('kobold', { type: 'resource', resourceId: 'kobold-ears' });
    expect(service.getCount('kobold-ring-swift-strike')).toBe(1);
    expect(service.getCount('kobold-ears')).toBe(1);
  });

  it('an event with no matching entry is a silent no-op', () => {
    const changes = jasmine.createSpy('changes');
    service.changes$.subscribe(changes);
    service.recordDrop('kobold', { type: 'resource', resourceId: 'gold' });
    service.recordCraft('basic-sword');
    service.recordKill('not-a-real-enemy');
    expect(changes).not.toHaveBeenCalled();
    expect(service.overallProgress.collected).toBe(0);
  });

  it('logs a new entry once, at rare level, and not on repeats', () => {
    const log = spyOn(activityLog, 'log');
    service.recordDrop('kobold', { type: 'equipment', equipmentId: 'ring-swift-strike' });
    service.recordDrop('kobold', { type: 'equipment', equipmentId: 'ring-swift-strike' });
    expect(log).toHaveBeenCalledOnceWith('New collection log entry: Ring of Swift Strikes.', 'rare');
  });

  it('reports set, category, and overall progress', () => {
    const forged = COLLECTION_LOG_SETS.find(s => s.id === 'forged')!;
    service.recordCraft('forged-sword');
    service.recordCraft('forged-boots');
    service.recordKill('kobold');

    expect(service.setProgress(forged)).toEqual({ collected: 2, total: forged.entries.length });
    expect(service.categoryProgress('equipment').collected).toBe(2);
    expect(service.categoryProgress('monsters').collected).toBe(1);
    expect(service.overallProgress.collected).toBe(3);
  });

  it('round-trips through a snapshot', () => {
    service.recordKill('kobold');
    service.recordCraft('forged-armor');
    const snapshot = service.getSnapshot();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const restored = TestBed.inject(CollectionLogService);
    restored.restore(snapshot);

    expect(restored.getSnapshot()).toEqual(snapshot);
    expect(restored.getCount('kobold-kill')).toBe(1);
  });

  it('restores empty from a save that predates the Collection Log', () => {
    service.recordKill('kobold');
    service.restore(undefined);
    expect(service.overallProgress.collected).toBe(0);
  });

  it('entryDisplayName: item labels, enemy labels, and title-cased resource names', () => {
    const entries = COLLECTION_LOG_SETS.flatMap(s => s.entries);
    expect(entryDisplayName(entries.find(e => e.id === 'forged-sword')!)).toBe('Forged Sword');
    expect(entryDisplayName(entries.find(e => e.id === 'kobold-kill')!)).toBe('Kobold');
    expect(entryDisplayName(entries.find(e => e.id === 'kobold-ears')!)).toBe('Kobold Ears');
  });
});
