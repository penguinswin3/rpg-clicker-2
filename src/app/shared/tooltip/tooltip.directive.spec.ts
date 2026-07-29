import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { TooltipDirective } from './tooltip.directive';
import { TooltipContent } from './tooltip-content';

@Component({
  standalone: true,
  imports: [TooltipDirective],
  template: `<button [appTooltip]="content">Hover me</button>`,
})
class HostComponent {
  content: TooltipContent = { title: 'Test Button', rows: [{ label: 'Cost', value: '10 X', color: '#f00' }] };
}

describe('TooltipDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let button: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    // TooltipDirective creates its TooltipComponent via ViewContainerRef, and
    // TooltipComponent.position() reads real layout via getBoundingClientRect() —
    // neither works meaningfully (and `document.querySelector` below wouldn't find
    // anything at all) unless the fixture is actually attached to the live document,
    // which TestBed does not do by default.
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    button = fixture.nativeElement.querySelector('button');
  });

  afterEach(() => {
    fixture.nativeElement.remove();
  });

  function tooltipBox(): HTMLElement | null {
    return document.querySelector('app-tooltip .tooltip-box');
  }

  it('does not show a tooltip immediately on pointerenter — only after a delay', fakeAsync(() => {
    button.dispatchEvent(new Event('pointerenter'));
    fixture.detectChanges();
    expect(tooltipBox()).toBeNull();

    tick(349);
    fixture.detectChanges();
    expect(tooltipBox()).toBeNull();

    tick(1);
    fixture.detectChanges();
    expect(tooltipBox()).not.toBeNull();
  }));

  it('renders the title and every row, with the row color applied inline', fakeAsync(() => {
    button.dispatchEvent(new Event('pointerenter'));
    tick(350);
    fixture.detectChanges();

    const box = tooltipBox()!;
    expect(box.querySelector('.tooltip-title')!.textContent).toContain('Test Button');
    const valueEl = box.querySelector('.tooltip-value') as HTMLElement;
    expect(valueEl.textContent).toContain('10 X');
    expect(valueEl.style.color).toBe('rgb(255, 0, 0)');
  }));

  it('hides on pointerleave, cancelling a pending show if it fires before the delay elapses', fakeAsync(() => {
    button.dispatchEvent(new Event('pointerenter'));
    tick(100);
    button.dispatchEvent(new Event('pointerleave'));
    tick(300);
    fixture.detectChanges();

    expect(tooltipBox()).toBeNull();
  }));

  it('hides an already-visible tooltip on pointerleave', fakeAsync(() => {
    button.dispatchEvent(new Event('pointerenter'));
    tick(350);
    fixture.detectChanges();
    expect(tooltipBox()).not.toBeNull();

    button.dispatchEvent(new Event('pointerleave'));
    fixture.detectChanges();
    expect(tooltipBox()).toBeNull();
  }));

  it('hides immediately on pointerdown — a real interaction should never leave a stale tooltip up', fakeAsync(() => {
    button.dispatchEvent(new Event('pointerenter'));
    tick(350);
    fixture.detectChanges();
    expect(tooltipBox()).not.toBeNull();

    button.dispatchEvent(new Event('pointerdown'));
    fixture.detectChanges();
    expect(tooltipBox()).toBeNull();
  }));

  it('never shows anything for content with no rows', fakeAsync(() => {
    fixture.componentInstance.content = { title: 'Empty', rows: [] };
    fixture.detectChanges();

    button.dispatchEvent(new Event('pointerenter'));
    tick(350);
    fixture.detectChanges();

    expect(tooltipBox()).toBeNull();
  }));

  it('updates an already-visible tooltip live when the bound content changes', fakeAsync(() => {
    button.dispatchEvent(new Event('pointerenter'));
    tick(350);
    fixture.detectChanges();

    fixture.componentInstance.content = { title: 'Updated', rows: [{ label: 'Yield', value: '99 Y' }] };
    fixture.detectChanges();

    const box = tooltipBox()!;
    expect(box.querySelector('.tooltip-title')!.textContent).toContain('Updated');
    expect(box.querySelector('.tooltip-value')!.textContent).toContain('99 Y');
  }));

  it('is removed from the DOM when the host directive is destroyed', fakeAsync(() => {
    button.dispatchEvent(new Event('pointerenter'));
    tick(350);
    fixture.detectChanges();
    expect(tooltipBox()).not.toBeNull();

    fixture.destroy();
    expect(tooltipBox()).toBeNull();
  }));

  it('the tooltip box itself never intercepts pointer events (pointer-events: none)', fakeAsync(() => {
    button.dispatchEvent(new Event('pointerenter'));
    tick(350);
    fixture.detectChanges();

    const hostEl = document.querySelector('app-tooltip') as HTMLElement;
    expect(getComputedStyle(hostEl).pointerEvents).toBe('none');
  }));
});
