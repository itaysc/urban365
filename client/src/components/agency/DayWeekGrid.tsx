import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  DAY_MINUTES,
  SNAP_MINUTES,
  allDayCovers,
  draggedStart,
  eventDate,
  isSameDay,
  minutesOnDay,
  moveBy,
  placeEvents,
  shiftDays,
  snapMinutes,
} from '@/lib/dayGrid';
import type { GoogleEvent, Meeting } from '@/services/calendar';

/** An hour, in pixels. Twenty-four of them is the whole day, which is the point. */
const HOUR_PX = 48;

const clock = (minutes: number) => {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/** How far to scroll this frame while the pointer rests in the edge of the day. */
const scrollStep = (scroller: HTMLElement | null, clientY: number) => {
  if (!scroller) return 0;
  const bounds = scroller.getBoundingClientRect();
  const zone = 48;
  if (clientY > bounds.bottom - zone) {
    const depth = Math.min((clientY - (bounds.bottom - zone)) / zone, 1);
    return Math.round(6 + depth * 12);
  }
  if (clientY < bounds.top + zone) {
    const depth = Math.min((bounds.top + zone - clientY) / zone, 1);
    return -Math.round(6 + depth * 12);
  }
  return 0;
};

interface Drag {
  id: string;
  dayIndex: number;
  start: number;
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Props {
  days: Date[];
  meetings: Meeting[];
  googleEvents: GoogleEvent[];
  today: Date;
  selected: Date;
  onSelectDay: (day: Date) => void;
  /** A click on an empty quarter-hour. */
  onCreate: (at: Date) => void;
  onOpen: (meeting: Meeting) => void;
  /** Dropped on a new time. The length is unchanged. */
  onMove: (meeting: Meeting, startsAt: Date, endsAt: Date) => void;
}

/**
 * One day or a week, as a day of hours rather than a list of chips.
 *
 * The month can be a grid of dates. A day cannot: a meeting at seven and a meeting at
 * seven in the evening are the same chip in a list, and the empty hours between them
 * are the part of the day somebody is trying to see. Dragging moves a meeting; the
 * grey blocks are Google's and stay where Google put them.
 */
export function DayWeekGrid({
  days,
  meetings,
  googleEvents,
  today,
  selected,
  onSelectDay,
  onCreate,
  onOpen,
  onMove,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<(HTMLDivElement | null)[]>([]);
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [allDayDrag, setAllDayDrag] = useState<{ id: string; origin: number; dayIndex: number } | null>(
    null,
  );
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Open on the working morning, or on the current hour when today is on screen.
  // The rest of the day is there; it is just above or below.
  const span = days.map((day) => day.toDateString()).join();
  const includesToday = days.some((day) => isSameDay(day, today));
  useLayoutEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const hour = includesToday ? new Date().getHours() : 7;
    node.scrollTop = Math.max(0, hour - 1) * HOUR_PX;
  }, [span, includesToday]);

  const dayIndexAt = (x: number, fallback: number) => {
    for (let i = 0; i < columnsRef.current.length; i++) {
      const rect = columnsRef.current[i]?.getBoundingClientRect();
      if (rect && x >= rect.left && x <= rect.right) return i;
    }
    return fallback;
  };

  const boxFor = (dayIndex: number, start: number, duration: number) => {
    const rect = columnsRef.current[dayIndex]?.getBoundingClientRect();
    if (!rect) return null;
    const minutes = Math.max(0, Math.min(DAY_MINUTES - SNAP_MINUTES, start));
    const visible = Math.min(duration, DAY_MINUTES - minutes);
    return {
      top: rect.top + (minutes / 60) * HOUR_PX,
      left: rect.left + 2,
      width: Math.max(rect.width - 4, 0),
      height: Math.max((visible / 60) * HOUR_PX, 22),
    };
  };

  const beginDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    meeting: Meeting,
    dayIndex: number,
    start: number,
  ) => {
    event.stopPropagation();
    event.preventDefault();
    const node = event.currentTarget;
    node.setPointerCapture(event.pointerId);
    const originX = event.clientX;
    const originY = event.clientY;
    const duration = Math.max(
      (new Date(meeting.endsAt).getTime() - new Date(meeting.startsAt).getTime()) / 60_000,
      SNAP_MINUTES,
    );
    const originSlot = snapMinutes(start);
    const originRect = columnsRef.current[dayIndex]?.getBoundingClientRect();
    const grabMinutes = originRect ? ((originY - originRect.top) / HOUR_PX) * 60 - originSlot : 0;
    let lastX = originX;
    let lastY = originY;
    let pointerMoved = false;
    let slotChanged = false;
    let settled = false;
    let frame = 0;

    const follow = (clientX: number, clientY: number) => {
      const index = dayIndexAt(clientX, dayIndex);
      const rect = columnsRef.current[index]?.getBoundingClientRect();
      if (!rect) return;
      const pointerMinutes = ((clientY - rect.top) / HOUR_PX) * 60;
      const next = draggedStart(pointerMinutes, grabMinutes, duration);
      if (index !== dayIndex || next !== originSlot) slotChanged = true;
      const box = boxFor(index, next, duration);
      if (!box) return;
      const nextDrag = { id: meeting.id, dayIndex: index, start: next, ...box };
      dragRef.current = nextDrag;
      setDrag(nextDrag);
    };

    // The pointer can sit still at the edge while the day scrolls under it.
    // Measuring the pointer against the column on each frame lets the meeting
    // ride that scroll instead of freezing on the last hour that was in view.
    const tick = () => {
      if (settled) return;
      frame = window.requestAnimationFrame(tick);
      if (!pointerMoved) return;
      const step = scrollStep(scrollerRef.current, lastY);
      const scroller = scrollerRef.current;
      if (!step || !scroller) return;
      const before = scroller.scrollTop;
      scroller.scrollTop += step;
      if (scroller.scrollTop !== before) follow(lastX, lastY);
    };

    const move = (ev: PointerEvent) => {
      lastX = ev.clientX;
      lastY = ev.clientY;
      if (Math.hypot(ev.clientX - originX, ev.clientY - originY) < 6) return;
      pointerMoved = true;
      document.body.style.cursor = 'grabbing';
      follow(ev.clientX, ev.clientY);
    };

    const up = () => {
      if (settled) return;
      settled = true;
      window.cancelAnimationFrame(frame);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
      document.body.style.cursor = '';
      const current = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!pointerMoved) {
        onOpen(meeting);
        return;
      }
      if (!slotChanged || !current) return;
      const landing = days[current.dayIndex];
      if (!landing) return;
      const next = moveBy(new Date(meeting.startsAt), new Date(meeting.endsAt), landing, current.start);
      onMove(meeting, next.startsAt, next.endsAt);
    };

    frame = window.requestAnimationFrame(tick);
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
  };

  const beginAllDayDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    meeting: Meeting,
    dayIndex: number,
  ) => {
    event.stopPropagation();
    event.preventDefault();
    const node = event.currentTarget;
    node.setPointerCapture(event.pointerId);
    const originX = event.clientX;
    const originY = event.clientY;
    let pointerMoved = false;
    let target = dayIndex;
    let settled = false;

    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - originX, ev.clientY - originY) < 6) return;
      pointerMoved = true;
      target = dayIndexAt(ev.clientX, dayIndex);
      setAllDayDrag({ id: meeting.id, origin: dayIndex, dayIndex: target });
    };

    const up = () => {
      if (settled) return;
      settled = true;
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
      setAllDayDrag(null);
      if (!pointerMoved) {
        onOpen(meeting);
        return;
      }
      if (target === dayIndex) return;
      const next = shiftDays(eventDate(meeting.startsAt), eventDate(meeting.endsAt), target - dayIndex);
      onMove(meeting, next.startsAt, next.endsAt);
    };

    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
  };

  const rangeOf = (meeting: Meeting) => {
    const start = eventDate(meeting.startsAt);
    const end = eventDate(meeting.endsAt);
    if (allDayDrag?.id !== meeting.id) return { startsAt: start, endsAt: end };
    return shiftDays(start, end, allDayDrag.dayIndex - allDayDrag.origin);
  };

  const beginCreate = (event: ReactPointerEvent<HTMLDivElement>, day: Date) => {
    if ((event.target as HTMLElement).closest('[data-event]')) return;
    const originX = event.clientX;
    const originY = event.clientY;
    const top = event.currentTarget.getBoundingClientRect().top;

    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointerup', up);
      if (Math.hypot(ev.clientX - originX, ev.clientY - originY) > 6) return;
      const minutes = snapMinutes(((ev.clientY - top) / HOUR_PX) * 60);
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
      at.setMinutes(Math.max(0, Math.min(DAY_MINUTES - SNAP_MINUTES, minutes)));
      onCreate(at);
    };

    window.addEventListener('pointerup', up);
  };

  const dragged = drag ? meetings.find((meeting) => meeting.id === drag.id) : undefined;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return (
    <div
      ref={scrollerRef}
      className={`max-h-[calc(100vh-14rem)] overflow-auto ${days.length > 1 ? 'max-sm:min-w-0' : ''}`}
    >
      <div className={days.length > 1 ? 'min-w-[44rem]' : ''}>
        <div className="sticky top-0 z-20 bg-white">
        <div className="flex border-b border-slate-200">
          <div className="sticky start-0 w-14 shrink-0 bg-white" />
          {days.map((day) => {
            const isToday = isSameDay(day, today);
            const isSelected = isSameDay(day, selected);
            return (
              <button
                key={day.toDateString()}
                type="button"
                onClick={() => onSelectDay(day)}
                className="flex flex-1 flex-col items-center gap-0.5 py-2"
              >
                <span className="text-xs text-slate-500">
                  {day.toLocaleDateString('he-IL', { weekday: 'narrow' })}
                </span>
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                    isToday
                      ? 'bg-blue-600 font-semibold text-white'
                      : isSelected
                        ? 'font-semibold text-blue-700'
                        : 'text-slate-800'
                  }`}
                >
                  {day.getDate()}
                </span>
              </button>
            );
          })}
        </div>

        {(meetings.some((meeting) => meeting.allDay) || googleEvents.some((event) => event.allDay)) && (
          <div className="flex border-b border-slate-200 bg-white">
            <div className="sticky start-0 flex w-14 shrink-0 items-center justify-center bg-white px-1 text-center text-[0.6rem] leading-tight text-slate-400">
              כל היום
            </div>
            {days.map((day, dayIndex) => (
              <div key={day.toDateString()} className="flex min-h-8 flex-1 flex-col gap-0.5 border-s border-slate-100 p-0.5">
                {meetings.map((meeting) => {
                  if (!meeting.allDay || !allDayCovers(rangeOf(meeting).startsAt, rangeOf(meeting).endsAt, day)) {
                    return null;
                  }
                  return (
                    <button
                      key={meeting.id}
                      type="button"
                      title={meeting.title}
                      onPointerDown={(event) => beginAllDayDrag(event, meeting, dayIndex)}
                      className={`truncate rounded bg-blue-600 px-1 py-0.5 text-start text-[0.65rem] text-white touch-none hover:bg-blue-700 ${
                        allDayDrag?.id === meeting.id ? 'opacity-70' : ''
                      }`}
                    >
                      {meeting.title}
                    </button>
                  );
                })}
                {googleEvents.map((event) => {
                  if (!event.allDay || !allDayCovers(eventDate(event.startsAt), eventDate(event.endsAt), day)) {
                    return null;
                  }
                  return (
                    <div
                      key={event.id}
                      title={event.title}
                      className="truncate rounded bg-slate-200 px-1 py-0.5 text-[0.65rem] text-slate-700"
                    >
                      {event.title}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        </div>

        <div className="relative flex">
          <div
            className="sticky start-0 z-10 w-14 shrink-0 bg-white"
            style={{ height: 24 * HOUR_PX }}
          >
            {Array.from({ length: 24 }, (_, hour) => (
              <span
                key={hour}
                className="absolute end-2 -translate-y-1/2 text-[0.65rem] text-slate-400"
                style={{ top: hour * HOUR_PX }}
              >
                {hour === 0 ? '' : clock(hour * 60)}
              </span>
            ))}
          </div>

          <div
            className="relative grid flex-1"
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
          >
            {days.map((day, dayIndex) => {
              const blocks = blocksOn(day, meetings, googleEvents);
              const placed = new Map(placeEvents(blocks).map((item) => [item.id, item]));
              const isToday = isSameDay(day, today);

              return (
                <div
                  key={day.toDateString()}
                  ref={(node) => {
                    columnsRef.current[dayIndex] = node;
                  }}
                  onPointerDown={(event) => beginCreate(event, day)}
                  className={`relative border-s border-slate-200 ${isToday ? 'bg-blue-50/40' : ''}`}
                  style={{ height: 24 * HOUR_PX }}
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <div key={hour} className="border-t border-slate-200" style={{ height: HOUR_PX }}>
                      <div className="h-1/2 border-b border-slate-100" />
                    </div>
                  ))}

                  {blocks.map((block) => {
                    const spot = placed.get(block.id);
                    if (!spot) return null;
                    const top = (block.start / DAY_MINUTES) * 100;
                    const height = (Math.max(block.end - block.start, SNAP_MINUTES) / DAY_MINUTES) * 100;
                    const style = {
                      top: `${top}%`,
                      height: `${height}%`,
                      minHeight: 22,
                      insetInlineStart: `calc(${(spot.column / spot.columns) * 100}% + 2px)`,
                      width: `calc(${100 / spot.columns}% - 4px)`,
                    };

                    if (block.kind === 'google') {
                      return (
                        <div
                          key={block.id}
                          data-event
                          title={block.title}
                          className="absolute z-20 overflow-hidden rounded border border-slate-300 bg-slate-200 px-1 py-0.5 text-[0.65rem] text-slate-700"
                          style={style}
                        >
                          <span className="font-medium">{clock(block.start)}</span> {block.title}
                        </div>
                      );
                    }

                    const meeting = block.meeting;
                    return (
                      <button
                        key={meeting.id}
                        type="button"
                        data-event
                        title={`${clock(block.start)} ${meeting.title}`}
                        onPointerDown={(event) => beginDrag(event, meeting, dayIndex, block.start)}
                        className={`absolute z-20 cursor-grab overflow-hidden rounded bg-blue-600 px-1 py-0.5 text-start text-[0.65rem] text-white touch-none hover:bg-blue-700 ${
                          drag?.id === meeting.id ? 'opacity-40' : ''
                        }`}
                        style={style}
                      >
                        <span className="font-medium">{clock(block.start)}</span> {meeting.title}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {includesToday && (
            <div
              className="pointer-events-none absolute start-14 end-0 z-10 border-t-2 border-red-500"
              style={{ top: (nowMinutes / DAY_MINUTES) * 24 * HOUR_PX }}
            />
          )}
        </div>
      </div>

      {drag && dragged && (
        <div
          className="pointer-events-none fixed z-30 overflow-hidden rounded bg-blue-600 px-1 py-0.5 text-start text-[0.65rem] text-white shadow-lg"
          style={{ top: drag.top, left: drag.left, width: drag.width, height: drag.height }}
        >
          <span className="font-medium">{clock(drag.start)}</span> {dragged.title}
        </div>
      )}
    </div>
  );
}

type Block =
  | { id: string; start: number; end: number; kind: 'meeting'; meeting: Meeting }
  | { id: string; start: number; end: number; kind: 'google'; title: string };

function blocksOn(day: Date, meetings: Meeting[], googleEvents: GoogleEvent[]): Block[] {
  const blocks: Block[] = [];
  for (const meeting of meetings) {
    if (meeting.allDay) continue;
    const span = minutesOnDay(new Date(meeting.startsAt), new Date(meeting.endsAt), day);
    if (!span) continue;
    blocks.push({ id: meeting.id, start: span.start, end: span.end, kind: 'meeting', meeting });
  }
  for (const event of googleEvents) {
    if (event.allDay) continue;
    const span = minutesOnDay(eventDate(event.startsAt), eventDate(event.endsAt), day);
    if (!span) continue;
    blocks.push({
      id: `google-${event.id}`,
      start: span.start,
      end: span.end,
      kind: 'google',
      title: event.title,
    });
  }
  return blocks;
}
