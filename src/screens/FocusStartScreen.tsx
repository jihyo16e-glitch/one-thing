import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useApp } from '../app/AppContext';
import { enterFullscreen, requestWake } from '../app/focusDevice';
import { canLockFocus, lockReady, lockStatus, openOverlaySettings, openUsageSettings, startLock, type LockStatus } from '../app/focusLock';
import { deletePicture, loadPicture, savePicture } from '../data/media';
import { getDay, todayKey } from '../domain/rules';
import { Icon } from '../ui/Icon';
import { Mascot } from '../ui/Mascot';

const LENGTHS = [25, 50, 90];
const MAX_PICTURE_BYTES = 10 * 1024 * 1024;

// Module level, because this screen unmounts on every tab change while the context picture stays.
// `shown` = the blob: URL this screen put into the context, and the saved pictureId it is in sync
// with. A picture whose save failed is in sync with the id that was saved before it (or null), so
// it stays for this session and the next start brings the saved one back. `pickSeq` goes up on
// every pick and every Remove, so a slow save or load that finishes late cannot overwrite a newer choice.
let shown: { url: string; id: string | null } | null = null;
let pickSeq = 0;

function forget(id: string | null) {
  if (id) deletePicture(id).catch(() => { /* an orphan record is harmless; the id is already cleared */ });
}

