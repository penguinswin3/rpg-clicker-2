import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LiveAnnouncerComponent } from './live-announcer.component';
import { ActivityLogService } from '../../activity-log/activity-log.service';

describe('LiveAnnouncerComponent', () => {
  let fixture: ComponentFixture<LiveAnnouncerComponent>;
  let logService: ActivityLogService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [LiveAnnouncerComponent] });
    fixture = TestBed.createComponent(LiveAnnouncerComponent);
    logService = TestBed.inject(ActivityLogService);
  });

  function region(): HTMLElement {
    return fixture.nativeElement.querySelector('[aria-live]');
  }

  it('renders a polite, atomic, visually-hidden live region', () => {
    fixture.detectChanges();
    const el = region();
    expect(el.getAttribute('aria-live')).toBe('polite');
    expect(el.getAttribute('aria-atomic')).toBe('true');
    expect(el.classList.contains('sr-only')).toBeTrue();
  });

  it('does not announce a routine (\'default\'-level) message', () => {
    fixture.detectChanges();
    logService.log('You put in a hard day\'s work and earn some gold.', 'default');
    fixture.detectChanges();

    expect(region().textContent?.trim()).toBe('');
  });

  it('announces a non-default message, with currency tokens stripped to plain text', () => {
    fixture.detectChanges();
    logService.log('Objective claimed: {{gold|+50 G}}', 'success');
    fixture.detectChanges();

    expect(region().textContent?.trim()).toBe('Objective claimed: +50 G');
  });

  it('never re-announces messages that already existed before the component mounted', () => {
    // Simulates a save that restored with existing log history before this component
    // ever subscribed — e.g. after a page reload.
    logService.log('An old noteworthy thing happened.', 'warn');

    fixture.detectChanges(); // first subscription tick sees the pre-existing history

    expect(region().textContent?.trim()).toBe('');
  });

  it('announces each new non-default message as it arrives', () => {
    fixture.detectChanges();
    logService.log('First.', 'error');
    fixture.detectChanges();
    expect(region().textContent?.trim()).toBe('First.');

    logService.log('Second.', 'rare');
    fixture.detectChanges();
    expect(region().textContent?.trim()).toBe('Second.');
  });
});
