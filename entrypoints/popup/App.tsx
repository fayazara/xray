import { useEffect, useState } from 'react';
import {
  enabledItem,
  displayModeItem,
  newAccountEnabledItem,
  newAccountDaysItem,
  followsYouEnabledItem,
  NEW_ACCOUNT_OPTIONS,
  type DisplayMode,
} from '@/utils/settings';
import './App.css';

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="knob" />
    </button>
  );
}

function App() {
  const [enabled, setEnabled] = useState(true);
  const [mode, setMode] = useState<DisplayMode>('full');
  const [newEnabled, setNewEnabled] = useState(false);
  const [newDays, setNewDays] = useState(30);
  const [followsYou, setFollowsYou] = useState(false);

  useEffect(() => {
    enabledItem.getValue().then(setEnabled);
    displayModeItem.getValue().then(setMode);
    newAccountEnabledItem.getValue().then(setNewEnabled);
    newAccountDaysItem.getValue().then(setNewDays);
    followsYouEnabledItem.getValue().then(setFollowsYou);
  }, []);

  return (
    <div className="xray-popup">
      <div className="row header-row">
        <div className="row-text">
          <h1>XRay</h1>
          <p className="subtitle">
            {enabled ? 'Profile insights in your timeline' : 'Paused on all tabs'}
          </p>
        </div>
        <Toggle
          checked={enabled}
          label="Enable XRay"
          onChange={(v) => {
            setEnabled(v);
            enabledItem.setValue(v);
          }}
        />
      </div>

      <hr className="divider" />

      <fieldset className={`settings ${enabled ? '' : 'disabled'}`} disabled={!enabled}>

      <div className="field">
        <span className="field-label">Display style</span>
        <div className="segmented" role="radiogroup" aria-label="Display style">
          <button
            role="radio"
            aria-checked={mode === 'full'}
            className={mode === 'full' ? 'active' : ''}
            onClick={() => {
              setMode('full');
              displayModeItem.setValue('full');
            }}
          >
            1.2K followers
          </button>
          <button
            role="radio"
            aria-checked={mode === 'compact'}
            className={mode === 'compact' ? 'active' : ''}
            onClick={() => {
              setMode('compact');
              displayModeItem.setValue('compact');
            }}
          >
            1.2K
          </button>
        </div>
      </div>

      <div className="row">
        <div className="row-text">
          <span className="field-label">New account badge</span>
          <span className="hint">Flag accounts younger than the threshold</span>
        </div>
        <Toggle
          checked={newEnabled}
          onChange={(v) => {
            setNewEnabled(v);
            newAccountEnabledItem.setValue(v);
          }}
        />
      </div>

      {newEnabled && (
        <div className="field indented">
          <span className="field-label">Younger than</span>
          <div className="select-wrap">
            <select
              className="select"
              value={newDays}
              onChange={(e) => {
                const v = Number(e.target.value);
                setNewDays(v);
                newAccountDaysItem.setValue(v);
              }}
            >
              {NEW_ACCOUNT_OPTIONS.map((o) => (
                <option key={o.days} value={o.days}>
                  {o.label}
                </option>
              ))}
            </select>
            <svg
              className="select-chevron"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
      )}

      <div className="row">
        <div className="row-text">
          <span className="field-label">"Follows you" badge</span>
          <span className="hint">Show who already follows you</span>
        </div>
        <Toggle
          checked={followsYou}
          onChange={(v) => {
            setFollowsYou(v);
            followsYouEnabledItem.setValue(v);
          }}
        />
      </div>

      <div className="personal-notes-tip">
        <svg
          viewBox="0 0 24 24"
          width="17"
          height="17"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 13 13 20l-9-9V4h7l9 9Z" />
          <circle cx="8.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
        </svg>
        <div className="row-text">
          <span className="field-label">Personal tags &amp; notes</span>
          <span className="hint">Click any XRay follower count to add one</span>
        </div>
      </div>
      </fieldset>

      <hr className="divider" />

      <footer className="footer">
        <a
          href="https://github.com/fayazara/xray"
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg
            viewBox="0 0 16 16"
            width="16"
            height="16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          <span>fayazara/xray</span>
        </a>
      </footer>
    </div>
  );
}

export default App;