export function FocusStartScreen() {
  const { data, commit, go, toast, picture, setPicture, setFocus } = useApp();
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const day = getDay(data, todayKey(data));
  const one = day && day.one.text ? day.one.text : '';
  const f = data.settings.focus;

  // APK: the two switches the focus lock needs. Checked again when you come back from the phone settings.
  const [lock, setLock] = useState<LockStatus>({ overlay: false, usage: false, running: false });
  useEffect(() => {
    if (!canLockFocus()) return;
    const check = () => { lockStatus().then(setLock); };
    check();
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Show the saved picture: after a reload the context picture is null but settings.focus.pictureId
  // still points at the IndexedDB record. Also re-syncs when the saved id was changed elsewhere
  // (a backup import) while the context still shows the picture this screen loaded before.
  useEffect(() => {
    const id = f.pictureId;
    const stale = picture !== null && shown !== null && shown.url === picture.url && shown.id !== id;
    if (picture && !stale) return;
    // No setting points at the old record any more, so it would only take space.
    const staleId = stale && shown ? shown.id : null;
    if (!id) {
      if (picture) { URL.revokeObjectURL(picture.url); setPicture(null); shown = null; forget(staleId); }
      return;
    }
    const seq = pickSeq;
    const oldUrl = picture ? picture.url : null;
    let cancelled = false;
    loadPicture(id).then(
      (rec) => {
        if (cancelled || seq !== pickSeq) return;
        if (!rec) {
          // The record is gone (site data cleared, or a backup from another phone): back to the seed.
          commit((d) => { if (d.settings.focus.pictureId === id) d.settings.focus.pictureId = null; });
          return;
        }
        const url = URL.createObjectURL(rec.blob);
        shown = { url, id };
        setPicture({ url, name: rec.name });
        if (oldUrl) URL.revokeObjectURL(oldUrl);
        forget(staleId);
      },
      () => { /* IndexedDB failed: keep the id so the next visit can try again; the seed shows meanwhile */ },
    );
    return () => { cancelled = true; };
  }, [f.pictureId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The picture is the user's own image or GIF from the phone. The original Blob goes to IndexedDB
  // (never re-encoded, so GIFs stay animated); only its id goes into settings.focus.pictureId.
  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { setNote('Pick an image or a GIF.'); return; }
    if (file.size > MAX_PICTURE_BYTES) { setNote('This file is bigger than 10 MB. Pick a smaller image or GIF.'); return; }
    const seq = ++pickSeq;
    if (picture) URL.revokeObjectURL(picture.url);
    const url = URL.createObjectURL(file);
    // In sync with the current saved id until the save succeeds, so a visit to this screen during
    // the save (or after a failed save) does not load the old record over the new pick.
    shown = { url, id: f.pictureId };
    setPicture({ url, name: file.name });
    setNote('');

    let newId: string | null = null;
    try {
      newId = await savePicture(file, file.name);
    } catch {
      newId = null;
    }
    if (seq !== pickSeq) { forget(newId); return; } // a newer pick or a Remove came first
    if (!newId) {
      // Not saved (phone storage full, IndexedDB blocked). The saved state did not change: the old
      // record and settings.focus.pictureId stay, so the next app start shows the old picture again.
      toast('Picture shown, but not saved on this phone.');
      return;
    }
    if (shown && shown.url === url) shown.id = newId;
    // Replace: the new record exists, so the old one is deleted.
    const oldId = commit((d) => {
      const prev = d.settings.focus.pictureId;
      d.settings.focus.pictureId = newId;
      return prev;
    });
    if (oldId !== newId) forget(oldId);
    toast('Focus picture set.');
  }

  function removePicture() {
    pickSeq++;
    if (picture) URL.revokeObjectURL(picture.url);
    setPicture(null);
    shown = null;
    const oldId = commit((d) => {
      const prev = d.settings.focus.pictureId;
      d.settings.focus.pictureId = null;
      return prev;
    });
    forget(oldId);
    setNote('');
    toast('Back to the seed.');
  }

  function start() {
    if (!one) { toast('Pick your ONE thing first.'); return; }
    if (f.keepAwake) requestWake();
    if (f.fullScreen) enterFullscreen(); // from the tap itself, or the browser refuses
    const endsAt = Date.now() + f.minutes * 60000;
    setFocus({ minutes: f.minutes, endsAt, asking: false, timeUp: false });
    if (canLockFocus() && lockReady(lock)) {
      startLock(endsAt).then((ok) => { if (!ok) toast('Focus lock did not start. Focus runs without it.'); });
    }
  }

  const back = (
    <button type="button" className="btn btn-sm btn-quiet" style={{ alignSelf: 'flex-start' }} onClick={() => go('today')}>
      <Icon name="back" size={20} width={2} />
      <span>Today</span>
    </button>
  );

  if (!one) {
    return (
      <>
        {back}
        <header className="head"><h1>Focus mode</h1></header>
        <div className="notice">
          <p>Pick your ONE thing first. Focus mode keeps you on it.</p>
          <div className="btn-row">
            <button type="button" className="btn btn-sm btn-dark" onClick={() => go('today')}>Go to Today</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {back}
      <header className="head"><h1>Focus mode</h1></header>

      <section className="card" style={{ gap: 4, padding: 16 }} aria-label="Your ONE thing">
        <p className="eyebrow">Your ONE thing</p>
        <p className="one-text" style={{ fontSize: 18 }}>{one}</p>
      </section>

      <section className="stack" aria-label="How long">
        <h2>How long?</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
          {LENGTHS.map((m) => (
            <button
              key={m}
              type="button"
              className={'btn ' + (f.minutes === m ? ' btn-chosen' : '')}
              aria-pressed={f.minutes === m}
              onClick={() => commit((d) => { d.settings.focus.minutes = m; })}
            >
              {m} min
            </button>
          ))}
        </div>
      </section>

      {/* Right under the length: new users had to scroll past the lock how-to to find it (first-use test D1). */}
      <button type="button" className="btn btn-primary btn-block" onClick={start}>Start {f.minutes} minutes</button>

      <section className="stack" aria-label="Focus picture">
        <h2>Focus picture</h2>
        <div className="card" style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 14 }}>
          <div className="pic-tile">
            {picture ? <img src={picture.url} alt="Your focus picture" /> : <Mascot mood="idle" size={76} pad={20} />}
          </div>
          <div className="stack" style={{ flex: 1, minWidth: 0, gap: 8 }}>
            <span className="sub" style={{ overflowWrap: 'anywhere' }}>
              {picture ? picture.name : 'The seed (default). Or pick your own image or GIF from your phone.'}
            </span>
            <div className="btn-row">
              <button type="button" className="btn btn-sm" onClick={() => { if (fileRef.current) { fileRef.current.value = ''; fileRef.current.click(); } }}>
                {picture ? 'Change' : 'Choose from phone'}
              </button>
              {picture && <button type="button" className="btn btn-sm btn-quiet" onClick={removePicture}>Remove</button>}
            </div>
          </div>
        </div>
        <input ref={fileRef} type="file" id="pic-file" accept="image/*" hidden onChange={onFile} />
        {note && <p className="sub" role="status" style={{ color: 'var(--warn-ink)', fontWeight: 700 }}>{note}</p>}
      </section>

      {canLockFocus() ? (
        <section className={lockReady(lock) ? 'card' : 'notice'} aria-label="Focus lock">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="lock" size={20} />
            <span>Focus lock</span>
          </h2>
          {lockReady(lock) ? (
            <p style={{ margin: 0 }}>
              Ready. During focus, if you leave One Thing (Home, other apps, Settings), it comes right back.
              Only <strong>Stop</strong> or <strong>I finished it</strong> ends focus. Calls still work.
            </p>
          ) : (
            <>
              <p style={{ margin: 0 }}>Switch on 2 things once, so One Thing can keep you in focus:</p>
              <div className="lock-switch">
                <span>1. Display over other apps</span>
                {lock.overlay ? <span className="badge badge-accent">On</span> : <button type="button" className="btn btn-sm" onClick={openOverlaySettings}>Turn on</button>}
              </div>
              <div className="lock-switch">
                <span>2. Usage access</span>
                {lock.usage ? <span className="badge badge-accent">On</span> : <button type="button" className="btn btn-sm" onClick={openUsageSettings}>Turn on</button>}
              </div>
              <p className="sub" style={{ margin: 0 }}>On each page, find One Thing, switch it on, then come back here.</p>
            </>
          )}
        </section>
      ) : (
        <section className="notice" aria-label="Lock the phone to this screen">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="lock" size={20} />
            <span>Lock the phone to this screen</span>
          </h2>
          <ol className="lock-steps">
            <li>One time: open <strong>Settings</strong>, search <strong>{'“pin”'}</strong>, turn on <strong>App pinning</strong> and <strong>Ask for PIN before unpinning</strong>.</li>
            <li>After you tap Start: open <strong>Recent apps</strong>, tap the One Thing icon, then tap <strong>Pin</strong>.</li>
          </ol>
          <p className="sub" style={{ color: 'var(--warn-ink)' }}>Then Home and other apps stay blocked until you unpin with your PIN.</p>
        </section>
      )}

      <div className="stack" style={{ gap: 2 }}>
        <label className="check-row">
          <input type="checkbox" id="focus-awake" checked={f.keepAwake} onChange={(e) => commit((d) => { d.settings.focus.keepAwake = e.target.checked; })} />
          <span>Keep the screen on</span>
        </label>
        <label className="check-row">
          <input type="checkbox" id="focus-full" checked={f.fullScreen} onChange={(e) => commit((d) => { d.settings.focus.fullScreen = e.target.checked; })} />
          <span>Full screen (hide the phone bars)</span>
        </label>
      </div>
    </>
  );
}
