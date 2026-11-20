import { useState, type ReactNode } from 'react';
import { RoomsPicker } from '@/components/search/RoomsPicker';
import type { A2UIComponent } from './assistant';
import { actionText } from './chat-actions';
import { SavedListings } from './SavedListings';

type Model = Record<string, string | string[]>;

/**
 * Renders one A2UI v1 surface with the chat's own controls.
 *
 * TextField, ChoicePicker, Button and the layout components are enough for the
 * valuation sheet. Anything else is skipped rather than guessed.
 */
export function A2UISurface({
  components,
  dataModel,
  pending,
  onAction,
}: {
  components: A2UIComponent[];
  dataModel: Model;
  pending: boolean;
  onAction: (text: string) => void;
}) {
  const [model, setModel] = useState<Model>(dataModel);
  const [sent, setSent] = useState(false);
  const byId = new Map(components.map((component) => [component.id, component]));
  const root = byId.get('root');
  if (!root) return null;

  const write = (path: string, value: string | string[]) => {
    setModel((current) => ({ ...current, [path.replace(/^\//, '')]: value }));
  };

  const submit = (component: A2UIComponent) => {
    const context = component.action?.event?.context ?? {};
    const resolved: Record<string, unknown> = {};
    for (const [key, binding] of Object.entries(context)) {
      resolved[key] = model[binding['@path'].replace(/^\//, '')] ?? '';
    }
    const text = actionText(component.action?.event?.name ?? '', resolved);
    if (!text || pending || sent) return;
    setSent(true);
    onAction(text);
  };

  return (
    <form
      className="u365-a2ui"
      onSubmit={(event) => {
        event.preventDefault();
        const button = components.find((component) => component.component === 'Button' && component.action?.event);
        if (button) submit(button);
      }}
    >
      {renderNode(root, byId, model, write, submit, pending || sent)}
    </form>
  );
}

function renderNode(
  component: A2UIComponent,
  byId: Map<string, A2UIComponent>,
  model: Model,
  write: (path: string, value: string | string[]) => void,
  submit: (component: A2UIComponent) => void,
  locked: boolean,
): ReactNode {
  const children = (component.children ?? []).map((id) => byId.get(id)).filter((child): child is A2UIComponent => Boolean(child));

  if (component.component === 'Row') {
    return (
      <div className="u365-a2ui-row" key={component.id}>
        {children.map((child) => renderNode(child, byId, model, write, submit, locked))}
      </div>
    );
  }

  if (component.component === 'Column') {
    return (
      <div className="u365-a2ui-col" key={component.id}>
        {children.map((child, index) => (
          <div key={child.id} className="u365-a2ui-line" style={{ animationDelay: `${120 + index * 38}ms` }}>
            {renderNode(child, byId, model, write, submit, locked)}
          </div>
        ))}
      </div>
    );
  }

  if (component.component === 'Card') {
    const child = component.child ? byId.get(component.child) : undefined;
    return <div className="u365-a2ui-card">{child ? renderNode(child, byId, model, write, submit, locked) : null}</div>;
  }

  if (component.component === 'Divider') {
    return <hr className="u365-a2ui-rule" key={component.id} />;
  }

  if (component.component === 'List') {
    return (
      <ul className="u365-a2ui-list" key={component.id}>
        {children.map((child, index) => (
          <li key={child.id} className="u365-a2ui-line" style={{ animationDelay: `${180 + index * 38}ms` }}>
            {renderNode(child, byId, model, write, submit, locked)}
          </li>
        ))}
      </ul>
    );
  }

  if (component.component === 'Text') {
    const className =
      component.variant === 'caption' ? 'u365-a2ui-caption' : component.variant === 'body' ? 'u365-a2ui-body' : 'u365-a2ui-title';
    return (
      <p className={className} key={component.id}>
        {component.text}
      </p>
    );
  }

  if (component.component === 'SavedListings') {
    return <SavedListings key={component.id} />;
  }

  if (component.component === 'RoomsRange') {
    const minText = typeof model.roomsMin === 'string' ? model.roomsMin : '';
    const maxText = typeof model.roomsMax === 'string' ? model.roomsMax : '';
    const min = minText === '' ? undefined : Number(minText);
    const max = maxText === '' ? undefined : Number(maxText);
    return (
      <div className="u365-rooms" key={component.id} style={locked ? { pointerEvents: 'none', opacity: 0.6 } : undefined}>
        <RoomsPicker
          legend={component.label ?? 'חדרים'}
          min={min !== undefined && Number.isFinite(min) ? min : undefined}
          max={max !== undefined && Number.isFinite(max) ? max : undefined}
          onChange={(next) => {
            write('/roomsMin', next.min === undefined ? '' : String(next.min));
            write('/roomsMax', next.max === undefined ? '' : String(next.max));
          }}
        />
      </div>
    );
  }

  if (component.component === 'TextField') {
    const key = component.value?.['@path']?.replace(/^\//, '') ?? component.id;
    const value = typeof model[key] === 'string' ? model[key] : '';
    return (
      <label className="u365-a2ui-field" key={component.id}>
        <span>{component.label}</span>
        <input
          value={value}
          placeholder={component.placeholder}
          inputMode={component.variant === 'number' ? 'numeric' : 'text'}
          disabled={locked}
          onChange={(event) => write(`/${key}`, component.variant === 'number' ? event.target.value.replace(/[^\d.]/g, '') : event.target.value)}
        />
      </label>
    );
  }

  if (component.component === 'ChoicePicker') {
    const key = component.value?.['@path']?.replace(/^\//, '') ?? component.id;
    const selected = Array.isArray(model[key]) ? model[key][0] ?? '' : '';
    return (
      <label className="u365-a2ui-field" key={component.id}>
        <span>{component.label}</span>
        <select value={selected} disabled={locked} onChange={(event) => write(`/${key}`, event.target.value ? [event.target.value] : [])}>
          <option value="">לא צוין</option>
          {(component.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (component.component === 'Button') {
    const child = component.child ? byId.get(component.child) : undefined;
    const label = child?.text ?? component.label ?? 'שליחה';
    if (component.href) {
      return (
        <a className="u365-a2ui-link" href={component.href} key={component.id}>
          {label}
        </a>
      );
    }
    return (
      <button type="submit" className="u365-a2ui-submit" disabled={locked} key={component.id}>
        {label}
      </button>
    );
  }

  return null;
}
